create table if not exists public.customer_file_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.crm_contracts(id) on delete cascade,
  workflow_id uuid references public.operation_workflows(id) on delete set null,
  sender_type text not null check (sender_type in ('customer', 'staff')),
  sender_user_id uuid references auth.users(id) on delete set null,
  sender_name text not null,
  body text not null check (char_length(body) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists customer_file_messages_contract_created_idx
  on public.customer_file_messages(contract_id, created_at);
create index if not exists customer_file_messages_workflow_unread_idx
  on public.customer_file_messages(workflow_id, created_at desc)
  where sender_type = 'customer' and read_at is null;

alter table public.customer_file_messages enable row level security;
revoke all on table public.customer_file_messages from public, anon;
grant select, insert, update on table public.customer_file_messages to authenticated;

create policy "organization_members_read_customer_file_messages"
on public.customer_file_messages for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = customer_file_messages.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

create policy "organization_members_reply_to_customer_file_messages"
on public.customer_file_messages for insert to authenticated
with check (
  sender_type = 'staff'
  and sender_user_id = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = customer_file_messages.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  )
);

create policy "organization_members_mark_customer_messages_read"
on public.customer_file_messages for update to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = customer_file_messages.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
))
with check (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = customer_file_messages.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

create or replace function public.list_customer_file_messages(p_tracking_code text)
returns table(sender_type text, sender_name text, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select message.sender_type, message.sender_name, message.body, message.created_at
  from public.crm_contracts contract
  join public.customer_file_messages message on message.contract_id = contract.id
  where contract.tracking_code = upper(regexp_replace(trim(p_tracking_code), '[^A-Za-z0-9]', '', 'g'))
    and contract.status in ('signed', 'completed')
  order by message.created_at asc
  limit 200;
$$;

create or replace function public.send_customer_file_message(p_tracking_code text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_contract public.crm_contracts%rowtype;
  clean_body text := trim(p_body);
begin
  if char_length(clean_body) < 2 or char_length(clean_body) > 2000 then
    raise exception 'Mesaj 2 ile 2000 karakter arasında olmalıdır.';
  end if;

  select contract.* into target_contract
  from public.crm_contracts contract
  where contract.tracking_code = upper(regexp_replace(trim(p_tracking_code), '[^A-Za-z0-9]', '', 'g'))
    and contract.status in ('signed', 'completed')
  limit 1;

  if target_contract.id is null then
    raise exception 'Dosya bulunamadı.';
  end if;

  if exists (
    select 1 from public.customer_file_messages recent
    where recent.contract_id = target_contract.id
      and recent.sender_type = 'customer'
      and recent.created_at > now() - interval '20 seconds'
  ) then
    raise exception 'Yeni bir mesaj göndermeden önce kısa bir süre bekleyin.';
  end if;

  insert into public.customer_file_messages (
    organization_id, contract_id, workflow_id, sender_type, sender_name, body
  ) values (
    target_contract.organization_id, target_contract.id, target_contract.workflow_id,
    'customer', 'Müşteri', clean_body
  );

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select distinct
    target_contract.organization_id,
    recipient.user_id,
    'organization',
    'customer_message',
    'Müşteriden yeni mesaj',
    target_contract.contract_no || ' numaralı dosya için müşteri mesaj gönderdi.',
    case when target_contract.workflow_id is not null
      then '/panel/operations/' || target_contract.workflow_id::text
      else '/panel/crm/contracts/' || target_contract.id::text end,
    jsonb_build_object('contract_id', target_contract.id, 'workflow_id', target_contract.workflow_id)
  from (
    select employee.user_id
    from public.operation_workflows workflow
    join public.hr_employees employee on employee.id = workflow.assigned_employee_id
    where workflow.id = target_contract.workflow_id and employee.user_id is not null
    union
    select membership.user_id
    from public.organization_memberships membership
    where membership.organization_id = target_contract.organization_id
      and membership.is_active = true
      and membership.role::text in ('owner', 'admin', 'manager')
      and not exists (
        select 1
        from public.operation_workflows workflow
        join public.hr_employees employee on employee.id = workflow.assigned_employee_id
        where workflow.id = target_contract.workflow_id and employee.user_id is not null
      )
  ) recipient
  where recipient.user_id is not null;
end;
$$;

revoke all on function public.list_customer_file_messages(text) from public;
revoke all on function public.send_customer_file_message(text, text) from public;
grant execute on function public.list_customer_file_messages(text) to anon, authenticated;
grant execute on function public.send_customer_file_message(text, text) to anon, authenticated;
