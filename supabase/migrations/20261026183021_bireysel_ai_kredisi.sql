-- BİREYSEL ABONEYE AI KREDİSİ SATIŞI (26.10.2026, kurum sahibinin kararı:
-- bireysel aboneye her ay 1.000 kredi dahil, biterse kurumla aynı paketlerden
-- ek kredi).
--
-- Kredi satışı bugüne kadar yalnızca kuruma yapılıyordu: ai_credit_orders
-- kurum zorunluydu, ödeme bağlantısının 'ai_credit' amacı payer_organization_id
-- istiyordu. Bireysel abonenin ArvoOS paneli yok; krediyi ArvoLab'ın
-- "Abonelik ve kredi" sayfasından alıyor ve istek abonelik köprüsüyle
-- (app/api/bridge/subscription, action "credit_checkout") geliyor.
--
-- Kredinin kendisi ArvoLab'da (migration 20261026181929,
-- ai_bireysel_kredi_yukle); buradan yalnızca sipariş ve tahsilat.
--
-- Bu migration ArvoOS projesi içindir.
do $kontrol$
begin
  if to_regclass('public.payment_links') is null or to_regclass('public.ai_credit_orders') is null then
    raise exception 'Bu migration ArvoOS projesi içindir. Açık olan proje ArvoOS değil.';
  end if;
end
$kontrol$;

-- ---------------------------------------------------------------------------
-- 1) Sipariş: kurum YA DA bireysel abone, ikisi birden değil
-- ---------------------------------------------------------------------------
alter table public.ai_credit_orders alter column organization_id drop not null;
alter table public.ai_credit_orders
  add column if not exists subscriber_id uuid references public.product_subscribers(id) on delete cascade;

alter table public.ai_credit_orders drop constraint if exists ai_credit_orders_sahibi_check;
alter table public.ai_credit_orders add constraint ai_credit_orders_sahibi_check
  check ((organization_id is null) <> (subscriber_id is null));

create index if not exists ai_credit_orders_abone_idx
  on public.ai_credit_orders (subscriber_id, created_at desc) where subscriber_id is not null;

/*
  RLS aynı kalıyor: okuma politikası kurum üyeliğine bakıyor, bireysel
  siparişi panelde okuyan kimse yok (abonenin paneli yok); yazma zaten
  yalnızca service_role.
*/

-- ---------------------------------------------------------------------------
-- 2) Ödeme bağlantısı: 'ai_credit' bireysel aboneyle de açılabilir
-- ---------------------------------------------------------------------------
/*
  Kısıtın diğer dalları 20261008141602'deki tanımın AYNISI; yalnızca
  ai_credit dalı genişliyor: kurum ya da abone, ikisi birden değil.
*/
alter table public.payment_links drop constraint payment_links_purpose_check;
alter table public.payment_links add constraint payment_links_purpose_check CHECK (
  ((purpose = 'installment'::text) AND (installment_id IS NOT NULL))
  OR ((purpose = 'subscription'::text) AND (product IS NOT NULL)
      AND (product = ANY (ARRAY['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text]))
      AND (((payer_organization_id IS NOT NULL) AND (plan_code IS NOT NULL)) OR (subscriber_id IS NOT NULL))
      AND (NOT ((payer_organization_id IS NOT NULL) AND (subscriber_id IS NOT NULL))))
  OR ((purpose = 'ai_credit'::text)
      AND ((payer_organization_id IS NOT NULL) <> (subscriber_id IS NOT NULL)))
  OR ((purpose = 'account'::text) AND (party_id IS NOT NULL))
);

-- ---------------------------------------------------------------------------
-- 3) Ödeme kaydı: bireysel kredi siparişi abonenin ödeme geçmişine
-- ---------------------------------------------------------------------------
/*
  Gövde canlı şemadaki tanımın (20261008141602) AYNISI; tek ek, ai_credit
  dalında bireysel sipariş. Eskiden bu dal siparişin kurumunun paketini
  okuyup organization_payment_requests'e yazıyordu — kurumu olmayan
  siparişte plan bulunamaz ve kayıt düşerdi.
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
      Bireysel abone (26.10.2026): kurumu yok, tahsilat abonenin ödeme
      geçmişine yazılıyor — abonelik ödemeleri de orada; Platform tahsilat
      özeti ikisini birlikte sayıyor. DÖNEMSİZ (period null): kredi satışı
      abonelik dönemini uzatmaz. Kredinin ArvoLab'a yüklenmesi yine
      callback'te (app/api/paytr/callback).
    */
    if v_order.subscriber_id is not null then
      insert into public.subscriber_payments (subscriber_id, provider, merchant_oid, amount, currency, period_start, period_end)
      values (v_order.subscriber_id, 'paytr', p_merchant_oid, p_payment_amount, 'TRY', null, null);

      update public.payment_links set status = 'paid', paid_at = now() where id = v_link.id;
      update public.organization_payment_providers
      set last_payment_at = now()
      where organization_id = v_link.organization_id and provider = 'paytr';
      return 'recorded';
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
