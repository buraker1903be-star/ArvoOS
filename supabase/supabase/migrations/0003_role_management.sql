create or replace function public.save_organization_role(
  target_organization_id uuid,
  target_role_id uuid,
  target_name text,
  target_code text,
  target_description text,
  target_permission_codes text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_role_id uuid;
  normalized_code text;
begin
  if not public.has_permission(target_organization_id, 'roles.manage') then
    raise exception 'Bu işlem için rol ve yetki yönetme izni gerekiyor.';
  end if;

  if nullif(trim(target_name), '') is null then
    raise exception 'Rol adı zorunludur.';
  end if;

  normalized_code := lower(regexp_replace(trim(target_code), '[^a-z0-9_]+', '_', 'g'));
  if normalized_code = '' then
    raise exception 'Geçerli bir rol kodu girilmelidir.';
  end if;

  if target_role_id is null then
    insert into public.roles (organization_id, name, code, description, is_system)
    values (target_organization_id, trim(target_name), normalized_code, nullif(trim(target_description), ''), false)
    returning id into saved_role_id;
  else
    select id into saved_role_id
    from public.roles
    where id = target_role_id
      and organization_id = target_organization_id;

    if saved_role_id is null then
      raise exception 'Rol bulunamadı.';
    end if;

    update public.roles
    set name = trim(target_name),
        code = normalized_code,
        description = nullif(trim(target_description), '')
    where id = saved_role_id;
  end if;

  delete from public.role_permissions where role_id = saved_role_id;

  insert into public.role_permissions (role_id, permission_id)
  select saved_role_id, p.id
  from public.permissions p
  where p.code = any(coalesce(target_permission_codes, array[]::text[]));

  insert into public.activity_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    target_organization_id,
    auth.uid(),
    case when target_role_id is null then 'role.created' else 'role.updated' end,
    'role',
    saved_role_id::text,
    jsonb_build_object(
      'name', trim(target_name),
      'code', normalized_code,
      'permissions', coalesce(target_permission_codes, array[]::text[])
    )
  );

  return saved_role_id;
end;
$$;

grant execute on function public.save_organization_role(uuid, uuid, text, text, text, text[]) to authenticated;
