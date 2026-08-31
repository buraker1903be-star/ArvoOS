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
    where workflow.id = target_contract.workflow_id
      and employee.user_id is not null
      and employee.employment_status = 'active'
    union
    select membership.user_id
    from public.organization_memberships membership
    where membership.organization_id = target_contract.organization_id
      and membership.is_active = true
      and membership.role::text in ('owner', 'admin', 'manager')
  ) recipient
  where recipient.user_id is not null;
end;
$$;

revoke all on function public.send_customer_file_message(text, text) from public;
grant execute on function public.send_customer_file_message(text, text) to anon, authenticated;

create or replace function public.send_management_announcement(
  p_organization_id uuid,
  p_title text,
  p_message text,
  p_target_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_membership public.organization_memberships%rowtype;
  sender_name text;
  inserted_count integer;
begin
  select membership.* into sender_membership
  from public.organization_memberships membership
  where membership.user_id = (select auth.uid())
    and membership.organization_id = p_organization_id
    and membership.is_active
    and membership.role in ('owner', 'admin', 'manager')
  order by membership.created_at
  limit 1;

  if sender_membership.id is null then raise exception 'Duyuru gönderme yetkiniz yok.'; end if;
  if length(trim(coalesce(p_title, ''))) not between 3 and 120 then raise exception 'Duyuru başlığı 3-120 karakter olmalı.'; end if;
  if length(trim(coalesce(p_message, ''))) not between 3 and 2000 then raise exception 'Duyuru metni 3-2000 karakter olmalı.'; end if;

  select employee.full_name into sender_name
  from public.hr_employees employee
  where employee.organization_id = sender_membership.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  if p_target_user_id is not null and not exists (
    select 1 from public.organization_memberships target
    where target.organization_id = sender_membership.organization_id
      and target.user_id = p_target_user_id and target.is_active
  ) then raise exception 'Seçilen personel bu kurumda aktif değil.'; end if;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select
    sender_membership.organization_id,
    target.user_id,
    'organization',
    'management_announcement',
    trim(p_title),
    trim(p_message),
    '/panel/notifications?kategori=duyurular',
    jsonb_build_object('sent_by', (select auth.uid()), 'sender_name', coalesce(sender_name, 'Yönetim'))
  from public.organization_memberships target
  where target.organization_id = sender_membership.organization_id
    and target.is_active
    and (
      p_target_user_id is null
      or target.user_id = p_target_user_id
      or target.user_id = (select auth.uid())
    );

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.send_management_announcement(uuid, text, text, uuid) from public, anon;
grant execute on function public.send_management_announcement(uuid, text, text, uuid) to authenticated;
