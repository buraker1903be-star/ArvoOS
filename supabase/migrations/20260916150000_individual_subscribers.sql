-- Bireysel aboneler: ArvoLab'ı kuruma bağlı olmadan kullanan kişiler.
--
-- Kararlar (kurucuyla netleştirildi, 2026-09-16):
--  - Ödeme ArvoLab'ın içinden kartla yapılır; bağlantıyı ArvoOS üretir,
--    tahsilat ArvoOS'un PayTR mağazasından geçer.
--  - Fiyat herkese aynı: product_plans.individual_monthly_fee (kuruş).
--  - Kayıt olan kişi sınırlı süre ücretsiz kullanır: product_plans.trial_days.
--  - Tüm denetim ArvoOS'ta: abone listesi, fiyat, deneme süresi, askıya alma.
--
-- Kurum aboneliğinden ayrı bir tablo: birey kuruma ait değil, plan_code'u ve
-- kullanıcı/depolama limitleri yok. Kurumları taklit eden sahte kurum satırı
-- açmak yerine kendi kaydı tutuluyor.

-- 1) Ürün geneli fiyat ve deneme süresi
create table if not exists public.product_plans (
  product text primary key check (product in ('arvolab','arc')),
  individual_monthly_fee bigint check (individual_monthly_fee is null or individual_monthly_fee > 0),
  trial_days integer not null default 14 check (trial_days >= 0 and trial_days <= 365),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.product_plans (product) values ('arvolab')
on conflict (product) do nothing;

alter table public.product_plans enable row level security;
grant select on public.product_plans to authenticated;

drop policy if exists "founder_manage_product_plans" on public.product_plans;
create policy "founder_manage_product_plans"
on public.product_plans for all to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

-- 2) Bireysel aboneler
create table if not exists public.product_subscribers (
  id uuid primary key default gen_random_uuid(),
  product text not null check (product in ('arvolab','arc')),
  -- Ürünün kendi veritabanındaki kullanıcı kimliği (ArvoLab auth.users.id)
  external_user_id uuid not null,
  email text not null,
  full_name text,
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','suspended','canceled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product, external_user_id)
);

create index if not exists product_subscribers_status_idx on public.product_subscribers(product, status);
create index if not exists product_subscribers_email_idx on public.product_subscribers(product, email);

alter table public.product_subscribers enable row level security;
grant select on public.product_subscribers to authenticated;

-- Bireysel abone ArvoOS paneline girmez: okuma da yazma da yalnızca kurucuda.
-- (Ürünün kendisi service_role ile erişir, RLS'i atlar.)
drop policy if exists "founder_manage_product_subscribers" on public.product_subscribers;
create policy "founder_manage_product_subscribers"
on public.product_subscribers for all to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

-- 3) Bireysel ödeme geçmişi
-- billing_invoices kuruma bağlı (organization_id not null); bireyin kurumu yok.
create table if not exists public.subscriber_payments (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.product_subscribers(id) on delete cascade,
  provider text not null default 'paytr',
  merchant_oid text,
  amount bigint not null check (amount > 0),
  currency text not null default 'TRY',
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists subscriber_payments_subscriber_idx on public.subscriber_payments(subscriber_id, paid_at desc);

alter table public.subscriber_payments enable row level security;
grant select on public.subscriber_payments to authenticated;

drop policy if exists "founder_read_subscriber_payments" on public.subscriber_payments;
create policy "founder_read_subscriber_payments"
on public.subscriber_payments for all to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

-- 4) Ödeme bağlantısı bireysel aboneye de bağlanabilsin
alter table public.payment_links add column if not exists subscriber_id uuid references public.product_subscribers(id) on delete cascade;

alter table public.payment_links drop constraint if exists payment_links_purpose_check;
alter table public.payment_links add constraint payment_links_purpose_check check (
  (purpose = 'installment' and installment_id is not null)
  -- product is not null şart: "product in (...)" tek başına NULL'da "bilinmiyor"
  -- döner ve kısıt geçer; ürünsüz bağlantı hem buradan hem tekillik indeksinden
  -- (NULL'lar birbirinden farklı sayılır) sızardı.
  or (purpose = 'subscription' and product is not null and product in ('arvoos','arvolab','arc')
      and ((payer_organization_id is not null and plan_code is not null) or subscriber_id is not null)
      and not (payer_organization_id is not null and subscriber_id is not null))
);

-- Bireysel bağlantıyı açan bir ArvoOS kullanıcısı yok (kişi ürünün içinden
-- ödüyor). created_by yalnızca bu durumda boş kalabilir; kurum ve taksit
-- bağlantılarında hâlâ zorunlu.
alter table public.payment_links alter column created_by drop not null;
alter table public.payment_links drop constraint if exists payment_links_creator_check;
alter table public.payment_links add constraint payment_links_creator_check
  check (created_by is not null or subscriber_id is not null);

-- Kurumda olduğu gibi birey başına da tek aktif bağlantı.
create unique index if not exists payment_links_one_active_subscriber
  on public.payment_links(subscriber_id, product)
  where status = 'active' and purpose = 'subscription' and subscriber_id is not null;

-- 5) Bireysel dönem uzatma (kurumdakiyle aynı kural: gün yakmaz)
create or replace function private.arvo_activate_subscriber_period(
  p_subscriber_id uuid,
  p_amount bigint,
  p_currency text,
  p_provider text,
  p_merchant_oid text
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
  from public.product_subscribers
  where id = p_subscriber_id
  for update;
  if not found then
    raise exception 'Abone bulunamadı: %', p_subscriber_id;
  end if;

  -- Süre dolmadıysa yeni ay mevcut dönem sonundan başlar. Deneme süresi
  -- ödemeyle biter: kalan deneme günü eklenmez, dönem bugünden işler.
  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';

  update public.product_subscribers
  set status = 'active',
      trial_ends_at = null,
      current_period_start = case when v_current_end is not null and v_current_end > now()
                                  then coalesce(current_period_start, now()) else now() end,
      current_period_end = v_end,
      suspended_at = null,
      suspension_reason = null,
      updated_at = now()
  where id = p_subscriber_id;

  insert into public.subscriber_payments (subscriber_id, provider, merchant_oid, amount, currency, period_start, period_end)
  values (p_subscriber_id, p_provider, p_merchant_oid, p_amount, coalesce(p_currency, 'TRY'), v_start, v_end);

  return v_end;
end
$function$;
revoke all on function private.arvo_activate_subscriber_period(uuid, bigint, text, text, text) from public;

-- 6) PayTR bildirimi: abonelik dalı bireysel aboneyi de tanısın
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
