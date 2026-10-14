/*
  KİRACI LİSTESİ PAKETİ LİSANSTAN OKUYOR (14.10.2026).

  Paket iki ayrı sütunda duruyor: organizations.plan_code ve
  organization_licenses.plan_code. Görünüm birincisini veriyordu, lisans
  penceresi ikincisini okuyordu ve ikisi ayrışabiliyordu — kurum
  ayarları formu yalnızca organizations'ı yazıyordu (o seçim bugün
  kaldırıldı). Sonuç, aynı kiracının iki ekranda iki farklı pakette
  görünmesiydi: Deneme Salon şeritte "Başlangıç", lisansta "Özel kurum".

  GÖRÜNÜR ETİKETTEN DAHA KÖTÜSÜ, SAYIYA GİRMESİYDİ. Sistem Sağlığı'nın
  "Paketiyle uyuşmayan limitler" kartı, LİSANSIN limitlerini
  ORGANIZATIONS'taki paketin varsayılanlarıyla kıyaslıyor. İki kayıt
  ayrışınca kart olmayan bir sapma uyduruyor: Deneme Salon'un lisansı
  "Özel kurum" ve limitleri o paketin varsayılanının BİREBİR aynısıydı
  (250 kullanıcı · 512000 MB · 10000 kredi), ama kart onları "starter"ın
  3 kullanıcı · 5120 MB'ıyla kıyaslayıp "paketinin üstünde hak
  tanımlanmış" dedi. Kurucuya olmayan bir sorun bildirildi.

  Yetkili olan LİSANS: limit, ücret, dönem ve durum onunla aynı satırda
  duruyor; karşılaştırma da aynı kaydın kendi içinde yapılmalı.

  COALESCE: lisans satırı henüz yoksa (kurum yeni açılmış, tetikleyici
  lisansı yazmamış) organizations'taki kod okunuyor — eski davranış.
  Kurum oluştururken paketi oraya yazan yol duruyor; lisansı o koddan
  tetikleyici yaratıyor.

  Sütunun adı, yeri ve tipi değişmiyor: create or replace view güvenli.
*/

create or replace view public.platform_kiraci_liste with (security_invoker = true, security_barrier = true) as
 SELECT o.id,
    o.name,
    o.display_name,
    o.slug,
    o.status,
    COALESCE(l.plan_code, o.plan_code) AS plan_code,
    o.sector,
    o.kind,
    o.custom_domain,
    o.custom_domain_status,
    o.provisioning_state,
    o.logo_url,
    o.contact_phone,
    l.user_limit,
    l.storage_limit_mb,
    l.monthly_fee,
    l.current_period_end,
    l.license_status,
    l.trial_ends_at,
    COALESCE(u.aktif_uye, 0::bigint) AS aktif_uye,
    d.davet_eposta,
    d.davet_durumu,
    d.davet_gonderildi,
    d.davet_kabul,
    d.davet_hatasi,
    o.grup_markasi
   FROM organizations o
     LEFT JOIN organization_licenses l ON l.organization_id = o.id
     LEFT JOIN LATERAL ( SELECT count(*) FILTER (WHERE m.is_active) AS aktif_uye
           FROM organization_memberships m
          WHERE m.organization_id = o.id) u ON true
     LEFT JOIN LATERAL ( SELECT i.email AS davet_eposta,
            i.status AS davet_durumu,
            i.sent_at AS davet_gonderildi,
            i.accepted_at AS davet_kabul,
            i.error_message AS davet_hatasi
           FROM organization_invitations i
          WHERE i.organization_id = o.id
          ORDER BY i.created_at DESC
         LIMIT 1) d ON true;

/*
  Döküm GÖRÜNÜM yetkilerini taşımıyor ve create or replace onları
  korusa da, yenilenen bir dökümden kurulan veritabanında bu satırlar
  tek güvencedir (AGENTS.md).
*/
revoke all on public.platform_kiraci_liste from anon;
grant select on public.platform_kiraci_liste to authenticated, service_role;
