-- ArvoOS aboneliği: müşteri kurum kartla (PayTR Link) öder, lisans kendiliğinden uzar.
--
-- Kararlar (kurucuyla netleştirildi):
--  - Tutar kuruma özel: organization_licenses.monthly_fee (kuruş), kurucu belirler.
--  - Yalnızca aylık dönem.
--  - Erken ödeme gün yakmaz: süre dolmadıysa yeni ay mevcut dönem sonuna eklenir.
--    Havale onayı (review_bank_transfer_payment) da aynı kurala geçer; eskiden
--    "onay günü + 1 ay" yazıyor, erken ödeyen kurum kalan günlerini kaybediyordu.
--
-- Bağlantı ArvoOS'un kendi PayTR mağazasıyla oluşturulur: payment_links.organization_id
-- = ArvoOS kurumu (anahtar sahibi), payer_organization_id = ödeyen müşteri kurum.
-- Bildirim aynı /api/paytr/callback'e gelir; ayrım arvo_record_paytr_payment'ta.

-- 1) Kuruma özel aylık ücret
alter table public.organization_licenses
  add column if not exists monthly_fee bigint check (monthly_fee is null or monthly_fee > 0);

-- 2) Kartla ödemede dekont ve banka hesabı yok
alter table public.organization_payment_requests alter column receipt_path drop not null;
alter table public.organization_payment_requests alter column bank_account_id drop not null;
alter table public.organization_payment_requests drop constraint if exists organization_payment_requests_transfer_fields;
alter table public.organization_payment_requests add constraint organization_payment_requests_transfer_fields
  check (payment_method <> 'bank_transfer' or (receipt_path is not null and bank_account_id is not null));

-- 3) Abonelik bağlantısı
alter table public.payment_links alter column installment_id drop not null;
alter table public.payment_links add column if not exists purpose text not null default 'installment';
alter table public.payment_links add column if not exists payer_organization_id uuid references public.organizations(id) on delete cascade;
alter table public.payment_links add column if not exists plan_code public.plan_code;
alter table public.payment_links drop constraint if exists payment_links_purpose_check;
alter table public.payment_links add constraint payment_links_purpose_check check (
  (purpose = 'installment' and installment_id is not null)
  or (purpose = 'subscription' and payer_organization_id is not null and plan_code is not null)
);
create unique index if not exists payment_links_one_active_subscription
  on public.payment_links(payer_organization_id) where status = 'active' and purpose = 'subscription';

-- 4) Ortak lisans dönemi (havale onayı ve PayTR aynı kural)
create or replace function private.arvo_activate_license_period(
  p_organization_id uuid,
  p_plan_code public.plan_code,
  p_amount bigint,
  p_currency text,
  p_provider text,
  p_actor uuid
)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;
revoke all on function private.arvo_activate_license_period(uuid, public.plan_code, bigint, text, text, uuid) from public;

-- 5) Havale onayı ortak kurala geçer (imza ve yetki aynı)
create or replace function public.review_bank_transfer_payment(
  p_payment_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.organization_payment_requests%rowtype;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Founder authorization required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;

  select * into payment
  from public.organization_payment_requests
  where id = p_payment_id and status = 'pending'
  for update;
  if not found then raise exception 'Pending payment not found'; end if;

  update public.organization_payment_requests
  set status = p_decision,
      review_note = nullif(trim(p_review_note), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = payment.id;

  if p_decision = 'approved' then
    perform private.arvo_activate_license_period(
      payment.organization_id, payment.plan_code, payment.amount, payment.currency, 'manual', (select auth.uid())
    );
  end if;
end;
$$;
revoke all on function public.review_bank_transfer_payment(uuid,text,text) from public;
revoke all on function public.review_bank_transfer_payment(uuid,text,text) from anon;
grant execute on function public.review_bank_transfer_payment(uuid,text,text) to authenticated;

-- 6) PayTR bildirimi: taksit veya abonelik
create or replace function public.arvo_record_paytr_payment(
  p_payment_link_id uuid,
  p_merchant_oid text,
  p_total_amount bigint,
  p_payment_amount bigint,
  p_currency text,
  p_test_mode boolean,
  p_payload jsonb
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_link public.payment_links%rowtype;
  v_party uuid;
  v_installment_no integer;
  v_contract_no text;
  v_event uuid;
  v_entry uuid;
  v_request uuid;
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

  if v_link.purpose = 'subscription' then
    -- Eksik ödeme lisans açmaz (bağlantı tutarı sunucuda belirlenir).
    if p_payment_amount < v_link.amount then
      update public.payment_provider_events set result = 'amount_mismatch' where id = v_event;
      return 'amount_mismatch';
    end if;

    insert into public.organization_payment_requests (
      organization_id, bank_account_id, plan_code, amount, currency, payment_method, status,
      receipt_path, reference_no, review_note, submitted_by, reviewed_at, updated_at
    ) values (
      v_link.payer_organization_id, null, v_link.plan_code, p_payment_amount, 'TRY', 'paytr', 'approved',
      null, left('PAYTR-' || p_merchant_oid, 120), 'PayTR ile ödendi, otomatik onaylandı', v_link.created_by, now(), now()
    )
    returning id into v_request;

    perform private.arvo_activate_license_period(
      v_link.payer_organization_id, v_link.plan_code, p_payment_amount, 'TRY', 'paytr', v_link.created_by
    );
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
$function$;

revoke all on function public.arvo_record_paytr_payment(uuid, text, bigint, bigint, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.arvo_record_paytr_payment(uuid, text, bigint, bigint, text, boolean, jsonb) to service_role;
