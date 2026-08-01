-- Operation workflow storage and tenant-isolated RLS.
create table if not exists public.operation_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  customer_name text, description text,
  status text not null default 'planned' check (status in ('planned','in_progress','blocked','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  start_date date, due_date date, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint operation_workflows_dates_check check (due_date is null or start_date is null or due_date >= start_date),
  constraint operation_workflows_id_organization_unique unique(id,organization_id)
);
create index if not exists operation_workflows_org_status_idx on public.operation_workflows(organization_id,status,created_at desc);

create table if not exists public.operation_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null,
  title text not null check (char_length(title) between 2 and 180),
  is_completed boolean not null default false, sort_order integer not null default 0 check (sort_order >= 0),
  completed_by uuid references auth.users(id), completed_at timestamptz, created_at timestamptz not null default now(),
  constraint operation_steps_workflow_org_fkey foreign key(workflow_id,organization_id) references public.operation_workflows(id,organization_id) on delete cascade,
  constraint operation_steps_completion_consistency check ((not is_completed and completed_at is null and completed_by is null) or (is_completed and completed_at is not null and completed_by is not null))
);
create index if not exists operation_steps_workflow_order_idx on public.operation_steps(workflow_id,sort_order,id);

alter table public.operation_workflows enable row level security;
alter table public.operation_steps enable row level security;
grant select,insert,update,delete on public.operation_workflows, public.operation_steps to authenticated;

drop policy if exists "members_read_operation_workflows" on public.operation_workflows;
create policy "members_read_operation_workflows" on public.operation_workflows for select to authenticated
using (exists(select 1 from public.organization_memberships m where m.organization_id=operation_workflows.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
drop policy if exists "members_create_operation_workflows" on public.operation_workflows;
create policy "members_create_operation_workflows" on public.operation_workflows for insert to authenticated
with check (created_by=(select auth.uid()) and exists(select 1 from public.organization_memberships m where m.organization_id=operation_workflows.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
drop policy if exists "members_update_operation_workflows" on public.operation_workflows;
create policy "members_update_operation_workflows" on public.operation_workflows for update to authenticated
using (exists(select 1 from public.organization_memberships m where m.organization_id=operation_workflows.organization_id and m.user_id=(select auth.uid()) and m.is_active=true))
with check (exists(select 1 from public.organization_memberships m where m.organization_id=operation_workflows.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
drop policy if exists "admins_delete_operation_workflows" on public.operation_workflows;
create policy "admins_delete_operation_workflows" on public.operation_workflows for delete to authenticated
using (exists(select 1 from public.organization_memberships m where m.organization_id=operation_workflows.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role in ('owner','admin')));

drop policy if exists "members_read_operation_steps" on public.operation_steps;
create policy "members_read_operation_steps" on public.operation_steps for select to authenticated
using (exists(select 1 from public.organization_memberships m where m.organization_id=operation_steps.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
drop policy if exists "members_create_operation_steps" on public.operation_steps;
create policy "members_create_operation_steps" on public.operation_steps for insert to authenticated
with check (exists(select 1 from public.organization_memberships m where m.organization_id=operation_steps.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
drop policy if exists "members_update_operation_steps" on public.operation_steps;
create policy "members_update_operation_steps" on public.operation_steps for update to authenticated
using (exists(select 1 from public.organization_memberships m where m.organization_id=operation_steps.organization_id and m.user_id=(select auth.uid()) and m.is_active=true))
with check (exists(select 1 from public.organization_memberships m where m.organization_id=operation_steps.organization_id and m.user_id=(select auth.uid()) and m.is_active=true));
drop policy if exists "admins_delete_operation_steps" on public.operation_steps;
create policy "admins_delete_operation_steps" on public.operation_steps for delete to authenticated
using (exists(select 1 from public.organization_memberships m where m.organization_id=operation_steps.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role in ('owner','admin')));
