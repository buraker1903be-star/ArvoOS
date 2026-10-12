/*
  KURUMUN SEKME SİMGESİ (12.10.2026)

  Kendi alan adındaki kurumun tarayıcı sekmesinde logosu görünüyordu
  (11.10.2026). Logo çoğunlukla YATAY (simge + yazı) ve tarayıcı onu
  16×16'lık kareye sıkıştırıyor: sekmede okunmayan ince bir şerit
  kalıyordu. Kurum artık Ayarlar → Kurumsal kimlik'te kare bir sekme
  simgesi yükleyebiliyor; yüklemezse panel kurumun baş harfinden kendi
  rengiyle bir simge çiziyor (lib/kurum-simgesi), logoyu kullanmıyor.

  Simge giriş ekranında da (oturum yokken) görünmeli; kurum markasını
  anon'a veren get_public_organization_branding_by_id'ye sütun eklendi.
  Dönüş tipi değiştiği için işlev düşürülüp yeniden kuruluyor; yetkileri
  canlıdakiyle aynı (canli-sema.sql).
*/

alter table public.organizations add column if not exists favicon_url text;

drop function if exists public.get_public_organization_branding_by_id(uuid);

create function public.get_public_organization_branding_by_id(p_org_id uuid)
 returns table(id uuid, slug text, name text, logo_url text, primary_color text, favicon_url text)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select id, slug, coalesce(display_name, name) as name, logo_url, primary_color, favicon_url
  from public.organizations
  where id = p_org_id
  limit 1;
$function$;

revoke all on function public.get_public_organization_branding_by_id(p_org_id uuid) from public;
grant execute on function public.get_public_organization_branding_by_id(p_org_id uuid) to service_role;
grant execute on function public.get_public_organization_branding_by_id(p_org_id uuid) to authenticated;
grant execute on function public.get_public_organization_branding_by_id(p_org_id uuid) to anon;
