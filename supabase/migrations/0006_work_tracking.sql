create type public.work_item_status as enum ('backlog', 'planned', 'in_progress', 'blocked', 'review', 'done', 'cancelled');
create type public.work_item_priority as enum ('low', 'normal', 'high', 'urgent');

create table public.work_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  owner_user_id uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.work_projects(id) on delete set null,
  parent_id uuid references public.work_items(id) on delete cascade,
  title text not null,
  description text,
  status public.work_item_status not null default 'backlog',
  priority public.work_item_priority not null default 'normal',
  assignee_user_id uuid references auth.users(id) on delete set null,
  reporter_user_id uuid not null references auth.users(id),
  progress smallint not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_projects_org_idx on public.work_projects(organization_id, is_active);
create index work_items_org_status_idx on public.work_items(organization_id, status);
create index work_items_assignee_idx on public.work_items(assignee_user_id, due_date);
create index work_items_project_idx on public.work_items(project_id, created_at desc);

create trigger work_projects_set_updated_at before update on public.work_projects for each row execute function public.set_updated_at();
create trigger work_items_set_updated_at before update on public.work_items for each row execute function public.set_updated_at();

insert into public.permissions (code, name, module, description) values
  ('work.read', 'İşleri görüntüle', 'work', 'Projeleri, görevleri ve ekip iş yükünü görüntüler.'),
  ('work.manage', 'İşleri yönet', 'work', 'Proje ve görev oluşturur, sorumlu ve durum değiştirir.')
on conflict (code) do nothing;

alter table public.work_projects enable row level security;
alter table public.work_items enable row level security;

create policy work_projects_read on public.work_projects for select
using (public.is_organization_member(organization_id) and public.has_permission(organization_id, 'work.read'));

create policy work_projects_manage on public.work_projects for all
using (public.has_permission(organization_id, 'work.manage'))
with check (public.has_permission(organization_id, 'work.manage'));

create policy work_items_read on public.work_items for select
using (public.is_organization_member(organization_id) and public.has_permission(organization_id, 'work.read'));

create policy work_items_manage on public.work_items for all
using (public.has_permission(organization_id, 'work.manage'))
with check (public.has_permission(organization_id, 'work.manage'));

create or replace function public.save_work_project(
  target_organization_id uuid,
  target_project_id uuid,
  target_name text,
  target_code text,
  target_description text,
  target_owner_user_id uuid,
  target_is_active boolean
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'work.manage') then raise exception 'Permission denied'; end if;
  if target_project_id is null then
    insert into public.work_projects (organization_id,name,code,description,owner_user_id,is_active,created_by)
    values (target_organization_id,trim(target_name),lower(trim(target_code)),nullif(trim(target_description),''),target_owner_user_id,target_is_active,auth.uid())
    returning id into saved_id;
  else
    update public.work_projects set name=trim(target_name),code=lower(trim(target_code)),description=nullif(trim(target_description),''),owner_user_id=target_owner_user_id,is_active=target_is_active
    where id=target_project_id and organization_id=target_organization_id returning id into saved_id;
    if saved_id is null then raise exception 'Project not found'; end if;
  end if;
  insert into public.activity_logs (organization_id,actor_user_id,action,entity_type,entity_id)
  values (target_organization_id,auth.uid(),case when target_project_id is null then 'work.project.created' else 'work.project.updated' end,'work_project',saved_id::text);
  return saved_id;
end; $$;

create or replace function public.save_work_item(
  target_organization_id uuid,
  target_item_id uuid,
  target_project_id uuid,
  target_title text,
  target_description text,
  target_status public.work_item_status,
  target_priority public.work_item_priority,
  target_assignee_user_id uuid,
  target_progress smallint,
  target_start_date date,
  target_due_date date
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare saved_id uuid; completed_value timestamptz;
begin
  if not public.has_permission(target_organization_id, 'work.manage') then raise exception 'Permission denied'; end if;
  if target_project_id is not null and not exists (select 1 from public.work_projects where id=target_project_id and organization_id=target_organization_id) then raise exception 'Project not found'; end if;
  if target_assignee_user_id is not null and not exists (select 1 from public.organization_members where organization_id=target_organization_id and user_id=target_assignee_user_id and status='active') then raise exception 'Assignee is not an active member'; end if;
  completed_value := case when target_status='done' then now() else null end;
  if target_item_id is null then
    insert into public.work_items (organization_id,project_id,title,description,status,priority,assignee_user_id,reporter_user_id,progress,start_date,due_date,completed_at)
    values (target_organization_id,target_project_id,trim(target_title),nullif(trim(target_description),''),target_status,target_priority,target_assignee_user_id,auth.uid(),target_progress,target_start_date,target_due_date,completed_value)
    returning id into saved_id;
  else
    update public.work_items set project_id=target_project_id,title=trim(target_title),description=nullif(trim(target_description),''),status=target_status,priority=target_priority,assignee_user_id=target_assignee_user_id,progress=target_progress,start_date=target_start_date,due_date=target_due_date,completed_at=completed_value
    where id=target_item_id and organization_id=target_organization_id returning id into saved_id;
    if saved_id is null then raise exception 'Work item not found'; end if;
  end if;
  insert into public.activity_logs (organization_id,actor_user_id,action,entity_type,entity_id,metadata)
  values (target_organization_id,auth.uid(),case when target_item_id is null then 'work.item.created' else 'work.item.updated' end,'work_item',saved_id::text,jsonb_build_object('status',target_status,'progress',target_progress));
  return saved_id;
end; $$;

grant execute on function public.save_work_project(uuid,uuid,text,text,text,uuid,boolean) to authenticated;
grant execute on function public.save_work_item(uuid,uuid,uuid,text,text,public.work_item_status,public.work_item_priority,uuid,smallint,date,date) to authenticated;
