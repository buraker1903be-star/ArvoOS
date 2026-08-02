create table if not exists public.crm_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  customer_name text not null check (char_length(customer_name) between 2 and 180),
  contact_email text,
  contact_phone text,
  stage text not null default 'lead' check (stage in ('lead','qualified','proposal','contract','payment','won','lost')),
  estimated_value bigint not null default 0 check (estimated_value >= 0),
  probability integer not null default 10 check (probability between 0 and 100),
  expected_close_date date,
  owner_user_id uuid references auth.users(id) on delete set null,
  source text,
  notes text,
  lost_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_opportunities enable row level security;
grant select, insert, update on public.crm_opportunities to authenticated;

create policy "members_read_own_crm_opportunities"
on public.crm_opportunities for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = crm_opportunities.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

create policy "members_create_crm_opportunities"
on public.crm_opportunities for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = crm_opportunities.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  )
);

create policy "members_update_own_crm_opportunities"
on public.crm_opportunities for update to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = crm_opportunities.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
))
with check (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = crm_opportunities.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

create index if not exists crm_opportunities_org_stage_idx
  on public.crm_opportunities(organization_id, stage, updated_at desc);
create index if not exists crm_opportunities_close_date_idx
  on public.crm_opportunities(organization_id, expected_close_date)
  where expected_close_date is not null;
