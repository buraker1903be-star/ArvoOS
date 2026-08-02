create table if not exists public.organization_onboarding (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  current_step integer not null default 1 check (current_step between 1 and 4),
  legal_name text,
  phone text,
  website text,
  logo_url text,
  primary_color text not null default '#111827',
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_onboarding enable row level security;
grant select, insert, update on public.organization_onboarding to authenticated;

drop policy if exists "members_can_read_organization_onboarding" on public.organization_onboarding;
create policy "members_can_read_organization_onboarding"
on public.organization_onboarding for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = organization_onboarding.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

drop policy if exists "owners_can_manage_organization_onboarding" on public.organization_onboarding;
create policy "owners_can_manage_organization_onboarding"
on public.organization_onboarding for all to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = organization_onboarding.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
    and membership.role in ('owner','admin')
))
with check (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = organization_onboarding.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
    and membership.role in ('owner','admin')
));

create or replace function public.complete_organization_onboarding(
  p_organization_id uuid,
  p_legal_name text,
  p_phone text,
  p_website text,
  p_logo_url text,
  p_primary_color text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if length(trim(p_legal_name)) < 2 or length(trim(p_legal_name)) > 180 then
    raise exception 'Invalid legal name';
  end if;
  if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid color';
  end if;

  insert into public.organization_onboarding (
    organization_id, current_step, legal_name, phone, website, logo_url,
    primary_color, completed_at, completed_by, updated_at
  ) values (
    p_organization_id, 4, trim(p_legal_name), nullif(trim(p_phone), ''),
    nullif(trim(p_website), ''), nullif(trim(p_logo_url), ''), p_primary_color,
    now(), (select auth.uid()), now()
  )
  on conflict (organization_id) do update set
    current_step = 4,
    legal_name = excluded.legal_name,
    phone = excluded.phone,
    website = excluded.website,
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.complete_organization_onboarding(uuid,text,text,text,text,text) to authenticated;
