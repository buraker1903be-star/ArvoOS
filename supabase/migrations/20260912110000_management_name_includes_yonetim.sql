-- Kurumun yönetici departmanının adı "Yönetim Departmanı"; önceki kural
-- (20260912100000) yalnızca "Yönetici…" adlarını yakaladığı için kimse
-- yetki almadı. Kural artık "Yönetim…" adlarını da kapsıyor.
-- lib/management-department.ts ile aynı kural.

create or replace function private.arvo_is_management_name(p_name text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select coalesce(lower(translate(btrim(p_name), 'İIÖ', 'iıö')) ~ '^y[oö]net[iı](c[iı]|m)', false);
$function$;

-- Genişleyen kurala göre mevcut çalışanları yeniden eşitle.
select private.arvo_sync_management_owner(e.organization_id, e.user_id)
from (
  select distinct organization_id, user_id
  from public.hr_employees
  where user_id is not null
) e;

-- Sonuç raporu.
select
  d.name as departman,
  e.full_name as calisan,
  e.employment_status as durum,
  coalesce(m.role::text, 'panel hesabı yok') as rol,
  m.role_before_management as onceki_rol
from public.hr_employees e
join public.hr_departments d on d.id = e.department_id
left join public.organization_memberships m
  on m.organization_id = e.organization_id and m.user_id = e.user_id
where private.arvo_is_management_name(d.name)
order by d.name, e.full_name;
