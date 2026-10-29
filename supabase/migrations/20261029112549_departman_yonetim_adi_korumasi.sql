-- Departmanın ADI yönetim yetkisi taşıyor (29.10.2026)
-- ------------------------------------------------------------
-- Adı "Yönetim/Yönetici" ile başlayan departmandaki aktif personel
-- Kurum Sahibi sayılıyor (private.arvo_is_management_name,
-- private.arvo_sync_management_owner). Personeli böyle bir departmana
-- almak yalnızca Kurum Sahibi'nin işi: arvo_employee_management_guard.
--
-- Ama o koruma PERSONELİN departmanı değişince çalışıyor. Departmanın
-- ADINI değiştirmek ona hiç uğramıyor: RLS yöneticiye (admin) departman
-- güncellemeyi açık bırakıyor, yani bir yönetici "Satış"ı "Yönetim"
-- yapıp içindeki herkesi — kendisi dahil — bir sonraki personel
-- güncellemesinde Kurum Sahibi yapabiliyordu. Panelin işlemi bunu
-- 29.10.2026'dan beri reddediyor (lib/departman-kurali.ts); bu migration
-- aynı kuralı veritabanına koyuyor, çünkü oturum jetonu tarayıcıda ve
-- tablo API'den doğrudan yazılabiliyor (AGENTS.md: "RLS kim yazabilir'i
-- söyler, neyi'yi söylemez").
--
-- Kural: yönetim adına GİREN ya da ÇIKAN yeniden adlandırma ve yönetim
-- departmanının silinmesi yalnızca Kurum Sahibi'nin. İstek rolü olmayan
-- (doğrudan veritabanı) ve service_role çağrıları serbest: sunucu
-- tarafı kendi yetkisini doğruluyor (createAdminClient kullanan yollar).
-- Yönetim durumunu değiştirmeyen ad değişikliği ("Satış" → "Satış ve
-- Pazarlama") herkese açık kalıyor.
--
-- İkinci tetikleyici: Kurum Sahibi bir departmanı yönetim adına çevirir
-- ya da çıkarırsa içindeki üyelerin rolü HEMEN eşitlenir. Eskiden
-- eşitleme yalnızca personel satırı değişince çalışıyordu ve rol, ad
-- değiştikten sonraki ilk personel güncellemesine kadar eski hâlinde
-- kalıyordu.

create or replace function private.arvo_department_management_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.organization_id, old.organization_id);
  v_yetkili boolean := private.arvo_request_role() = 'service_role'
    or private.arvo_caller_is_owner(v_org);
begin
  if tg_op = 'UPDATE' then
    if private.arvo_is_management_name(old.name) is distinct from private.arvo_is_management_name(new.name)
       and not v_yetkili then
      raise exception 'Bir departmanı yönetim departmanına çevirmek ya da yönetim departmanının adını değiştirmek yalnızca Kurum Sahibi tarafından yapılabilir.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- DELETE
  if private.arvo_is_management_name(old.name) and not v_yetkili then
    raise exception 'Yönetim departmanını yalnızca Kurum Sahibi silebilir.'
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end
$$;

revoke all on function private.arvo_department_management_guard() from public, anon, authenticated;

drop trigger if exists arvo_department_management_guard on public.hr_departments;
create trigger arvo_department_management_guard
  before update of name or delete on public.hr_departments
  for each row execute function private.arvo_department_management_guard();

create or replace function private.arvo_department_management_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kullanici uuid;
begin
  if private.arvo_is_management_name(old.name) is not distinct from private.arvo_is_management_name(new.name) then
    return null;
  end if;
  for v_kullanici in
    select distinct e.user_id
      from public.hr_employees e
     where e.organization_id = new.organization_id
       and e.department_id = new.id
       and e.user_id is not null
  loop
    perform private.arvo_sync_management_owner(new.organization_id, v_kullanici);
  end loop;
  return null;
end
$$;

revoke all on function private.arvo_department_management_sync() from public, anon, authenticated;

drop trigger if exists arvo_department_management_sync on public.hr_departments;
create trigger arvo_department_management_sync
  after update of name on public.hr_departments
  for each row execute function private.arvo_department_management_sync();
