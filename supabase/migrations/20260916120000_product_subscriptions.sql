-- Ürün başına abonelik: ArvoLab ve ARC de ArvoOS üzerinden tahsil edilir.
--
-- Kararlar (kurucuyla netleştirildi, 2026-09-16):
--  - Kapsam yalnızca abonelik ücretleri. ARC mağazalarının son tüketiciden
--    yaptığı satış tahsilatı bu işin dışında; o kendi akışında kalıyor.
--  - Ücret ürün başına: her kurum için ArvoOS, ArvoLab ve ARC'ın ayrı aylık
--    ücreti olur, kurum yalnızca aldığı ürüne öder.
--  - Aylık dönem; erken ödeme gün yakmaz, mevcut dönem sonuna eklenir.
--
-- ArvoOS'un kendi lisansı organization_licenses'ta kalıyor: kullanıcı/depolama/
-- AI limitleri ve modül sınırları orada tutuluyor, ayrıca ARC'ın tenant RPC'si
-- organizations.plan_code ve status okuyor. Üç ürünü tek tabloya toplamak bu iki
-- bağımlılığı da kırardı; bu yüzden yeni tablo diğer iki ürünü kapsıyor.
--
-- ArvoLab ayrı bir Supabase projesinde (zpfpocyajnxcketdjbxm). Lisans durumu
-- oraya ArvoOS tarafından yansıtılacak; bu migration yalnızca ArvoOS tarafındaki
-- kaydı kuruyor.

-- 1) Ürün lisansları
create table if not exists public.organization_product_licenses (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product text not null check (product in ('arvolab','arc')),
  status text not null default 'inactive'
    check (status in ('inactive','trialing','active','past_due','suspended','canceled')),
  plan_code public.plan_code,
  monthly_fee bigint check (monthly_fee is null or monthly_fee > 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, product)
);

create index if not exists organization_product_licenses_product_status_idx
  on public.organization_product_licenses(product, status);

alter table public.organization_product_licenses enable row level security;
grant select on public.organization_product_licenses to authenticated;

-- Kurum kendi lisansını görür (Ödeme ve Lisans sayfası), yazamaz.
drop policy if exists "members_read_own_product_licenses" on public.organization_product_licenses;
create policy "members_read_own_product_licenses"
on public.organization_product_licenses for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = organization_product_licenses.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

drop policy if exists "founder_manage_product_licenses" on public.organization_product_licenses;
create policy "founder_manage_product_licenses"
on public.organization_product_licenses for all to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

-- 2) Ödeme kayıtlarında ürün ayrımı (mevcut satırların hepsi ArvoOS aboneliği)
alter table public.organization_payment_requests
  add column if not exists product text not null default 'arvoos';
alter table public.organization_payment_requests drop constraint if exists organization_payment_requests_product_check;
alter table public.organization_payment_requests add constraint organization_payment_requests_product_check
  check (product in ('arvoos','arvolab','arc'));

alter table public.billing_subscriptions add column if not exists product text not null default 'arvoos';
alter table public.billing_subscriptions drop constraint if exists billing_subscriptions_product_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_product_check
  check (product in ('arvoos','arvolab','arc'));

alter table public.billing_invoices add column if not exists product text not null default 'arvoos';
alter table public.billing_invoices drop constraint if exists billing_invoices_product_check;
alter table public.billing_invoices add constraint billing_invoices_product_check
  check (product in ('arvoos','arvolab','arc'));

-- 3) Ödeme bağlantısı hangi ürünün aboneliği
alter table public.payment_links add column if not exists product text;
update public.payment_links set product = 'arvoos' where purpose = 'subscription' and product is null;

alter table public.payment_links drop constraint if exists payment_links_purpose_check;
alter table public.payment_links add constraint payment_links_purpose_check check (
  (purpose = 'installment' and installment_id is not null)
  -- product is not null şart: "product in (...)" tek başına NULL'da "bilinmiyor"
  -- döner ve kısıt geçer; ürünsüz bağlantı hem buradan hem tekillik indeksinden
  -- (NULL'lar birbirinden farklı sayılır) sızardı.
  or (purpose = 'subscription' and payer_organization_id is not null and plan_code is not null
      and product is not null and product in ('arvoos','arvolab','arc'))
);

-- Kurum başına değil, kurum+ürün başına tek aktif bağlantı: ArvoOS aboneliğini
-- öderken ArvoLab bağlantısının iptal olmaması için.
drop index if exists public.payment_links_one_active_subscription;
create unique index if not exists payment_links_one_active_subscription
  on public.payment_links(payer_organization_id, product)
  where status = 'active' and purpose = 'subscription';

-- 4) Ürün lisansı dönemi (ArvoOS'unkiyle aynı uzatma kuralı)
create or replace function private.arvo_activate_product_period(
  p_organization_id uuid,
  p_product text,
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
  v_period_start timestamptz;
begin
  if p_product not in ('arvolab','arc') then
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
revoke all on function private.arvo_activate_product_period(uuid, text, public.plan_code, bigint, text, text, uuid) from public;

-- 5) PayTR bildirimi: abonelik dalı artık ürüne göre dağıtıyor
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
  v_product text;
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

    v_product := coalesce(v_link.product, 'arvoos');

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

-- 6) ARC'ın kiracı çözümlemesi
--
-- BU MIGRATION ARTIK arc_resolve_commerce_tenant'I TANIMLAMIYOR.
--
-- Fonksiyon burada da, ArvoARC deposunda da drop+create ediliyordu ve buradaki
-- sürümde ARC'ın ihtiyaç duyduğu arc_stage sütunu yoktu. Migration'lar iki ayrı
-- klasörden elle uygulandığı için bu dosya sonradan bir kez daha çalıştırılırsa
-- fonksiyonu eski haline döndürüyor ve Arc'ın kademeli kapanma yaptırımı
-- SESSİZCE devre dışı kalıyordu — kod eksik sütunu görünce kimseyi engellemiyor.
--
-- Fonksiyonun tek sahibi ArvoARC deposu:
--   ArvoARC/supabase/migrations/20260916200500_tenant_rpc_canonical.sql
-- Orası hem lisans alanlarını hem kademeyi döndüren güncel sürümü tutuyor ve
-- tekrar çalıştırılması zararsız.
