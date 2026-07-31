insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.code = 'owner'
  and r.is_system = true
  and p.code in ('work.read', 'work.manage')
on conflict do nothing;

insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, metadata)
select o.id, o.created_by, 'work.module.activated', 'organization', jsonb_build_object('module', 'work', 'scope', 'internal')
from public.organizations o
where lower(o.name) like '%arvos%'
   or lower(o.slug) like '%arvos%';
