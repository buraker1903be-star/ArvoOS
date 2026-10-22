/*
  PANEL BAĞLAMINA LİSANS DURUMU (22.10.2026, hız çalışması).

  arvo_panel_baglami (20261013121621) çalışma alanlarını, modülleri ve
  yetki kurallarını tek turda getiriyordu ama erişim kapısının baktığı
  lisans satırını (organization_licenses) getirmiyordu: lib/panel-context
  onu ayrı bir sorguyla, bağlam çağrısı BİTTİKTEN SONRA okuyordu. Bağlam
  her sayfanın, her sunucu işleminin ve her çevrimiçi sinyalinin kritik
  yolunda; canlıda her Supabase turu ~170 ms (yavaş sorgu günlüğü,
  22.10.2026). Bu, panelde her tıklamaya eklenen boşa bir turdu.

  'lisans' alanı eklendi. İşlev security INVOKER kalıyor: satır RLS'le,
  çağıranın yetkisiyle okunuyor — eski ayrı sorguyla aynı sonuç (okuma
  yetkisi yoksa null). Gövde anlık görüntüden (canli-sema.sql) alındı.
*/
create or replace function public.arvo_panel_baglami(p_org uuid)
returns jsonb
language sql
stable
set search_path to ''
as $function$
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
    ), '[]'::jsonb),
    'lisans', (
      select jsonb_build_object('license_status', l.license_status, 'suspension_reason', l.suspension_reason)
      from public.organization_licenses l where l.organization_id = p_org limit 1
    )
  )
$function$;

revoke all on function public.arvo_panel_baglami(uuid) from public, anon;
grant execute on function public.arvo_panel_baglami(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
