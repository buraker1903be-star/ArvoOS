-- Permanent CRM deletion is restricted to active organization owners/admins.
-- Application server actions apply additional business-integrity checks before deleting.

grant delete on table public.crm_opportunities to authenticated;
grant delete on table public.crm_proposals to authenticated;
grant delete on table public.crm_contracts to authenticated;

drop policy if exists "owners admins delete crm opportunities" on public.crm_opportunities;
create policy "owners admins delete crm opportunities"
on public.crm_opportunities
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = crm_opportunities.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role::text in ('owner', 'admin')
  )
);

drop policy if exists "owners admins delete crm proposals" on public.crm_proposals;
create policy "owners admins delete crm proposals"
on public.crm_proposals
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = crm_proposals.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role::text in ('owner', 'admin')
  )
);

drop policy if exists "owners admins delete crm contracts" on public.crm_contracts;
create policy "owners admins delete crm contracts"
on public.crm_contracts
for delete
to authenticated
using (
  exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = crm_contracts.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role::text in ('owner', 'admin')
  )
);
