-- ============================================================
-- KİŞİ MODÜL İSTİSNASI VERİTABANINDA DA GEÇERLİ
--
-- arvo_crm_lookup_role, müşteri sorgulama RPC'lerinin kapısı: çağıranın
-- rolünü döndürüyor, null dönerse sorgu hiç çalışmıyor. Modül yetkisini
-- veritabanında okuyan tek fonksiyon da bu — ama yalnızca ROL satırına
-- bakıyordu (role_module_permissions).
--
-- 02.10.2026'da kişi bazlı istisna geldi (member_module_permissions).
-- Fonksiyon onu bilmediği için şu durum tutarsız kalıyordu: kurum CRM'i
-- "Satış Personeli" rolünde kapatıp tek bir kişiye açtığında panel o
-- kişiye CRM'i gösteriyor, müşteri sorgulama ise sessizce boş dönüyordu.
-- Ters yön daha kötüsü: kişiye özel KAPATILAN CRM, bu fonksiyon
-- üzerinden hâlâ açıktı — yani kısıtlama yarım uygulanıyordu.
--
-- Karar sırası panelle birebir aynı (lib/yetkiler.ts · gizliModulleriHesapla):
-- kişi satırı varsa o, yoksa rol satırı, o da yoksa açık.
-- ============================================================

create or replace function private.arvo_crm_lookup_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $fn$
  select m.role::text
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.is_active = true
    and exists (
      select 1 from public.organization_modules om
      where om.organization_id = p_organization_id
        and om.module_code = 'crm'
        and om.is_enabled = true
    )
    and (
      m.role::text = 'owner'
      or coalesce(
        -- 1) Kişiye özel istisna varsa son söz onda.
        (
          select mm.can_access
          from public.member_module_permissions mm
          where mm.organization_id = p_organization_id
            and mm.user_id = m.user_id
            and mm.module_key = 'crm'
        ),
        -- 2) Yoksa rolün kuralı.
        (
          select rp.can_access
          from public.role_module_permissions rp
          where rp.organization_id = p_organization_id
            and rp.role = m.role::text
            and rp.module_key = 'crm'
        ),
        -- 3) Hiç satır yoksa varsayılan açık.
        true
      )
    )
  limit 1
$fn$;

/*
  YETKİ CANLIDAKİ GİBİ KALIYOR: KİMSEYE GRANT YOK.

  Bu fonksiyonu istemci hiç çağırmıyor; onu çağıranlar public.crm_customer_search
  ve public.crm_customer_history, ikisi de security definer olduğu için
  sahibin yetkisiyle çalışıyor. `create or replace` yetkileri korur ama
  yeniden yazarken "her security definer fonksiyonun yetkisini açıkça yaz"
  kuralına uymak için burada da yazılı: public, anon ve authenticated
  çağıramaz. Rol döndüren bir yardımcıyı istemciye açmanın hiçbir faydası
  yok, karşılığında kimin hangi rolde olduğunu sorgulatır.
*/
revoke all on function private.arvo_crm_lookup_role(p_organization_id uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
