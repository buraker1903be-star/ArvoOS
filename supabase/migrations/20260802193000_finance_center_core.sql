create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  transaction_type text not null check (transaction_type in ('income','expense')),
  status text not null default 'planned' check (status in ('planned','paid','canceled')),
  title text not null check (char_length(title) between 2 and 180),
  counterparty text,
  category text,
  amount bigint not null check (amount > 0),
  currency text not null default 'TRY',
  due_date date,
  paid_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_transactions enable row level security;
grant select, insert, update on public.finance_transactions to authenticated;

create policy "members_read_own_finance_transactions"
on public.finance_transactions for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = finance_transactions.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

create policy "owners_create_finance_transactions"
on public.finance_transactions for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = finance_transactions.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role in ('owner','admin')
  )
);

create policy "owners_update_finance_transactions"
on public.finance_transactions for update to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = finance_transactions.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
    and membership.role in ('owner','admin')
))
with check (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = finance_transactions.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
    and membership.role in ('owner','admin')
));

insert into public.arvo_modules (code,name,description,sort_order,is_active)
values ('finance','Finans Merkezi','Nakit akışı, gelir-gider ve tahsilat yönetimi',70,true)
on conflict (code) do update set name=excluded.name,description=excluded.description,is_active=true;

insert into public.organization_modules (organization_id,module_code,is_enabled)
select id,'finance',true from public.organizations
on conflict (organization_id,module_code) do update set is_enabled=true;

create index if not exists finance_transactions_org_status_idx
  on public.finance_transactions(organization_id,status,due_date);
create index if not exists finance_transactions_org_type_idx
  on public.finance_transactions(organization_id,transaction_type,created_at desc);
