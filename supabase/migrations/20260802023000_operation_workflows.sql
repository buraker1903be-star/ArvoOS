-- Operation workflow storage. Applied to production before this migration was committed.
create table if not exists public.operation_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  customer_name text, description text,
  status text not null default 'planned' check (status in ('planned','in_progress','blocked','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  start_date date, due_date date, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (due_date is null or start_date is null or due_date >= start_date)
);
create table if not exists public.operation_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.operation_workflows(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  is_completed boolean not null default false, sort_order integer not null default 0 check (sort_order >= 0),
  completed_by uuid references auth.users(id), completed_at timestamptz, created_at timestamptz not null default now(),
  constraint operation_steps_completion_consistency check ((not is_completed and completed_at is null and completed_by is null) or (is_completed and completed_at is not null and completed_by is not null))
);
alter table public.operation_workflows enable row level security;
alter table public.operation_steps enable row level security;
grant select,insert,update,delete on public.operation_workflows, public.operation_steps to authenticated;
-- Policies are idempotently installed by the production schema rollout and intentionally kept in database history.
