/*
  PANEL BAĞLAMI TEK ÇAĞRIDA (13.10.2026, hızlandırma).

  Her panel isteğinin (sayfa, yerleşim, sunucu işlemi) kritik yolunda
  lib/panel-context.ts iki SIRALI adımda altı istek atıyordu: önce
  get_my_workspaces (hangi kurumdayım, rolüm ne), bitince kurumun
  modülleri ve dört yetki kuralı tablosu. Bağlantı havuzu dar olduğu
  için bu istekler de kuyruğa giriyor, her tıklamaya iki gidiş-dönüş
  ekliyordu.

  Seçilecek kurum çoğu istekte ÖNCEDEN biliniyor (çalışma alanı çerezi).
  arvo_panel_baglami(p_org): çalışma alanlarını ve p_org'un modüllerini
  ve yetki kurallarını TEK gidiş-dönüşte döndürür. Kuralların hepsi
  (bütün rollerin satırları) dönüyor: kişinin rolü çalışma alanından
  belli olunca uygulamada süzülüyor — tablolar kurum başına birkaç satır.

  SECURITY INVOKER: her parça çağıranın RLS'iyle, bugün ayrı ayrı
  okunduğu gibi. Kişi p_org'un üyesi değilse kural parçaları boş döner
  ve uygulama seçtiği kurum için eski yoldan okur. İşlev yoksa (migration
  uygulanmadı) uygulama eski yolu kullanır.
*/

create or replace function public.arvo_panel_baglami(p_org uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'calisma_alanlari', coalesce((select jsonb_agg(to_jsonb(w)) from public.get_my_workspaces() w), '[]'::jsonb),
    'org', p_org,
    'moduller', coalesce((
      select jsonb_agg(jsonb_build_object(
        'module_code', om.module_code,
        'arvo_modules', jsonb_build_object('name', am.name, 'description', am.description, 'sort_order', am.sort_order)
      ))
      from public.organization_modules om
      left join public.arvo_modules am on am.code = om.module_code
      where om.organization_id = p_org and om.is_enabled
    ), '[]'::jsonb),
    'rol_modul', coalesce((
      select jsonb_agg(jsonb_build_object('role', r.role, 'module_key', r.module_key, 'can_access', r.can_access))
      from public.role_module_permissions r where r.organization_id = p_org
    ), '[]'::jsonb),
    'kisi_modul', coalesce((
      select jsonb_agg(jsonb_build_object('module_key', m.module_key, 'can_access', m.can_access))
      from public.member_module_permissions m where m.organization_id = p_org and m.user_id = (select auth.uid())
    ), '[]'::jsonb),
    'rol_yetki', coalesce((
      select jsonb_agg(jsonb_build_object('role', r.role, 'capability_key', r.capability_key, 'allowed', r.allowed))
      from public.role_capability_permissions r where r.organization_id = p_org
    ), '[]'::jsonb),
    'kisi_yetki', coalesce((
      select jsonb_agg(jsonb_build_object('capability_key', m.capability_key, 'allowed', m.allowed))
      from public.member_capability_permissions m where m.organization_id = p_org and m.user_id = (select auth.uid())
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.arvo_panel_baglami(uuid) from public, anon;
grant execute on function public.arvo_panel_baglami(uuid) to authenticated;
