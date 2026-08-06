create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role_id uuid references public.roles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  invited_by uuid not null references auth.users(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (organization_id, email, status)
);

create index if not exists organization_invitations_org_idx
  on public.organization_invitations(organization_id, invited_at desc);

alter table public.organization_invitations enable row level security;

create policy organization_invitations_read
on public.organization_invitations for select
using (public.has_permission(organization_id, 'users.read'));

create policy organization_invitations_manage
on public.organization_invitations for all
using (public.has_permission(organization_id, 'users.manage'))
with check (public.has_permission(organization_id, 'users.manage'));

create or replace function public.update_member_access(
  target_organization_id uuid,
  target_user_id uuid,
  target_role_id uuid,
  target_status public.membership_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission(target_organization_id, 'users.manage') then
    raise exception 'Kullanıcı yönetme yetkiniz yok.';
  end if;

  if target_user_id = auth.uid() and target_status <> 'active' then
    raise exception 'Kendi hesabınızı askıya alamazsınız.';
  end if;

  if not exists (
    select 1 from public.roles
    where id = target_role_id and organization_id = target_organization_id
  ) then
    raise exception 'Seçilen rol bu organizasyona ait değil.';
  end if;

  update public.organization_members
  set role_id = target_role_id,
      status = target_status,
      joined_at = case when target_status = 'active' and joined_at is null then now() else joined_at end
  where organization_id = target_organization_id and user_id = target_user_id;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_organization_id,
    auth.uid(),
    'member.access.updated',
    'organization_member',
    target_user_id::text,
    jsonb_build_object('role_id', target_role_id, 'status', target_status)
  );
end;
$$;

create or replace function public.create_organization_invitation(
  target_organization_id uuid,
  target_email text,
  target_role_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invitation_id uuid;
begin
  if not public.has_permission(target_organization_id, 'users.manage') then
    raise exception 'Kullanıcı davet etme yetkiniz yok.';
  end if;

  if not exists (
    select 1 from public.roles
    where id = target_role_id and organization_id = target_organization_id
  ) then
    raise exception 'Seçilen rol bu organizasyona ait değil.';
  end if;

  insert into public.organization_invitations (organization_id, email, role_id, invited_by)
  values (target_organization_id, lower(trim(target_email)), target_role_id, auth.uid())
  returning id into invitation_id;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_organization_id,
    auth.uid(),
    'member.invitation.created',
    'organization_invitation',
    invitation_id::text,
    jsonb_build_object('email', lower(trim(target_email)), 'role_id', target_role_id)
  );

  return invitation_id;
end;
$$;

grant execute on function public.update_member_access(uuid, uuid, uuid, public.membership_status) to authenticated;
grant execute on function public.create_organization_invitation(uuid, text, uuid) to authenticated;
