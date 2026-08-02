create table if not exists public.organization_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank_name text not null,
  account_name text,
  iban text not null,
  currency text not null default 'TRY',
  opening_balance bigint not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, iban),
  unique (id, organization_id)
);

create unique index if not exists billing_invoices_id_org_uidx
  on public.billing_invoices(id, organization_id);

create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank_account_id uuid not null,
  direction text not null check (direction in ('inflow','outflow')),
  amount bigint not null check (amount > 0),
  currency text not null default 'TRY',
  transaction_date date not null default current_date,
  description text not null check (char_length(description) between 2 and 500),
  reference_no text,
  reconciliation_status text not null default 'unmatched' check (reconciliation_status in ('unmatched','matched','ignored')),
  matched_invoice_id uuid,
  matched_party_id uuid,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bank_transactions_account_org_fk
    foreign key (bank_account_id, organization_id)
    references public.organization_bank_accounts(id, organization_id)
    on delete cascade,
  constraint bank_transactions_invoice_org_fk
    foreign key (matched_invoice_id, organization_id)
    references public.billing_invoices(id, organization_id)
    on delete no action,
  constraint bank_transactions_party_org_fk
    foreign key (matched_party_id, organization_id)
    references public.account_parties(id, organization_id)
    on delete no action
);

alter table public.organization_bank_accounts enable row level security;
alter table public.bank_transactions enable row level security;
grant select, insert, update on public.organization_bank_accounts to authenticated;
grant select, insert, update on public.bank_transactions to authenticated;

create policy "members_read_own_bank_accounts" on public.organization_bank_accounts for select to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id = organization_bank_accounts.organization_id and m.user_id = (select auth.uid()) and m.is_active
));
create policy "owners_manage_bank_accounts" on public.organization_bank_accounts for all to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id = organization_bank_accounts.organization_id and m.user_id = (select auth.uid()) and m.is_active and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_memberships m where m.organization_id = organization_bank_accounts.organization_id and m.user_id = (select auth.uid()) and m.is_active and m.role in ('owner','admin')
));
create policy "members_read_own_bank_transactions" on public.bank_transactions for select to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id = bank_transactions.organization_id and m.user_id = (select auth.uid()) and m.is_active
));
create policy "owners_manage_bank_transactions" on public.bank_transactions for all to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id = bank_transactions.organization_id and m.user_id = (select auth.uid()) and m.is_active and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_memberships m where m.organization_id = bank_transactions.organization_id and m.user_id = (select auth.uid()) and m.is_active and m.role in ('owner','admin')
));

insert into public.arvo_modules (code,name,description,sort_order,is_active)
values ('banking','Banka ve Mutabakat','Banka hesapları, hareketler ve eşleştirme yönetimi',78,true)
on conflict (code) do update set name=excluded.name,description=excluded.description,is_active=true;

insert into public.organization_modules (organization_id,module_code,is_enabled)
select id,'banking',true from public.organizations
on conflict (organization_id,module_code) do update set is_enabled=true;

insert into public.organization_bank_accounts (organization_id,bank_name,account_name,iban,currency,created_by)
select o.id,'T. Garanti Bankası','Ana Tahsilat Hesabı','TR480006200115100006290081','TRY',m.user_id
from public.organizations o
join lateral (
  select user_id from public.organization_memberships
  where organization_id=o.id and is_active=true and role in ('owner','admin')
  order by created_at asc limit 1
) m on true
on conflict (organization_id,iban) do nothing;

create index if not exists organization_bank_accounts_org_idx on public.organization_bank_accounts(organization_id,is_active);
create index if not exists bank_transactions_org_date_idx on public.bank_transactions(organization_id,transaction_date desc,created_at desc);
create index if not exists bank_transactions_reconciliation_idx on public.bank_transactions(organization_id,reconciliation_status,transaction_date desc);
