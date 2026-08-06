create schema if not exists private;

create or replace function private.is_arvoos_founder()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    join public.organizations organization
      on organization.id = membership.organization_id
    where organization.slug = 'arvo-os'
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role = 'owner'
  );
$$;

revoke all on function private.is_arvoos_founder() from public;
revoke all on function private.is_arvoos_founder() from anon;
grant execute on function private.is_arvoos_founder() to authenticated;

drop policy if exists "founder_can_read_all_organizations" on public.organizations;
create policy "founder_can_read_all_organizations"
on public.organizations for select to authenticated
using ((select private.is_arvoos_founder()));

drop policy if exists "founder_can_update_all_organizations" on public.organizations;
create policy "founder_can_update_all_organizations"
on public.organizations for update to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

drop policy if exists "founder_can_read_all_organization_modules" on public.organization_modules;
create policy "founder_can_read_all_organization_modules"
on public.organization_modules for select to authenticated
using ((select private.is_arvoos_founder()));

drop policy if exists "founder_can_update_all_organization_modules" on public.organization_modules;
create policy "founder_can_update_all_organization_modules"
on public.organization_modules for update to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

drop policy if exists "founder_can_read_all_organization_memberships" on public.organization_memberships;
create policy "founder_can_read_all_organization_memberships"
on public.organization_memberships for select to authenticated
using ((select private.is_arvoos_founder()));

drop policy if exists "founder_can_read_all_crm_requests" on public.crm_requests;
create policy "founder_can_read_all_crm_requests"
on public.crm_requests for select to authenticated
using ((select private.is_arvoos_founder()));
