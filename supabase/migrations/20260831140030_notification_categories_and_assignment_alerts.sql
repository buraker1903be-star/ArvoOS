create or replace function private.notify_crm_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  assigner_name text;
begin
  if new.assigned_employee_id is null
     or (tg_op = 'UPDATE' and new.assigned_employee_id is not distinct from old.assigned_employee_id) then
    return new;
  end if;

  select employee.user_id into target_user_id
  from public.hr_employees employee
  where employee.id = new.assigned_employee_id
    and employee.organization_id = new.organization_id
    and employee.employment_status = 'active';

  if target_user_id is null or target_user_id = (select auth.uid()) then return new; end if;

  select employee.full_name into assigner_name
  from public.hr_employees employee
  where employee.organization_id = new.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  ) values (
    new.organization_id,
    target_user_id,
    'organization',
    'sales_assignment',
    'Yeni talep atandı',
    coalesce(assigner_name, 'Yönetim') || ' tarafından ' || coalesce(new.customer_name, 'bir müşteri') ||
      ' müşterisine ait “' || coalesce(new.title, 'Yeni Talep') || '” talebi size atandı.',
    '/panel/crm/requests/' || new.id::text,
    jsonb_build_object('opportunity_id', new.id, 'assigned_employee_id', new.assigned_employee_id, 'assigned_by', (select auth.uid()))
  );
  return new;
end;
$$;

revoke all on function private.notify_crm_assignment() from public, anon, authenticated;
drop trigger if exists notify_crm_assignment on public.crm_opportunities;
create trigger notify_crm_assignment
after insert or update of assigned_employee_id on public.crm_opportunities
for each row execute function private.notify_crm_assignment();

create or replace function private.notify_operation_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  assigner_name text;
begin
  if new.assigned_employee_id is null
     or (tg_op = 'UPDATE' and new.assigned_employee_id is not distinct from old.assigned_employee_id) then
    return new;
  end if;

  select employee.user_id into target_user_id
  from public.hr_employees employee
  where employee.id = new.assigned_employee_id
    and employee.organization_id = new.organization_id
    and employee.employment_status = 'active';

  if target_user_id is null or target_user_id = (select auth.uid()) then return new; end if;

  select employee.full_name into assigner_name
  from public.hr_employees employee
  where employee.organization_id = new.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  ) values (
    new.organization_id,
    target_user_id,
    'organization',
    'operation_assignment',
    'Yeni operasyon işi atandı',
    coalesce(assigner_name, 'Yönetim') || ' tarafından ' || coalesce(new.customer_name, 'kurum içi') ||
      ' kaydına ait “' || coalesce(new.title, 'Yeni İş') || '” operasyonu size atandı.',
    '/panel/operations/' || new.id::text,
    jsonb_build_object('workflow_id', new.id, 'assigned_employee_id', new.assigned_employee_id, 'assigned_by', (select auth.uid()))
  );
  return new;
end;
$$;

revoke all on function private.notify_operation_assignment() from public, anon, authenticated;
drop trigger if exists notify_operation_assignment on public.operation_workflows;
create trigger notify_operation_assignment
after insert or update of assigned_employee_id on public.operation_workflows
for each row execute function private.notify_operation_assignment();

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
    and (p_target_user_id is null or target.user_id = p_target_user_id);

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.send_management_announcement(uuid, text, text, uuid) from public, anon;
grant execute on function public.send_management_announcement(uuid, text, text, uuid) to authenticated;

create index if not exists notifications_category_user_created_idx
  on public.notifications (organization_id, category, user_id, created_at desc);
