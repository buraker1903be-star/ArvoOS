create table if not exists public.account_parties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_type text not null check (party_type in ('customer','supplier','both')),
  name text not null check (char_length(name) between 2 and 180),
  tax_number text,
  tax_office text,
  email text,
  phone text,
  address text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table if not exists public.account_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null,
  entry_type text not null check (entry_type in ('debit','credit')),
  source_type text not null default 'manual' check (source_type in ('manual','invoice','payment','expense','adjustment')),
  amount bigint not null check (amount > 0),
  currency text not null default 'TRY',
  description text not null check (char_length(description) between 2 and 500),
  reference_no text,
  transaction_date date not null default current_date,
  due_date date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint account_entries_party_org_fk
    foreign key (party_id, organization_id)
    references public.account_parties(id, organization_id)
    on delete cascade
);

alter table public.account_parties enable row level security;
alter table public.account_entries enable row level security;
grant select, insert, update on public.account_parties to authenticated;
grant select, insert on public.account_entries to authenticated;

create policy "members_read_own_account_parties" on public.account_parties for select to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id = account_parties.organization_id and m.user_id = (select auth.uid()) and m.is_active
));
create policy "owners_manage_account_parties" on public.account_parties for all to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id = account_parties.organization_id and m.user_id = (select auth.uid()) and m.is_active and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_memberships m where m.organization_id = account_parties.organization_id and m.user_id = (select auth.uid()) and m.is_active and m.role in ('owner','admin')
));

create policy "members_read_own_account_entries" on public.account_entries for select to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id = account_entries.organization_id and m.user_id = (select auth.uid()) and m.is_active
));
create policy "owners_create_account_entries" on public.account_entries for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.organization_memberships m where m.organization_id = account_entries.organization_id and m.user_id = (select auth.uid()) and m.is_active and m.role in ('owner','admin')
  ) and exists (
    select 1 from public.account_parties p where p.id = account_entries.party_id and p.organization_id = account_entries.organization_id
  )
);

insert into public.arvo_modules (code,name,description,sort_order,is_active)
values ('accounts','Cari Hesaplar','Müşteri ve tedarikçi bakiye ve hareket yönetimi',75,true)
on conflict (code) do update set name=excluded.name,description=excluded.description,is_active=true;

insert into public.organization_modules (organization_id,module_code,is_enabled)
select id,'accounts',true from public.organizations
on conflict (organization_id,module_code) do update set is_enabled=true;

create index if not exists account_parties_org_type_idx on public.account_parties(organization_id,party_type,name);
create index if not exists account_entries_party_date_idx on public.account_entries(party_id,transaction_date desc,created_at desc);
