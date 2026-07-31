create extension if not exists pgcrypto;

create type public.membership_status as enum ('invited', 'active', 'suspended');
create type public.organization_plan as enum ('trial', 'starter', 'professional', 'enterprise');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan public.organization_plan not null default 'trial',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  module text not null,
  description text
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid references public.roles(id) on delete set null,
  status public.membership_status not null default 'invited',
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  code text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index roles_organization_idx on public.roles(organization_id);
create index branches_organization_idx on public.branches(organization_id);
create index departments_organization_idx on public.departments(organization_id);
create index activity_logs_organization_created_idx on public.activity_logs(organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
  );
$$;

create or replace function public.has_permission(target_organization_id uuid, permission_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members om
    join public.role_permissions rp on rp.role_id = om.role_id
    join public.permissions p on p.id = rp.permission_id
    where om.organization_id = target_organization_id
      and om.user_id = auth.uid()
      and om.status = 'active'
      and p.code = permission_code
  );
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_members enable row level security;
alter table public.branches enable row level security;
alter table public.departments enable row level security;
alter table public.activity_logs enable row level security;

create policy organizations_select_member
on public.organizations for select
using (public.is_organization_member(id) or created_by = auth.uid());

create policy organizations_insert_owner
on public.organizations for insert
to authenticated
with check (created_by = auth.uid());

create policy organizations_update_admin
on public.organizations for update
using (public.has_permission(id, 'organization.manage'))
with check (public.has_permission(id, 'organization.manage'));

create policy profiles_select_self_or_colleague
on public.profiles for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and theirs.user_id = profiles.id
      and theirs.status = 'active'
  )
);

create policy profiles_update_self
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

create policy tenant_roles_select
on public.roles for select
using (public.is_organization_member(organization_id));

create policy tenant_roles_manage
on public.roles for all
using (public.has_permission(organization_id, 'roles.manage'))
with check (public.has_permission(organization_id, 'roles.manage'));

create policy permissions_read_authenticated
on public.permissions for select
to authenticated
using (true);

create policy role_permissions_read_member
on public.role_permissions for select
using (
  exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and public.is_organization_member(r.organization_id)
  )
);

create policy role_permissions_manage
on public.role_permissions for all
using (
  exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and public.has_permission(r.organization_id, 'roles.manage')
  )
)
with check (
  exists (
    select 1 from public.roles r
    where r.id = role_permissions.role_id
      and public.has_permission(r.organization_id, 'roles.manage')
  )
);

create policy organization_members_select
on public.organization_members for select
using (user_id = auth.uid() or public.is_organization_member(organization_id));

create policy organization_members_manage
on public.organization_members for all
using (public.has_permission(organization_id, 'users.manage'))
with check (public.has_permission(organization_id, 'users.manage'));

create policy branches_tenant_access
on public.branches for all
using (public.is_organization_member(organization_id))
with check (public.has_permission(organization_id, 'organization.manage'));

create policy departments_tenant_access
on public.departments for all
using (public.is_organization_member(organization_id))
with check (public.has_permission(organization_id, 'organization.manage'));

create policy activity_logs_select
on public.activity_logs for select
using (public.has_permission(organization_id, 'audit.read'));

create policy activity_logs_insert
on public.activity_logs for insert
to authenticated
with check (public.is_organization_member(organization_id) and actor_user_id = auth.uid());

insert into public.permissions (code, name, module, description) values
  ('organization.manage', 'Organizasyonu yönet', 'core', 'Kurum, şube ve departman ayarlarını yönetir.'),
  ('users.read', 'Kullanıcıları görüntüle', 'core', 'Kurum kullanıcı listesini görüntüler.'),
  ('users.manage', 'Kullanıcıları yönet', 'core', 'Kullanıcı davet eder, rol ve durum değiştirir.'),
  ('roles.manage', 'Rol ve yetkileri yönet', 'core', 'Rol ve izin atamalarını yönetir.'),
  ('audit.read', 'Aktivite kayıtlarını görüntüle', 'core', 'Kurum işlem geçmişini görüntüler.'),
  ('crm.read', 'CRM görüntüle', 'crm', 'CRM kayıtlarını görüntüler.'),
  ('crm.manage', 'CRM yönet', 'crm', 'CRM kayıtlarını oluşturur ve günceller.'),
  ('finance.read', 'Finans görüntüle', 'finance', 'Finans kayıtlarını görüntüler.'),
  ('finance.manage', 'Finans yönet', 'finance', 'Finans kayıtlarını oluşturur ve günceller.')
on conflict (code) do nothing;

create or replace function public.bootstrap_organization(organization_name text, organization_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_organization_id uuid;
  owner_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (organization_name, organization_slug, auth.uid())
  returning id into new_organization_id;

  insert into public.roles (organization_id, name, code, description, is_system)
  values (new_organization_id, 'Kurum Sahibi', 'owner', 'Tüm modüller ve ayarlar üzerinde tam yetki.', true)
  returning id into owner_role_id;

  insert into public.role_permissions (role_id, permission_id)
  select owner_role_id, id from public.permissions;

  insert into public.organization_members (organization_id, user_id, role_id, status, joined_at)
  values (new_organization_id, auth.uid(), owner_role_id, 'active', now());

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id)
  values (new_organization_id, auth.uid(), 'organization.created', 'organization', new_organization_id::text);

  return new_organization_id;
end;
$$;

grant execute on function public.bootstrap_organization(text, text) to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
