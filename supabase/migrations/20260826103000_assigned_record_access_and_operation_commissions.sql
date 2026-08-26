create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

alter table public.hr_employees
  add column if not exists operation_commission_rate numeric(5,2) not null default 0
  check (operation_commission_rate between 0 and 100);

alter table public.operation_workflows
  add column if not exists assigned_employee_id uuid references public.hr_employees(id) on delete set null;

create index if not exists operation_workflows_assigned_employee_idx
  on public.operation_workflows(organization_id, assigned_employee_id);

create or replace function private.arvo_is_privileged_member(target_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.organization_memberships m
  where m.organization_id=target_org and m.user_id=(select auth.uid())
    and m.is_active=true and m.role::text in ('owner','admin','manager')
) $$;

create or replace function private.arvo_can_access_opportunity(target_opportunity uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.crm_opportunities o
  join public.organization_memberships m on m.organization_id=o.organization_id
    and m.user_id=(select auth.uid()) and m.is_active=true
  left join public.hr_employees e on e.id=o.assigned_employee_id
    and e.organization_id=o.organization_id and e.employment_status='active'
  where o.id=target_opportunity
    and (m.role::text in ('owner','admin','manager') or e.user_id=(select auth.uid()))
) $$;

create or replace function private.arvo_can_access_workflow(target_workflow uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1 from public.operation_workflows w
  join public.organization_memberships m on m.organization_id=w.organization_id
    and m.user_id=(select auth.uid()) and m.is_active=true
  left join public.hr_employees e on e.id=w.assigned_employee_id
    and e.organization_id=w.organization_id and e.employment_status='active'
  where w.id=target_workflow
    and (m.role::text in ('owner','admin','manager') or e.user_id=(select auth.uid()))
) $$;

revoke all on function private.arvo_is_privileged_member(uuid) from public, anon;
revoke all on function private.arvo_can_access_opportunity(uuid) from public, anon;
revoke all on function private.arvo_can_access_workflow(uuid) from public, anon;
grant execute on function private.arvo_is_privileged_member(uuid) to authenticated, service_role;
grant execute on function private.arvo_can_access_opportunity(uuid) to authenticated, service_role;
grant execute on function private.arvo_can_access_workflow(uuid) to authenticated, service_role;

create table if not exists public.hr_operation_commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  workflow_id uuid not null unique references public.operation_workflows(id) on delete restrict,
  contract_id uuid references public.crm_contracts(id) on delete set null,
  base_amount bigint not null default 0 check (base_amount >= 0),
  commission_rate numeric(5,2) not null check (commission_rate between 0 and 100),
  commission_amount bigint not null default 0 check (commission_amount >= 0),
  status text not null default 'accrued' check (status in ('accrued','approved','paid','cancelled')),
  accrued_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.hr_operation_commissions enable row level security;
grant select,insert,update on public.hr_operation_commissions to authenticated;

create policy "operation commissions readable" on public.hr_operation_commissions
for select to authenticated using (
  private.arvo_is_privileged_member(organization_id)
  or exists(select 1 from public.hr_employees e where e.id=employee_id
    and e.organization_id=hr_operation_commissions.organization_id
    and e.user_id=(select auth.uid()))
);
create policy "operation commissions manageable by managers" on public.hr_operation_commissions
for all to authenticated using (private.arvo_is_privileged_member(organization_id))
with check (private.arvo_is_privileged_member(organization_id));

create or replace function public.accrue_operation_commission()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare employee_rate numeric(5,2); contract_amount bigint := 0;
begin
  if new.status='completed' and old.status is distinct from 'completed'
    and new.assigned_employee_id is not null then
    select operation_commission_rate into employee_rate from public.hr_employees
      where id=new.assigned_employee_id and organization_id=new.organization_id
        and employment_status='active';
    if coalesce(employee_rate,0)>0 then
      if new.contract_id is not null then
        select coalesce(amount,0) into contract_amount from public.crm_contracts
          where id=new.contract_id and organization_id=new.organization_id;
      end if;
      insert into public.hr_operation_commissions(
        organization_id,employee_id,workflow_id,contract_id,
        base_amount,commission_rate,commission_amount
      ) values (
        new.organization_id,new.assigned_employee_id,new.id,new.contract_id,
        coalesce(contract_amount,0),employee_rate,
        round(coalesce(contract_amount,0)*employee_rate/100.0)
      ) on conflict(workflow_id) do nothing;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.accrue_operation_commission() from public,anon,authenticated;
create trigger accrue_operation_commission_on_completion
after update of status on public.operation_workflows
for each row execute function public.accrue_operation_commission();

drop policy "members_read_own_crm_opportunities" on public.crm_opportunities;
create policy "members_read_assigned_crm_opportunities" on public.crm_opportunities
for select to authenticated using(private.arvo_can_access_opportunity(id));
drop policy "members_update_own_crm_opportunities" on public.crm_opportunities;
create policy "members_update_assigned_crm_opportunities" on public.crm_opportunities
for update to authenticated using(private.arvo_can_access_opportunity(id))
with check(private.arvo_is_privileged_member(organization_id) or exists(
  select 1 from public.hr_employees e where e.id=assigned_employee_id
    and e.organization_id=crm_opportunities.organization_id
    and e.user_id=(select auth.uid()) and e.employment_status='active'
));
drop policy "members_create_crm_opportunities" on public.crm_opportunities;
create policy "members_create_assigned_crm_opportunities" on public.crm_opportunities
for insert to authenticated with check(created_by=(select auth.uid()) and (
  private.arvo_is_privileged_member(organization_id) or exists(
    select 1 from public.hr_employees e where e.id=assigned_employee_id
      and e.organization_id=crm_opportunities.organization_id
      and e.user_id=(select auth.uid()) and e.employment_status='active'
)));

drop policy "members read active proposals" on public.crm_proposals;
create policy "members read assigned proposals" on public.crm_proposals
for select to authenticated using(private.arvo_can_access_opportunity(opportunity_id)
  and (status='draft' or (status='sent' and (valid_until is null or valid_until >= (now() at time zone 'Europe/Istanbul')::date))
    or (status='archived' and archive_reason='expired')));
drop policy "members update proposals" on public.crm_proposals;
create policy "members update assigned proposals" on public.crm_proposals
for update to authenticated using(private.arvo_can_access_opportunity(opportunity_id))
with check(private.arvo_can_access_opportunity(opportunity_id));
drop policy "members create proposals" on public.crm_proposals;
create policy "members create assigned proposals" on public.crm_proposals
for insert to authenticated with check(created_by=(select auth.uid())
  and private.arvo_can_access_opportunity(opportunity_id));

drop policy "members read contracts" on public.crm_contracts;
create policy "members read assigned contracts" on public.crm_contracts
for select to authenticated using(private.arvo_can_access_opportunity(opportunity_id));
drop policy "members update contracts" on public.crm_contracts;
create policy "members update assigned contracts" on public.crm_contracts
for update to authenticated using(private.arvo_can_access_opportunity(opportunity_id))
with check(private.arvo_can_access_opportunity(opportunity_id));
drop policy "members create contracts" on public.crm_contracts;
create policy "members create assigned contracts" on public.crm_contracts
for insert to authenticated with check(created_by=(select auth.uid())
  and private.arvo_can_access_opportunity(opportunity_id));

drop policy "members_read_operation_workflows" on public.operation_workflows;
create policy "members_read_assigned_operation_workflows" on public.operation_workflows
for select to authenticated using(private.arvo_can_access_workflow(id));
drop policy "members_update_operation_workflows" on public.operation_workflows;
create policy "members_update_assigned_operation_workflows" on public.operation_workflows
for update to authenticated using(private.arvo_can_access_workflow(id))
with check(private.arvo_is_privileged_member(organization_id) or exists(
  select 1 from public.hr_employees e where e.id=assigned_employee_id
    and e.organization_id=operation_workflows.organization_id
    and e.user_id=(select auth.uid()) and e.employment_status='active'
));
drop policy "members_create_operation_workflows" on public.operation_workflows;
create policy "members_create_assigned_operation_workflows" on public.operation_workflows
for insert to authenticated with check(created_by=(select auth.uid()) and (
  private.arvo_is_privileged_member(organization_id) or exists(
    select 1 from public.hr_employees e where e.id=assigned_employee_id
      and e.organization_id=operation_workflows.organization_id
      and e.user_id=(select auth.uid()) and e.employment_status='active'
)));

drop policy "members_read_operation_steps" on public.operation_steps;
create policy "members_read_assigned_operation_steps" on public.operation_steps
for select to authenticated using(private.arvo_can_access_workflow(workflow_id));
drop policy "members_update_operation_steps" on public.operation_steps;
create policy "members_update_assigned_operation_steps" on public.operation_steps
for update to authenticated using(private.arvo_can_access_workflow(workflow_id))
with check(private.arvo_can_access_workflow(workflow_id));
drop policy "members_create_operation_steps" on public.operation_steps;
create policy "members_create_assigned_operation_steps" on public.operation_steps
for insert to authenticated with check(private.arvo_can_access_workflow(workflow_id));

drop policy "operation comments readable by organization members" on public.operation_workflow_comments;
create policy "operation comments readable by assigned members"
on public.operation_workflow_comments for select to authenticated
using(private.arvo_can_access_workflow(workflow_id));
drop policy "operation comments insertable by organization members" on public.operation_workflow_comments;
create policy "operation comments insertable by assigned members"
on public.operation_workflow_comments for insert to authenticated
with check(created_by=(select auth.uid()) and private.arvo_can_access_workflow(workflow_id));
