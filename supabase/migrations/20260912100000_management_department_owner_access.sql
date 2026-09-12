-- Yönetici departmanındaki çalışanlar Kurum Sahibi (owner) yetkisi alır.
--
-- Kural: adı "Yönetici" ile başlayan bir İK departmanındaki (Yönetici,
-- Yöneticiler, YÖNETİCİ DEPARTMANI…) aktif veya izinli çalışanın bağlı
-- kullanıcı hesabı owner olur; önceki rolü saklanır. Departmandan
-- çıkarılınca, pasife alınınca/işten ayrılınca veya departman adı
-- değişince önceki rolüne döner. Departmandan gelmeyen asıl owner'lar
-- hiçbir zaman düşürülmez.
--
-- Güvenlik: departman üyeliği artık owner yetkisi verdiği için bir
-- çalışanı Yönetici departmanına sokmak/çıkarmak ve bir departmanı
-- Yönetici yapmak/Yönetici olmaktan çıkarmak yalnızca owner'a açık.
-- Aksi halde İK erişimi olan herkes kendini owner yapabilirdi.
-- Servis rolü ve SQL Editor (auth.uid() boş) bu kontrolden muaf.

alter table public.organization_memberships
  add column if not exists role_before_management text,
  add column if not exists role_from_management boolean not null default false;

-- ---------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------
create or replace function private.arvo_is_management_name(p_name text)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select coalesce(lower(translate(btrim(p_name), 'İIÖ', 'iıö')) ~ '^y[oö]net[iı]c[iı]', false);
$function$;

create or replace function private.arvo_is_management_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.hr_departments d
    where d.id = p_department_id
      and private.arvo_is_management_name(d.name)
  );
$function$;

create or replace function private.arvo_caller_is_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select auth.uid() is null
    or exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role::text = 'owner'
    );
$function$;

-- ---------------------------------------------------------------
-- Tek bir (kurum, kullanıcı) için rolü departmana göre eşitler.
-- ---------------------------------------------------------------
create or replace function private.arvo_sync_management_owner(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_grant boolean;
begin
  if p_organization_id is null or p_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.hr_employees e
    where e.organization_id = p_organization_id
      and e.user_id = p_user_id
      and e.employment_status in ('active', 'on_leave')
      and private.arvo_is_management_department(e.department_id)
  ) into v_grant;

  -- Aşağıdaki güncellemeler elle yapılan rol değişikliği sayılmasın.
  perform set_config('arvo.management_sync', 'on', true);

  if v_grant then
    update public.organization_memberships m
    set role_before_management = m.role::text,
        role_from_management = true,
        role = 'owner'
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role::text <> 'owner';
  else
    update public.organization_memberships m
    set role = coalesce(m.role_before_management, 'member')::public.membership_role,
        role_before_management = null,
        role_from_management = false
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role_from_management;
  end if;

  perform set_config('arvo.management_sync', 'off', true);
end
$function$;

revoke all on function private.arvo_sync_management_owner(uuid, uuid) from public;
revoke all on function private.arvo_caller_is_owner(uuid) from public;
revoke all on function private.arvo_is_management_department(uuid) from public;

-- ---------------------------------------------------------------
-- Üyelik: yeni üyelik departmana göre eşitlenir; elle rol değişikliği
-- departman kaynaklı yetkiyi sonlandırır (yoksa departmandan çıkınca
-- eski rol yanlışlıkla geri yüklenirdi).
-- ---------------------------------------------------------------
create or replace function private.arvo_membership_manual_role_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.role is distinct from old.role
     and coalesce(current_setting('arvo.management_sync', true), 'off') <> 'on' then
    new.role_from_management := false;
    new.role_before_management := null;
  end if;
  return new;
end
$function$;

drop trigger if exists arvo_membership_manual_role_change on public.organization_memberships;
create trigger arvo_membership_manual_role_change
  before update of role on public.organization_memberships
  for each row execute function private.arvo_membership_manual_role_change();

create or replace function private.arvo_membership_management_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform private.arvo_sync_management_owner(new.organization_id, new.user_id);
  return null;
end
$function$;

drop trigger if exists arvo_membership_management_sync on public.organization_memberships;
create trigger arvo_membership_management_sync
  after insert on public.organization_memberships
  for each row execute function private.arvo_membership_management_sync();

-- ---------------------------------------------------------------
-- Çalışan: Yönetici departmanına giriş/çıkış yalnızca owner'a açık;
-- değişiklikten sonra rol eşitlenir.
-- ---------------------------------------------------------------
create or replace function private.arvo_employee_management_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_new boolean := false;
  v_old boolean := false;
begin
  -- INSERT'te OLD boş olduğu için yalnızca UPDATE'te okunur.
  v_new := private.arvo_is_management_department(new.department_id);
  if tg_op = 'UPDATE' then
    v_old := private.arvo_is_management_department(old.department_id);
  end if;

  if v_new is distinct from v_old
     and not private.arvo_caller_is_owner(new.organization_id) then
    raise exception 'Yönetici departmanına çalışan ekleme veya çıkarma yalnızca Kurum Sahibi tarafından yapılabilir.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$function$;

drop trigger if exists arvo_employee_management_guard on public.hr_employees;
create trigger arvo_employee_management_guard
  before insert or update of department_id on public.hr_employees
  for each row execute function private.arvo_employee_management_guard();

create or replace function private.arvo_employee_management_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.arvo_sync_management_owner(old.organization_id, old.user_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform private.arvo_sync_management_owner(new.organization_id, new.user_id);
  end if;
  return null;
end
$function$;

drop trigger if exists arvo_employee_management_sync on public.hr_employees;
create trigger arvo_employee_management_sync
  after insert or delete or update of department_id, user_id, employment_status, organization_id
  on public.hr_employees
  for each row execute function private.arvo_employee_management_sync();

-- ---------------------------------------------------------------
-- Departman: Yönetici yapma/olmaktan çıkarma ve silme yalnızca owner'a
-- açık; ad değişince departmandaki herkes eşitlenir.
-- ---------------------------------------------------------------
create or replace function private.arvo_department_management_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_new boolean := false;
  v_old boolean := false;
begin
  -- INSERT'te OLD, DELETE'te NEW boş; yalnızca dolu olanı okuyoruz.
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_old := private.arvo_is_management_name(old.name);
  else
    v_org := new.organization_id;
    v_new := private.arvo_is_management_name(new.name);
    if tg_op = 'UPDATE' then
      v_old := private.arvo_is_management_name(old.name);
    end if;
  end if;

  if v_new is distinct from v_old and not private.arvo_caller_is_owner(v_org) then
    raise exception 'Yönetici departmanını oluşturma, yeniden adlandırma veya silme yalnızca Kurum Sahibi tarafından yapılabilir.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$function$;

drop trigger if exists arvo_department_management_guard on public.hr_departments;
create trigger arvo_department_management_guard
  before insert or update of name or delete on public.hr_departments
  for each row execute function private.arvo_department_management_guard();

create or replace function private.arvo_department_management_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  r record;
begin
  for r in
    select distinct e.organization_id, e.user_id
    from public.hr_employees e
    where e.department_id = new.id
      and e.user_id is not null
  loop
    perform private.arvo_sync_management_owner(r.organization_id, r.user_id);
  end loop;
  return null;
end
$function$;

drop trigger if exists arvo_department_management_sync on public.hr_departments;
create trigger arvo_department_management_sync
  after update of name on public.hr_departments
  for each row execute function private.arvo_department_management_sync();

-- ---------------------------------------------------------------
-- Mevcut verilere uygula
-- ---------------------------------------------------------------
select private.arvo_sync_management_owner(e.organization_id, e.user_id)
from (
  select distinct organization_id, user_id
  from public.hr_employees
  where user_id is not null
) e;

-- Sonuç raporu: Yönetici departmanındaki çalışanlar ve yeni rolleri.
-- "panel hesabı yok" olanlar, panele davet edilip hesabı bağlanınca
-- otomatik olarak Kurum Sahibi olur.
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
