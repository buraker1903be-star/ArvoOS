-- PayTR "Link ile Ödeme": taksit için ödeme bağlantısı ve otomatik tahsilat.
--
-- 1) organization_payment_providers: kurumun PayTR mağaza bilgileri.
--    merchant_key / merchant_salt uygulamada AES-256-GCM ile şifrelenir
--    (lib/payment-credentials.ts, PAYMENT_CREDENTIALS_KEY). Tablo yalnızca
--    service_role'e açıktır; tarayıcıdan hiçbir rol okuyamaz.
-- 2) payment_links: taksit başına PayTR bağlantısı. Taksit başına en fazla
--    bir aktif bağlantı.
-- 3) payment_provider_events: PayTR bildirimleri. (provider, merchant_oid)
--    tekil: aynı ödeme birden fazla bildirilse de bir kez işlenir.
-- 4) arvo_record_paytr_payment: bildirimi işler. Cariye "payment" alacağı
--    yazar; mevcut arvo_account_entry_reconcile tetikleyicisi taksitleri
--    elle girilen tahsilatla aynı kuralla kapatır. Test modundaki ödemeler
--    yalnızca kaydedilir, cariye yazılmaz.

create table if not exists public.organization_payment_providers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('paytr')),
  merchant_id text not null check (merchant_id ~ '^[0-9]{3,20}$'),
  merchant_key_enc text not null,
  merchant_salt_enc text not null,
  is_enabled boolean not null default true,
  last_test_payment_at timestamptz,
  last_payment_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, provider)
);
alter table public.organization_payment_providers enable row level security;
revoke all on public.organization_payment_providers from anon, authenticated;

create table if not exists public.payment_links (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installment_id uuid not null references public.payment_installments(id) on delete cascade,
  provider text not null default 'paytr' check (provider in ('paytr')),
  provider_link_id text not null,
  url text not null check (url ~ '^https://'),
  amount bigint not null check (amount > 0),
  status text not null default 'active' check (status in ('active', 'paid', 'cancelled')),
  expires_at text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_at timestamptz
);
create unique index if not exists payment_links_one_active_per_installment
  on public.payment_links(installment_id) where status = 'active';
create index if not exists payment_links_organization_idx on public.payment_links(organization_id, created_at desc);
alter table public.payment_links enable row level security;
revoke all on public.payment_links from anon, authenticated;

create table if not exists public.payment_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  merchant_oid text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payment_link_id uuid references public.payment_links(id) on delete set null,
  total_amount bigint,
  payment_amount bigint,
  currency text,
  test_mode boolean not null default false,
  result text not null,
  account_entry_id uuid,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (provider, merchant_oid)
);
alter table public.payment_provider_events enable row level security;
revoke all on public.payment_provider_events from anon, authenticated;

-- Panelde "PayTR ile oluşturuldu" rozeti ve iptal düğmesi için
alter table public.payment_installments
  add column if not exists payment_link_source text check (payment_link_source in ('paytr', 'manual'));

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

  -- Test ödemesi: bağlantının çalıştığını gösterir, cariye yazılmaz.
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
  update public.payment_links set status = 'paid', paid_at = now() where id = v_link.id;
  update public.organization_payment_providers
  set last_payment_at = now()
  where organization_id = v_link.organization_id and provider = 'paytr';
  return 'recorded';
end
$function$;

revoke all on function public.arvo_record_paytr_payment(uuid, text, bigint, bigint, text, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.arvo_record_paytr_payment(uuid, text, bigint, bigint, text, boolean, jsonb) to service_role;
