create table if not exists public.crm_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  customer_name text not null check (char_length(customer_name) between 2 and 160),
  email text,
  phone text,
  status text not null default 'new' check (status in ('new','qualified','proposal','won','lost')),
  estimated_value numeric(14,2) not null default 0 check (estimated_value >= 0),
  notes text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_requests_org_created_idx on public.crm_requests (organization_id, created_at desc);
alter table public.crm_requests enable row level security;
grant select, insert, update, delete on public.crm_requests to authenticated;
create policy "members_can_read_organization_crm_requests" on public.crm_requests for select to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = crm_requests.organization_id and m.user_id = (select auth.uid()) and m.is_active = true));
create policy "members_can_create_organization_crm_requests" on public.crm_requests for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.organization_memberships m where m.organization_id = crm_requests.organization_id and m.user_id = (select auth.uid()) and m.is_active = true));
create policy "members_can_update_organization_crm_requests" on public.crm_requests for update to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = crm_requests.organization_id and m.user_id = (select auth.uid()) and m.is_active = true)) with check (exists (select 1 from public.organization_memberships m where m.organization_id = crm_requests.organization_id and m.user_id = (select auth.uid()) and m.is_active = true));
create policy "managers_can_delete_organization_crm_requests" on public.crm_requests for delete to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = crm_requests.organization_id and m.user_id = (select auth.uid()) and m.is_active = true and m.role in ('owner','admin')));
