alter table public.crm_internal_comments
  drop constraint if exists crm_internal_comments_context_type_check;

alter table public.crm_internal_comments
  add constraint crm_internal_comments_context_type_check
  check (context_type in ('request','proposal','contract','operation'));

create or replace function private.arvo_can_access_opportunity(target_opportunity uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (
  select 1
  from public.crm_opportunities o
  join public.organization_memberships m on m.organization_id=o.organization_id
    and m.user_id=(select auth.uid()) and m.is_active=true
  left join public.hr_employees sales_employee on sales_employee.id=o.assigned_employee_id
    and sales_employee.organization_id=o.organization_id and sales_employee.employment_status='active'
  where o.id=target_opportunity
    and (
      m.role::text in ('owner','admin','manager')
      or sales_employee.user_id=(select auth.uid())
      or exists (
        select 1
        from public.crm_contracts contract
        join public.operation_workflows workflow on workflow.id=contract.workflow_id
        join public.hr_employees operation_employee on operation_employee.id=workflow.assigned_employee_id
          and operation_employee.organization_id=workflow.organization_id
          and operation_employee.employment_status='active'
        where contract.opportunity_id=o.id
          and contract.organization_id=o.organization_id
          and operation_employee.user_id=(select auth.uid())
      )
    )
) $$;

revoke all on function private.arvo_can_access_opportunity(uuid) from public, anon;
grant execute on function private.arvo_can_access_opportunity(uuid) to authenticated, service_role;

insert into public.crm_internal_comments (
  organization_id, opportunity_id, context_type, context_id, body, created_by, created_at
)
select
  old_comment.organization_id,
  contract.opportunity_id,
  'operation',
  old_comment.workflow_id,
  old_comment.body,
  old_comment.created_by,
  old_comment.created_at
from public.operation_workflow_comments old_comment
join public.crm_contracts contract
  on contract.workflow_id=old_comment.workflow_id
 and contract.organization_id=old_comment.organization_id
where old_comment.created_by is not null
  and not exists (
    select 1 from public.crm_internal_comments current_comment
    where current_comment.organization_id=old_comment.organization_id
      and current_comment.opportunity_id=contract.opportunity_id
      and current_comment.context_type='operation'
      and current_comment.context_id=old_comment.workflow_id
      and current_comment.created_by=old_comment.created_by
      and current_comment.created_at=old_comment.created_at
      and current_comment.body=old_comment.body
  );

comment on table public.crm_internal_comments is
  'Talep, teklif, sözleşme ve operasyon boyunca yalnızca kurum içi kullanıcıların görebildiği ortak görüşme notları.';
