/*
  GERİ DÖNÜŞ: 20261110063102_lisans_kaydi_yokken_odeme.sql

  YALNIZCA migration canlıya uygulandıktan sonra bir sorun çıkarsa,
  kurucunun kararıyla SQL Editor'den elle çalıştırılır. Migration
  klasöründe DEĞİL (otomatik uygulanmasın diye).

  Ne yapar: iki işlevi migration öncesindeki canlı gövdelerine
  (supabase/schema/canli-sema.sql'den birebir) döndürür, yeni iki işlevi
  kaldırır. Veriye dokunmaz.

  ÖNCE BAKIN — geri dönüşten sonra 'no_license' olayları kendiliğinden
  çözülmez, yeniden işleme işlevi de kalmaz:
    select id, merchant_oid, organization_id, payment_amount, received_at
      from public.payment_provider_events where result = 'no_license';
  Satır varsa: geri dönmeden önce lisansı oluşturup Platform → Ödemeler'den
  yeniden işleyin, ya da listeyi kaydedip elle işleyin. Eski gövdeye
  dönünce lisans satırı olmayan kurumda ödeme yine SESSİZCE "onaylı"
  görünür (asıl hata geri gelir).

  Uygulama kodu: önceki dağıtıma (main'deki 1e32335 öncesi sürüm) dönülürse
  bu SQL ile uyumludur; yeni sürüm açık kalırsa "Yeniden işle" düğmesi
  "işlev bulunamadı" hatası verir, müşteri ekranındaki uyarı boş kalır.
*/
begin;

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

  if v_link.purpose = 'ai_credit' then
    if p_payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_event;
      return 'amount_mismatch';
    end if;

    select * into v_order from public.ai_credit_orders where payment_link_id = v_link.id;
    if v_order.id is null then
      update public.payment_provider_events set result = 'no_order' where id = v_event;
      return 'no_order';
    end if;

    -- Bireysel abone: tahsilat abonenin ödeme geçmişine, dönemsiz (kredi dönemi uzatmaz).
    if v_order.subscriber_id is not null then
      insert into public.subscriber_payments (subscriber_id, provider, merchant_oid, amount, currency, period_start, period_end)
      values (v_order.subscriber_id, 'paytr', p_merchant_oid, p_payment_amount, 'TRY', null, null);

      update public.payment_links set status = 'paid', paid_at = now() where id = v_link.id;
      update public.organization_payment_providers
      set last_payment_at = now()
      where organization_id = v_link.organization_id and provider = 'paytr';
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
    if p_payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_event;
      return 'amount_mismatch';
    end if;

    v_product := coalesce(v_link.product, 'arvoos');

    if v_link.subscriber_id is not null then
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
revoke all on function public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb) from public, anon, authenticated;
grant execute on function public.arvo_record_paytr_payment(p_payment_link_id uuid, p_merchant_oid text, p_total_amount bigint, p_payment_amount bigint, p_currency text, p_test_mode boolean, p_payload jsonb) to service_role;

drop function if exists public.arvo_reprocess_paytr_event(uuid);
drop function if exists private.arvo_apply_paytr_event(uuid);

commit;
