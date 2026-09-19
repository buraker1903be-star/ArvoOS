-- ============================================================
-- 1. Yeni ürün: "randevu" (ArvoRandevu — kuaför/güzellik salonu randevu).
--    Lisansı ve tahsilatı ArvoOS'ta, ARC gibi: organization_product_licenses
--    satırı, PayTR aylık ödeme bağlantısı, havale/EFT. Randevu kendi
--    veritabanında; lisans oraya lib/randevu-bridge.ts ile yansır.
--    Bireysel abonelik (product_plans / product_subscribers) salon ürünü
--    olmadığı için dışarıda bırakıldı.
--
-- 2. Havale/EFT ile ödenen ek ürün lisansı uzamıyordu. Dekont formu ürün
--    göndermiyordu (sütun varsayılanı 'arvoos') ve review_bank_transfer_payment
--    her onayda yalnızca ArvoOS lisansını uzatıyordu: Arc (ve artık Randevu)
--    için havaleyle ödeyen kurumun lisansı onaydan sonra da bitiyordu. Onay
--    artık ödemenin ürününe göre ilgili lisansı uzatır.
-- ============================================================

alter table public.organization_product_licenses
  drop constraint organization_product_licenses_product_check,
  add constraint organization_product_licenses_product_check
    check (product = any (array['arvolab'::text, 'arc'::text, 'randevu'::text]));

alter table public.billing_invoices
  drop constraint billing_invoices_product_check,
  add constraint billing_invoices_product_check
    check (product = any (array['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text]));

alter table public.billing_subscriptions
  drop constraint billing_subscriptions_product_check,
  add constraint billing_subscriptions_product_check
    check (product = any (array['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text]));

alter table public.organization_payment_requests
  drop constraint organization_payment_requests_product_check,
  add constraint organization_payment_requests_product_check
    check (product = any (array['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text]));

-- Taksit dalı ve abonelik dalının kalanı birebir aynı; yalnızca ürün listesi büyüdü.
alter table public.payment_links
  drop constraint payment_links_purpose_check,
  add constraint payment_links_purpose_check check (
    ((purpose = 'installment'::text) and (installment_id is not null))
    or (
      (purpose = 'subscription'::text)
      and (product is not null)
      and (product = any (array['arvoos'::text, 'arvolab'::text, 'arc'::text, 'randevu'::text]))
      and (((payer_organization_id is not null) and (plan_code is not null)) or (subscriber_id is not null))
      and (not ((payer_organization_id is not null) and (subscriber_id is not null)))
    )
  );

-- Gövde canlıdakiyle aynı; yalnızca ürün denetimi 'randevu'yu da kabul eder.
-- create or replace mevcut yetkileri korur.
create or replace function private.arvo_activate_product_period(p_organization_id uuid, p_product text, p_plan_code plan_code, p_amount bigint, p_currency text, p_provider text, p_actor uuid)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_current_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_period_start timestamptz;
begin
  if p_product not in ('arvolab', 'arc', 'randevu') then
    raise exception 'Bilinmeyen ürün: %', p_product;
  end if;

  select current_period_end into v_current_end
  from public.organization_product_licenses
  where organization_id = p_organization_id and product = p_product
  for update;

  -- Süre dolmadıysa yeni ay mevcut dönem sonundan başlar.
  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';
  v_period_start := case when v_current_end is not null and v_current_end > now() then null else now() end;

  insert into public.organization_product_licenses (
    organization_id, product, status, plan_code, current_period_start, current_period_end,
    trial_ends_at, suspended_at, suspension_reason, updated_by, updated_at
  ) values (
    p_organization_id, p_product, 'active', p_plan_code, now(), v_end,
    null, null, null, p_actor, now()
  )
  on conflict (organization_id, product) do update
  set status = 'active',
      plan_code = coalesce(excluded.plan_code, public.organization_product_licenses.plan_code),
      current_period_start = coalesce(v_period_start, public.organization_product_licenses.current_period_start, now()),
      current_period_end = v_end,
      trial_ends_at = null,
      suspended_at = null,
      suspension_reason = null,
      updated_by = p_actor,
      updated_at = now();

  insert into public.billing_subscriptions (
    organization_id, product, provider, plan_code, status, currency, unit_amount,
    interval, current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, p_product, p_provider, p_plan_code, 'active', coalesce(p_currency, 'TRY'),
    p_amount, 'month', v_start, v_end, now()
  );

  insert into public.billing_invoices (
    organization_id, product, provider, status, currency, subtotal, tax, total, due_at, paid_at
  ) values (
    p_organization_id, p_product, p_provider, 'paid', coalesce(p_currency, 'TRY'),
    p_amount, 0, p_amount, now(), now()
  );

  return v_end;
end
$function$;

create or replace function public.review_bank_transfer_payment(p_payment_id uuid, p_decision text, p_review_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    -- Ödemenin ürünü hangisiyse o lisans uzar. Önceden her onay ArvoOS
    -- lisansını uzatıyordu; ek ürün havaleyle ödenince lisansı bitiyordu.
    if coalesce(payment.product, 'arvoos') = 'arvoos' then
      perform private.arvo_activate_license_period(
        payment.organization_id, payment.plan_code, payment.amount, payment.currency, 'manual', (select auth.uid())
      );
    else
      perform private.arvo_activate_product_period(
        payment.organization_id, payment.product, payment.plan_code, payment.amount, payment.currency, 'manual', (select auth.uid())
      );
    end if;
  end if;
end;
$function$;

notify pgrst, 'reload schema';
