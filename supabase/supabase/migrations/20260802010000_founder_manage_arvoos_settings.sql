drop policy if exists "founder_can_update_arvoos_organization" on public.organizations;
create policy "founder_can_update_arvoos_organization"
on public.organizations for update to authenticated
using (
  slug = 'arvo-os'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = organizations.id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role = 'owner'
  )
)
with check (
  slug = 'arvo-os'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = organizations.id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role = 'owner'
  )
);

drop policy if exists "founder_can_update_arvoos_modules" on public.organization_modules;
create policy "founder_can_update_arvoos_modules"
on public.organization_modules for update to authenticated
using (
  exists (
    select 1
    from public.organizations organization
    join public.organization_memberships membership
      on membership.organization_id = organization.id
    where organization.id = organization_modules.organization_id
      and organization.slug = 'arvo-os'
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.organizations organization
    join public.organization_memberships membership
      on membership.organization_id = organization.id
    where organization.id = organization_modules.organization_id
      and organization.slug = 'arvo-os'
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role = 'owner'
  )
);
