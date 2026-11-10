/*
  LİSANS KAYDI YOKKEN ÖDEME (10.11.2026).

  Zincir (canlı şema):
    - Kurum oluşturulunca private.create_default_organization_license
      tetikleyicisi ArvoOS lisans satırını açar (deneme, 14 gün). Satırı
      silebilen yollar kurucunun RLS'i (founder_can_manage_organization_licenses,
      FOR ALL) ve elle SQL; kurum silinince kaskatla gider.
    - Kartla ödeme (lib/license-checkout) aylık ücreti lisans satırından
      okuyor: satır yoksa ücret 0 ve ödeme başlatılamıyor ("fee_not_set").
      Ancak satır bağlantı açıldıktan SONRA silinirse, ya da havale yolunda
      (submitBankTransferPayment lisansa bakmıyor) ödeme ulaşabilir.
    - private.arvo_activate_license_period yalnızca UPDATE yapıyordu: satır
      yoksa hiçbir şey değişmiyor, hata da yok. Havale onayı "approved",
      PayTR ödemesi "PayTR ile ödendi, otomatik onaylandı" kaydı oluşuyor,
      lisans açılmıyor ve kimse fark etmiyordu.

  Düzeltme (yeni ücret/plan/limit kuralı YOK, varsayılanla UPSERT YOK):
    1. Etkinleştirme satır yoksa 'license_missing' fırlatır. Havale onayı
       bu yüzden tamamen geri alınır: ödeme "bekliyor"da kalır, kurucu
       hatayı görür, lisansı oluşturup yeniden onaylar.
    2. PayTR bildiriminin İŞ MANTIĞI tek bir iç işlevde:
       private.arvo_apply_paytr_event(olay). İlk bildirim
       (arvo_record_paytr_payment) ve kurucunun yeniden işlemesi
       (arvo_reprocess_paytr_event) AYNI işlevi çağırır; mantık iki yerde
       yazılı değil.
    3. ArvoOS ödemesinde lisans yoksa olay 'no_license' kalır: onaylı
       ödeme isteği ve lisans dönemi YAZILMAZ, ama tahsilat yazılır
       (bağlantı 'paid'): PayTR parayı almıştır, bağlantı yeniden
       ödenecek açık bir borç gibi görünmemeli. "Tahsilat alındı" ile
       "lisansa uygulandı" iki ayrı kayıt: ilki bağlantının durumu,
       ikincisi onaylı ödeme isteği + lisans dönemi.
    4. Yeniden işleme OLAYI SİLMEZ (ilk tasarımda silip yeniden
       oluşturuyordu): kimlik, received_at ve PayTR'nin gönderdiği payload
       aynı satırda kalır; yalnızca result güncellenir. Her deneme —
       başarılı ya da lisans hâlâ yok — activity_logs'a yazılır (kim, ne
       zaman, önceki ve yeni sonuç), konsol kayıtlarının yerine
       (metadata.by = 'founder_console').

  KİLİT SIRASI (bütün yollarda aynı): payment_links → payment_provider_events
  → organization_licenses. İlk bildirim bağlantıyı kilitleyip olayı
  ekliyor; yeniden işleme de önce bağlantıyı, sonra olayı kilitliyor.
  Böylece:
    - bildirim ile yeniden işleme aynı anda gelirse ikincisi bağlantı
      kilidinde bekler, döngü oluşmaz; aynı merchant_oid'in tekrarı
      'duplicate' döner;
    - iki kurucu aynı olayı yeniden işlerse ikincisi bekler, ardından olayı
      'recorded' görür ve 'event_not_reprocessable' alır — ikinci uzama yok;
    - lisans denetimi satırı FOR UPDATE kilitler: kontrol ile etkinleştirme
      arasında silinemez; silme önce gelirse denetim satırı göremez ve olay
      'no_license' olur. Etkinleştirme yine de satırı bulamazsa
      'license_missing' fırlatır ve işlemin TAMAMI geri alınır — yarım
      ödeme kaydı kalmaz.
*/

CREATE OR REPLACE FUNCTION private.arvo_activate_license_period(p_organization_id uuid, p_plan_code plan_code, p_amount bigint, p_currency text, p_provider text, p_actor uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_current_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  select current_period_end into v_current_end
  from public.organization_licenses
  where organization_id = p_organization_id
  for update;
  -- Satır yoksa UPDATE hiçbir şey yapmıyor ve ödeme "onaylandı" kalırken
  -- lisans açılmıyordu (sessiz). Artık işlem durur; çağıran işlemin
  -- tamamı geri alınır (havale onayı "bekliyor"da kalır, yeniden onaylanabilir).
  if not found then
    raise exception 'license_missing' using
      detail = 'ArvoOS lisans kaydı yok; ödeme lisansa uygulanamadı.',
      hint = 'Platform → Lisanslar''dan kurumun lisansını (paket, ücret, kullanıcı limiti) oluşturup işlemi yeniden deneyin.';
  end if;

  -- Süre dolmadıysa yeni ay mevcut dönem sonundan başlar.
  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';

  update public.organization_licenses
  set plan_code = p_plan_code,
      license_status = 'active',
      current_period_start = case when v_current_end is not null and v_current_end > now() then coalesce(current_period_start, now()) else now() end,
      current_period_end = v_end,
      trial_ends_at = null,
      suspended_at = null,
      suspension_reason = null,
      updated_by = p_actor,
      updated_at = now()
  where organization_id = p_organization_id;

  update public.organizations
  set plan_code = p_plan_code,
      status = 'active',
      provisioning_state = 'active',
      updated_at = now()
  where id = p_organization_id;

  insert into public.billing_subscriptions (
    organization_id, provider, plan_code, status, currency, unit_amount,
    interval, current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, p_provider, p_plan_code, 'active', coalesce(p_currency, 'TRY'),
    p_amount, 'month', v_start, v_end, now()
  );

  insert into public.billing_invoices (
    organization_id, provider, status, currency, subtotal, tax, total, due_at, paid_at
  ) values (
    p_organization_id, p_provider, 'paid', coalesce(p_currency, 'TRY'),
    p_amount, 0, p_amount, now(), now()
  );

  return v_end;
end
$function$
;
revoke all on function private.arvo_activate_license_period(p_organization_id uuid, p_plan_code plan_code, p_amount bigint, p_currency text, p_provider text, p_actor uuid) from public, anon, authenticated;

/*
  PayTR olayının iş mantığı. Çağıran bağlantıyı (ve olayı) KİLİTLEMİŞ
  olmalı; işlev olayın result sütununu her çıkışta kendisi yazar.
  Gövde arvo_record_paytr_payment'ın canlıdaki gövdesinden taşındı;
  değişenler: (a) parametreler olay satırından okunuyor, (b) her çıkış
  result'ı açıkça yazıyor (yeniden işlenen olay 'no_license'tan gelir),
  (c) paid_at olayın alındığı an (ilk bildirimde now() ile aynı değer,
  yeniden işlemede gerçek tahsilat anı korunur), (d) ArvoOS lisans
  denetimi.
*/
create or replace function private.arvo_apply_paytr_event(p_event_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_ev public.payment_provider_events%rowtype;
  v_link public.payment_links%rowtype;
  v_product text;
  v_party uuid;
  v_installment_no integer;
  v_contract_no text;
  v_entry uuid;
  v_request uuid;
  v_order public.ai_credit_orders%rowtype;
  v_plan public.plan_code;
begin
  select * into v_ev from public.payment_provider_events where id = p_event_id for update;
  if not found then
    raise exception 'event_not_found';
  end if;
  select * into v_link from public.payment_links where id = v_ev.payment_link_id for update;
  if not found then
    update public.payment_provider_events set result = 'not_found' where id = v_ev.id;
    return 'not_found';
  end if;

  if coalesce(v_ev.payment_amount, 0) <= 0 then
    update public.payment_provider_events set result = 'invalid_amount' where id = v_ev.id;
    return 'invalid_amount';
  end if;

  if v_link.purpose = 'ai_credit' then
    if v_ev.payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_ev.id;
      return 'amount_mismatch';
    end if;

    select * into v_order from public.ai_credit_orders where payment_link_id = v_link.id;
    if v_order.id is null then
      update public.payment_provider_events set result = 'no_order' where id = v_ev.id;
      return 'no_order';
    end if;

    -- Bireysel abone: tahsilat abonenin ödeme geçmişine, dönemsiz (kredi dönemi uzatmaz).
    if v_order.subscriber_id is not null then
      insert into public.subscriber_payments (subscriber_id, provider, merchant_oid, amount, currency, period_start, period_end)
      values (v_order.subscriber_id, 'paytr', v_ev.merchant_oid, v_ev.payment_amount, 'TRY', null, null);

      update public.payment_links set status = 'paid', paid_at = v_ev.received_at where id = v_link.id;
      update public.organization_payment_providers
      set last_payment_at = now()
      where organization_id = v_link.organization_id and provider = 'paytr';
      update public.payment_provider_events set result = 'recorded' where id = v_ev.id;
      return 'recorded';
    end if;

    select coalesce(l.plan_code, o.plan_code) into v_plan
      from public.organizations o
      left join public.organization_licenses l on l.organization_id = o.id
     where o.id = v_order.organization_id;

    insert into public.organization_payment_requests (
      organization_id, bank_account_id, plan_code, product, amount, currency, payment_method, status,
      receipt_path, reference_no, review_note, submitted_by, reviewed_at, updated_at
    ) values (
      v_order.organization_id, null, coalesce(v_plan, 'starter'::public.plan_code), 'arvolab',
      v_ev.payment_amount, 'TRY', 'paytr', 'approved',
      null, left('PAYTR-' || v_ev.merchant_oid, 120),
      'AI kredisi satın alındı (' || v_order.kredi || ' kredi), otomatik onaylandı',
      coalesce(v_link.created_by, v_order.created_by), now(), now()
    );

    update public.payment_links set status = 'paid', paid_at = v_ev.received_at where id = v_link.id;
    update public.organization_payment_providers
    set last_payment_at = now()
    where organization_id = v_link.organization_id and provider = 'paytr';
    update public.payment_provider_events set result = 'recorded' where id = v_ev.id;
    return 'recorded';
  end if;

  if v_link.purpose = 'subscription' then
    if v_ev.payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_ev.id;
      return 'amount_mismatch';
    end if;

    v_product := coalesce(v_link.product, 'arvoos');

    /*
      ArvoOS lisans kaydı yoksa: tahsilat yazılır (bağlantı 'paid' —
      PayTR parayı aldı, bağlantı yeniden ödenecek açık borç gibi
      görünmesin), onaylı ödeme isteği ve lisans dönemi YAZILMAZ; olay
      'no_license' kalır ve kurucunun işlenemeyen bildirim listesine düşer
      (lib/payment-incidents.ts). Satır FOR UPDATE kilitlenir: denetim ile
      etkinleştirme arasında silinemez. Eskiden etkinleştirme UPDATE'i
      sessizce hiçbir satırı değiştirmiyor, ödeme onaylı görünürken lisans
      açılmıyordu.
    */
    if v_link.subscriber_id is null and v_product = 'arvoos' then
      perform 1 from public.organization_licenses l
       where l.organization_id = v_link.payer_organization_id
         for update;
      if not found then
        update public.payment_links set status = 'paid', paid_at = v_ev.received_at where id = v_link.id;
        update public.organization_payment_providers
        set last_payment_at = now()
        where organization_id = v_link.organization_id and provider = 'paytr';
        update public.payment_provider_events set result = 'no_license' where id = v_ev.id;
        return 'no_license';
      end if;
    end if;

    if v_link.subscriber_id is not null then
      perform private.arvo_activate_subscriber_period(
        v_link.subscriber_id, v_ev.payment_amount, 'TRY', 'paytr', v_ev.merchant_oid
      );
    else
      insert into public.organization_payment_requests (
        organization_id, bank_account_id, plan_code, product, amount, currency, payment_method, status,
        receipt_path, reference_no, review_note, submitted_by, reviewed_at, updated_at
      ) values (
        v_link.payer_organization_id, null, v_link.plan_code, v_product, v_ev.payment_amount, 'TRY', 'paytr', 'approved',
        null, left('PAYTR-' || v_ev.merchant_oid, 120), 'PayTR ile ödendi, otomatik onaylandı', v_link.created_by, now(), now()
      )
      returning id into v_request;

      if v_product = 'arvoos' then
        perform private.arvo_activate_license_period(
          v_link.payer_organization_id, v_link.plan_code, v_ev.payment_amount, 'TRY', 'paytr', v_link.created_by
        );
      else
        perform private.arvo_activate_product_period(
          v_link.payer_organization_id, v_product, v_link.plan_code, v_ev.payment_amount, 'TRY', 'paytr', v_link.created_by
        );
      end if;
    end if;
  elsif v_link.purpose = 'account' then
    if v_link.party_id is null then
      update public.payment_provider_events set result = 'no_party' where id = v_ev.id;
      return 'no_party';
    end if;

    insert into public.account_entries(organization_id, party_id, entry_type, source_type, amount, currency, description, reference_no, transaction_date, created_by)
    values (
      v_link.organization_id, v_link.party_id, 'credit', 'payment', v_ev.payment_amount, 'TRY',
      left('PayTR tahsilatı · ' || coalesce(nullif(trim(v_link.note), ''), 'ödeme bağlantısı'), 500),
      left('PAYTR-' || v_ev.merchant_oid, 100),
      (now() at time zone 'Europe/Istanbul')::date,
      v_link.created_by
    )
    returning id into v_entry;
    update public.payment_provider_events set account_entry_id = v_entry where id = v_ev.id;
  else
    select p.party_id, i.installment_no, c.contract_no
    into v_party, v_installment_no, v_contract_no
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    left join public.crm_contracts c on c.id = p.contract_id
    where i.id = v_link.installment_id;

    if v_party is null then
      update public.payment_provider_events set result = 'no_party' where id = v_ev.id;
      return 'no_party';
    end if;

    insert into public.account_entries(organization_id, party_id, entry_type, source_type, amount, currency, description, reference_no, transaction_date, created_by)
    values (
      v_link.organization_id, v_party, 'credit', 'payment', v_ev.payment_amount, 'TRY',
      left(format('PayTR tahsilatı · %s %s. taksit', coalesce(v_contract_no, 'Sözleşme'), v_installment_no), 500),
      left('PAYTR-' || v_ev.merchant_oid, 100),
      (now() at time zone 'Europe/Istanbul')::date,
      v_link.created_by
    )
    returning id into v_entry;
    update public.payment_provider_events set account_entry_id = v_entry where id = v_ev.id;
  end if;

  update public.payment_links set status = 'paid', paid_at = v_ev.received_at where id = v_link.id;
  update public.organization_payment_providers
  set last_payment_at = now()
  where organization_id = v_link.organization_id and provider = 'paytr';
  update public.payment_provider_events set result = 'recorded' where id = v_ev.id;
  return 'recorded';
end
$function$;
revoke all on function private.arvo_apply_paytr_event(uuid) from public, anon, authenticated;

/*
  İlk bildirim: bağlantıyı kilitler, olayı tekil merchant_oid ile ekler
  (tekrar → 'duplicate'), test ödemesini işaretler, gerisini ortak işleve
  bırakır. Canlıdaki gövdenin ilk yarısı değişmeden; iş mantığı
  private.arvo_apply_paytr_event'e taşındı.
*/
CREATE OR REPLACE FUNCTION public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_link public.payment_links%rowtype;
  v_event uuid;
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

  if coalesce(p_test_mode, false) then
    update public.organization_payment_providers
    set last_test_payment_at = now()
    where organization_id = v_link.organization_id and provider = 'paytr';
    return 'test';
  end if;

  return private.arvo_apply_paytr_event(v_event);
end
$function$
;
revoke all on function public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb) from public, anon, authenticated;
grant execute on function public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb) to service_role;

/*
  'no_license' olayını yeniden işleme (yalnızca kurucu).

  Olay SİLİNMEZ: kimliği, received_at'i ve payload'ı korunur, ortak işlev
  aynı satırın result'ını günceller. Kilit sırası ilk bildirimle aynı
  (bağlantı → olay → lisans): olayın bağlantısı kilitsiz okunur, bağlantı
  kilitlenir, sonra olay kilitlenip durumu YENİDEN okunur — arada başka
  bir kurucu işlemişse 'event_not_reprocessable'.

  Her deneme activity_logs'a yazılır: lisans hâlâ yoksa da (işlem
  commit olur, olay 'no_license' kalır). Yetki/durum hatasında işlem
  fırlatır ve geri alınır; o durumda değişen bir şey olmadığı için kayıt da
  yoktur.
*/
create or replace function public.arvo_reprocess_paytr_event(p_event_id uuid)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_link_id uuid;
  v_link public.payment_links%rowtype;
  v_event public.payment_provider_events%rowtype;
  v_sonuc text;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Founder authorization required';
  end if;

  select payment_link_id into v_link_id from public.payment_provider_events
   where id = p_event_id and provider = 'paytr';
  if not found then
    raise exception 'event_not_found';
  end if;
  if v_link_id is null then
    raise exception 'event_without_link' using detail = 'Bildirimin ödeme bağlantısı silinmiş; elle işlenmeli.';
  end if;

  select * into v_link from public.payment_links where id = v_link_id for update;
  if not found then
    raise exception 'event_without_link' using detail = 'Bildirimin ödeme bağlantısı silinmiş; elle işlenmeli.';
  end if;

  select * into v_event from public.payment_provider_events where id = p_event_id for update;
  if v_event.payment_link_id is distinct from v_link_id or v_event.result <> 'no_license' then
    raise exception 'event_not_reprocessable' using detail = 'Yalnızca lisans kaydı olmadığı için işlenemeyen bildirim yeniden işlenir.';
  end if;

  v_sonuc := private.arvo_apply_paytr_event(v_event.id);

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    coalesce(v_link.payer_organization_id, v_event.organization_id),
    (select auth.uid()),
    'reprocess',
    'payment_event',
    v_event.id::text,
    jsonb_build_object(
      'by', 'founder_console',
      'baslik', case when v_sonuc = 'recorded'
                     then 'PayTR ödemesi lisansa uygulandı'
                     else 'PayTR ödemesi yeniden işlendi, lisansa uygulanamadı' end,
      'degisiklikler', jsonb_build_array(jsonb_build_object(
        'alan', 'result', 'ad', 'Bildirim',
        'once', 'Tahsil edildi, lisans kaydı yok',
        'sonra', case v_sonuc when 'recorded' then 'Lisansa uygulandı'
                              when 'no_license' then 'Tahsil edildi, lisans kaydı yok'
                              else v_sonuc end)),
      'merchant_oid', v_event.merchant_oid,
      'payment_amount', v_event.payment_amount,
      'onceki_sonuc', v_event.result,
      'sonuc', v_sonuc
    )
  );

  return v_sonuc;
end
$function$;
revoke all on function public.arvo_reprocess_paytr_event(uuid) from public, anon, authenticated;
grant execute on function public.arvo_reprocess_paytr_event(uuid) to authenticated, service_role;
