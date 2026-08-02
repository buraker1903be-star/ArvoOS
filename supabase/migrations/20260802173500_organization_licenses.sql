create table if not exists public.organization_licenses (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  plan_code public.plan_code not null,
  license_status text not null default 'trialing' check (license_status in ('trialing','active','past_due','suspended','canceled')),
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  user_limit integer not null check (user_limit > 0),
  storage_limit_mb bigint not null check (storage_limit_mb > 0),
  ai_credit_limit bigint not null check (ai_credit_limit >= 0),
  ai_credits_used bigint not null default 0 check (ai_credits_used >= 0),
  module_limits jsonb not null default '{}'::jsonb,
  suspended_at timestamptz,
  suspension_reason text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_licenses enable row level security;
grant select, insert, update on public.organization_licenses to authenticated;

drop policy if exists "members_can_read_organization_license" on public.organization_licenses;
create policy "members_can_read_organization_license"
on public.organization_licenses for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = organization_licenses.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

drop policy if exists "founder_can_manage_organization_licenses" on public.organization_licenses;
create policy "founder_can_manage_organization_licenses"
on public.organization_licenses for all to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

create or replace function private.default_license_limits(p_plan public.plan_code)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'starter'::public.plan_code then jsonb_build_object('user_limit', 5, 'storage_limit_mb', 5120, 'ai_credit_limit', 50000)
    when 'professional'::public.plan_code then jsonb_build_object('user_limit', 25, 'storage_limit_mb', 51200, 'ai_credit_limit', 500000)
    else jsonb_build_object('user_limit', 250, 'storage_limit_mb', 512000, 'ai_credit_limit', 5000000)
  end;
$$;

revoke all on function private.default_license_limits(public.plan_code) from public;
revoke all on function private.default_license_limits(public.plan_code) from anon;
revoke all on function private.default_license_limits(public.plan_code) from authenticated;

create or replace function private.create_default_organization_license()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  limits jsonb;
begin
  limits := private.default_license_limits(new.plan_code);
  insert into public.organization_licenses (
    organization_id, plan_code, license_status, trial_started_at, trial_ends_at,
    user_limit, storage_limit_mb, ai_credit_limit
  ) values (
    new.id, new.plan_code, 'trialing', now(), now() + interval '14 days',
    (limits ->> 'user_limit')::integer,
    (limits ->> 'storage_limit_mb')::bigint,
    (limits ->> 'ai_credit_limit')::bigint
  ) on conflict (organization_id) do nothing;
  return new;
end;
$$;

revoke all on function private.create_default_organization_license() from public;
revoke all on function private.create_default_organization_license() from anon;
revoke all on function private.create_default_organization_license() from authenticated;

drop trigger if exists create_default_organization_license on public.organizations;
create trigger create_default_organization_license
after insert on public.organizations
for each row execute function private.create_default_organization_license();

insert into public.organization_licenses (
  organization_id, plan_code, license_status, trial_started_at, trial_ends_at,
  user_limit, storage_limit_mb, ai_credit_limit
)
select
  organization.id,
  organization.plan_code,
  case when organization.status = 'suspended' then 'suspended' else 'active' end,
  organization.created_at,
  null,
  (private.default_license_limits(organization.plan_code) ->> 'user_limit')::integer,
  (private.default_license_limits(organization.plan_code) ->> 'storage_limit_mb')::bigint,
  (private.default_license_limits(organization.plan_code) ->> 'ai_credit_limit')::bigint
from public.organizations organization
on conflict (organization_id) do nothing;
