create table if not exists public.message_read_states (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (channel_id, user_id),
  constraint message_read_states_channel_org_fk foreign key (channel_id, organization_id)
    references public.message_channels(id, organization_id) on delete cascade
);

alter table public.message_read_states enable row level security;
revoke all on public.message_read_states from public, anon;
grant select, insert, update on public.message_read_states to authenticated;

create policy "members read own message state"
on public.message_read_states for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = message_read_states.organization_id
      and membership.user_id = (select auth.uid()) and membership.is_active
  )
);

create policy "members create own message state"
on public.message_read_states for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = message_read_states.organization_id
      and membership.user_id = (select auth.uid()) and membership.is_active
  )
);

create policy "members update own message state"
on public.message_read_states for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create index if not exists message_read_states_user_idx
  on public.message_read_states (organization_id, user_id, last_read_at);

drop policy if exists "members_read_own_notifications" on public.notifications;
create policy "members_read_own_notifications"
on public.notifications for select to authenticated
using (
  (audience = 'organization' and (user_id is null or user_id = (select auth.uid())) and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = notifications.organization_id
      and membership.user_id = (select auth.uid()) and membership.is_active
  ))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
);

drop policy if exists "members_mark_own_notifications_read" on public.notifications;
create policy "members_mark_own_notifications_read"
on public.notifications for update to authenticated
using (
  (audience = 'organization' and (user_id is null or user_id = (select auth.uid())) and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = notifications.organization_id
      and membership.user_id = (select auth.uid()) and membership.is_active
  ))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
)
with check (
  (audience = 'organization' and (user_id is null or user_id = (select auth.uid())) and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = notifications.organization_id
      and membership.user_id = (select auth.uid()) and membership.is_active
  ))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
);

create or replace function private.notify_crm_internal_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer_name text;
  target_url text;
begin
  select opportunity.customer_name into customer_name
  from public.crm_opportunities opportunity where opportunity.id = new.opportunity_id;

  target_url := case new.context_type
    when 'proposal' then '/panel/crm/proposals/' || new.context_id::text
    when 'contract' then '/panel/crm/contracts/' || new.context_id::text
    when 'operation' then '/panel/operations/' || new.context_id::text
    else '/panel/crm/requests/' || new.opportunity_id::text
  end;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select distinct
    new.organization_id,
    recipient.user_id,
    'organization',
    'internal_comment',
    'Yeni kurum içi yorum',
    coalesce(customer_name, 'Bir müşteri') || ' kaydına yeni bir yorum eklendi.',
    target_url,
    jsonb_build_object(
      'comment_id', new.id, 'opportunity_id', new.opportunity_id,
      'context_type', new.context_type, 'context_id', new.context_id
    )
  from (
    select membership.user_id
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.is_active and membership.role::text in ('owner', 'admin', 'manager')
    union
    select sales_employee.user_id
    from public.crm_opportunities opportunity
    join public.hr_employees sales_employee on sales_employee.id = opportunity.assigned_employee_id
    where opportunity.id = new.opportunity_id and sales_employee.user_id is not null
    union
    select operation_employee.user_id
    from public.crm_contracts contract
    join public.operation_workflows workflow on workflow.id = contract.workflow_id
    join public.hr_employees operation_employee on operation_employee.id = workflow.assigned_employee_id
    where contract.opportunity_id = new.opportunity_id and operation_employee.user_id is not null
  ) recipient
  where recipient.user_id is not null and recipient.user_id <> new.created_by;

  return new;
end;
$$;

revoke all on function private.notify_crm_internal_comment() from public, anon, authenticated;
drop trigger if exists notify_crm_internal_comment on public.crm_internal_comments;
create trigger notify_crm_internal_comment
after insert on public.crm_internal_comments
for each row execute function private.notify_crm_internal_comment();

