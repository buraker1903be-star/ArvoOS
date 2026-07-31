create or replace function public.save_branch(
  target_organization_id uuid,
  target_branch_id uuid,
  target_name text,
  target_code text,
  target_address text,
  target_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'organization.manage') then
    raise exception 'Bu işlem için organizasyon yönetme yetkisi gerekiyor.';
  end if;

  if nullif(trim(target_name), '') is null or nullif(trim(target_code), '') is null then
    raise exception 'Şube adı ve kodu zorunludur.';
  end if;

  if target_branch_id is null then
    insert into public.branches (organization_id, name, code, address, is_active)
    values (target_organization_id, trim(target_name), lower(trim(target_code)), nullif(trim(target_address), ''), target_is_active)
    returning id into saved_id;
  else
    update public.branches
       set name = trim(target_name),
           code = lower(trim(target_code)),
           address = nullif(trim(target_address), ''),
           is_active = target_is_active
     where id = target_branch_id
       and organization_id = target_organization_id
    returning id into saved_id;

    if saved_id is null then raise exception 'Şube bulunamadı.'; end if;
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_organization_id, auth.uid(), case when target_branch_id is null then 'branch.created' else 'branch.updated' end, 'branch', saved_id::text);

  return saved_id;
end;
$$;

create or replace function public.save_department(
  target_organization_id uuid,
  target_department_id uuid,
  target_branch_id uuid,
  target_name text,
  target_code text,
  target_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'organization.manage') then
    raise exception 'Bu işlem için organizasyon yönetme yetkisi gerekiyor.';
  end if;

  if nullif(trim(target_name), '') is null or nullif(trim(target_code), '') is null then
    raise exception 'Departman adı ve kodu zorunludur.';
  end if;

  if target_branch_id is not null and not exists (
    select 1 from public.branches where id = target_branch_id and organization_id = target_organization_id
  ) then
    raise exception 'Seçilen şube bu organizasyona ait değil.';
  end if;

  if target_department_id is null then
    insert into public.departments (organization_id, branch_id, name, code, is_active)
    values (target_organization_id, target_branch_id, trim(target_name), lower(trim(target_code)), target_is_active)
    returning id into saved_id;
  else
    update public.departments
       set branch_id = target_branch_id,
           name = trim(target_name),
           code = lower(trim(target_code)),
           is_active = target_is_active
     where id = target_department_id
       and organization_id = target_organization_id
    returning id into saved_id;

    if saved_id is null then raise exception 'Departman bulunamadı.'; end if;
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (target_organization_id, auth.uid(), case when target_department_id is null then 'department.created' else 'department.updated' end, 'department', saved_id::text);

  return saved_id;
end;
$$;

grant execute on function public.save_branch(uuid, uuid, text, text, text, boolean) to authenticated;
grant execute on function public.save_department(uuid, uuid, uuid, text, text, boolean) to authenticated;
