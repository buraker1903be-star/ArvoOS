/*
  CARİ ÖDEME BAĞLANTISI.

  Eskiden PayTR bağlantısı yalnızca bir taksite bağlanabiliyordu (Finans →
  PAYTR Tahsilatları): müşteri "şimdilik 5.000 TL ödeyeyim" dediğinde
  karşılığı olan bir taksit yoksa bağlantı oluşturulamıyordu. Artık cari
  hesaplar sayfasından, müşterinin söylediği tutarla bağlantı açılıyor;
  ödeme gelince tutar o cariye tahsilat olarak işleniyor.

  party_id + organization_id birlikte cariye bağlanıyor: başka kurumun
  carisine bağlantı açılamasın (account_entries ile aynı kalıp).
*/
alter table public.payment_links add column if not exists party_id uuid;
alter table public.payment_links add column if not exists note text;

alter table public.payment_links add constraint payment_links_party_org_fk
  foreign key (party_id, organization_id) references public.account_parties(id, organization_id) on delete cascade;
alter table public.payment_links add constraint payment_links_note_check check (note is null or char_length(note) <= 200);

alter table public.payment_links drop constraint payment_links_purpose_check;
alter table public.payment_links add constraint payment_links_purpose_check CHECK ((((purpose = 'installment'::text) AND (installment_id IS NOT NULL)) OR ((purpose = 'subscription'::text) AND (product IS NOT NULL) AND (product = ANY (ARRAY['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text])) AND (((payer_organization_id IS NOT NULL) AND (plan_code IS NOT NULL)) OR (subscriber_id IS NOT NULL)) AND (NOT ((payer_organization_id IS NOT NULL) AND (subscriber_id IS NOT NULL)))) OR ((purpose = 'ai_credit'::text) AND (payer_organization_id IS NOT NULL)) OR ((purpose = 'account'::text) AND (party_id IS NOT NULL))));

create index if not exists payment_links_party_idx on public.payment_links (party_id, created_at desc) where party_id is not null;

/*
  Ödeme bildirimi: 'account' amacı için cari dalı. Gövdenin geri kalanı
  canlıdakiyle aynı (supabase/schema/canli-sema.sql, 08.10.2026).
*/
CREATE OR REPLACE FUNCTION public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_link public.payment_links%rowtype;
  v_product text;
  v_party uuid;
  v_installment_no integer;
  v_contract_no text;
  v_event uuid;
  v_entry uuid;
  v_request uuid;
  v_order public.ai_credit_orders%rowtype;
  v_plan public.plan_code;
begin
  if p_payment_link_id is null or coalesce(p_merchant_oid, '') = '' then
    return 'invalid';
  end if;

  select * into v_link from public.payment_links where id = p_payment_link_id for update;
  if not found then
    return 'not_found';
  end if;

  insert into public.payment_provider_events(provider, merchant_oid, organization_id, payment_link_id, total_amount, payment_amount, currency, test_mode, result, payload)
  values ('paytr', p_merchant_oid, v_link.organization_id, v_link.id, p_total_amount, p_payment_amount, p_currency, coalesce(p_test_mode, false),
          case when coalesce(p_test_mode, false) then 'test' else 'recorded' end, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, merchant_oid) do nothing
  returning id into v_event;
  if v_event is null then
    return 'duplicate';
  end if;

  -- Test ödemesi: bağlantının çalıştığını gösterir; cariye/lisansa dokunmaz.
  if coalesce(p_test_mode, false) then
    update public.organization_payment_providers
    set last_test_payment_at = now()
    where organization_id = v_link.organization_id and provider = 'paytr';
    return 'test';
  end if;

  if coalesce(p_payment_amount, 0) <= 0 then
    update public.payment_provider_events set result = 'invalid_amount' where id = v_event;
    return 'invalid_amount';
  end if;

  /*
    AI kredisi. Eskiden 'subscription' olmayan her şey taksit sayılıyordu;
    bu amaç o dala düşseydi 'no_party' ile reddedilirdi.

    Kredi ArvoLab'ın veritabanında ve buradan ulaşılamıyor: yükleme
    bildirimi alan yolda yapılıyor (app/api/paytr/callback). Burada
    yalnızca ödeme kaydı yazılıyor ki tahsilat raporlarında görünsün;
    "para alındı ama kredi yüklenmedi" durumu ai_credit_orders.loaded_at
    ile izleniyor.
  */
  if v_link.purpose = 'ai_credit' then
    -- Eksik ödeme kredi yüklemez (bağlantı tutarı sunucuda belirlendi).
    if p_payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_event;
      return 'amount_mismatch';
    end if;

    select * into v_order from public.ai_credit_orders where payment_link_id = v_link.id;
    if v_order.id is null then
      update public.payment_provider_events set result = 'no_order' where id = v_event;
      return 'no_order';
    end if;

    /*
      Kredi satışı da gelirdir; tahsilat listesinde görünmeli.

      plan_code ve submitted_by bu tabloda NOT NULL. Kredi satışının bir
      paketi yok, o yüzden kurumun YÜRÜRLÜKTEKİ paketi yazılıyor —
      "hangi paketteki müşteri kredi alıyor" sorusu da böylece
      yanıtlanabiliyor. Null geçilseydi kayıt düşer ve ödeme alınmış
      olmasına rağmen hiçbir yerde görünmezdi.
    */
    select coalesce(l.plan_code, o.plan_code) into v_plan
      from public.organizations o
      left join public.organization_licenses l on l.organization_id = o.id
     where o.id = v_order.organization_id;

    insert into public.organization_payment_requests (
      organization_id, bank_account_id, plan_code, product, amount, currency, payment_method, status,
      receipt_path, reference_no, review_note, submitted_by, reviewed_at, updated_at
    ) values (
      v_order.organization_id, null, coalesce(v_plan, 'starter'::public.plan_code), 'arvolab',
      p_payment_amount, 'TRY', 'paytr', 'approved',
      null, left('PAYTR-' || p_merchant_oid, 120),
      'AI kredisi satın alındı (' || v_order.kredi || ' kredi), otomatik onaylandı',
      coalesce(v_link.created_by, v_order.created_by), now(), now()
    );

    update public.payment_links set status = 'paid', paid_at = now() where id = v_link.id;
    update public.organization_payment_providers
    set last_payment_at = now()
    where organization_id = v_link.organization_id and provider = 'paytr';
    return 'recorded';
  end if;

  if v_link.purpose = 'subscription' then
    -- Eksik ödeme lisans açmaz (bağlantı tutarı sunucuda belirlenir).
    if p_payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_event;
      return 'amount_mismatch';
    end if;

    v_product := coalesce(v_link.product, 'arvoos');

    if v_link.subscriber_id is not null then
      -- Bireysel abone: kurum kaydı yok, ödeme kendi geçmişine yazılır.
      perform private.arvo_activate_subscriber_period(
        v_link.subscriber_id, p_payment_amount, 'TRY', 'paytr', p_merchant_oid
      );
    else
      insert into public.organization_payment_requests (
        organization_id, bank_account_id, plan_code, product, amount, currency, payment_method, status,
        receipt_path, reference_no, review_note, submitted_by, reviewed_at, updated_at
      ) values (
        v_link.payer_organization_id, null, v_link.plan_code, v_product, p_payment_amount, 'TRY', 'paytr', 'approved',
        null, left('PAYTR-' || p_merchant_oid, 120), 'PayTR ile ödendi, otomatik onaylandı', v_link.created_by, now(), now()
      )
      returning id into v_request;

      if v_product = 'arvoos' then
        perform private.arvo_activate_license_period(
          v_link.payer_organization_id, v_link.plan_code, p_payment_amount, 'TRY', 'paytr', v_link.created_by
        );
      else
        perform private.arvo_activate_product_period(
          v_link.payer_organization_id, v_product, v_link.plan_code, p_payment_amount, 'TRY', 'paytr', v_link.created_by
        );
      end if;
    end if;
  elsif v_link.purpose = 'account' then
    /*
      Cari ödeme bağlantısı: tutarı müşterinin söylediği rakam, bir taksite
      bağlı değil. Eksik ödeme reddedilmiyor; ne geldiyse cariye o yazılır
      (taksit dalıyla aynı). Kapanan taksitleri arvo_account_entry_reconcile
      tetikleyicisi buluyor.
    */
    if v_link.party_id is null then
      update public.payment_provider_events set result = 'no_party' where id = v_event;
      return 'no_party';
    end if;

    insert into public.account_entries(organization_id, party_id, entry_type, source_type, amount, currency, description, reference_no, transaction_date, created_by)
    values (
      v_link.organization_id, v_link.party_id, 'credit', 'payment', p_payment_amount, 'TRY',
      left('PayTR tahsilatı · ' || coalesce(nullif(trim(v_link.note), ''), 'ödeme bağlantısı'), 500),
      left('PAYTR-' || p_merchant_oid, 100),
      (now() at time zone 'Europe/Istanbul')::date,
      v_link.created_by
    )
    returning id into v_entry;
    update public.payment_provider_events set account_entry_id = v_entry where id = v_event;
  else
    select p.party_id, i.installment_no, c.contract_no
    into v_party, v_installment_no, v_contract_no
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    left join public.crm_contracts c on c.id = p.contract_id
    where i.id = v_link.installment_id;

    if v_party is null then
      update public.payment_provider_events set result = 'no_party' where id = v_event;
      return 'no_party';
    end if;

    insert into public.account_entries(organization_id, party_id, entry_type, source_type, amount, currency, description, reference_no, transaction_date, created_by)
    values (
      v_link.organization_id, v_party, 'credit', 'payment', p_payment_amount, 'TRY',
      left(format('PayTR tahsilatı · %s %s. taksit', coalesce(v_contract_no, 'Sözleşme'), v_installment_no), 500),
      left('PAYTR-' || p_merchant_oid, 100),
      (now() at time zone 'Europe/Istanbul')::date,
      v_link.created_by
    )
    returning id into v_entry;
    -- arvo_account_entry_reconcile tetikleyicisi bekleyen taksitleri kapatır.
    update public.payment_provider_events set account_entry_id = v_entry where id = v_event;
  end if;

  update public.payment_links set status = 'paid', paid_at = now() where id = v_link.id;
  update public.organization_payment_providers
  set last_payment_at = now()
  where organization_id = v_link.organization_id and provider = 'paytr';
  return 'recorded';
end
$function$
;

revoke all on function public.arvo_record_paytr_payment(uuid, text, bigint, bigint, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.arvo_record_paytr_payment(uuid, text, bigint, bigint, text, boolean, jsonb) to service_role;
