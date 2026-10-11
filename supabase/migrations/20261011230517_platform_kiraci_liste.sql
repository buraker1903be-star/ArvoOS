/*
  KURUCU KONSOLUNUN KİRACI LİSTESİ.

  Konsol üç şeyi bütün kiracılar için, zaman sınırı olmadan okuyordu:

  - `organization_invitations`: her kiracının her daveti, en başından
    beri. Yalnızca kiracı başına EN SON davet gösteriliyor, gerisi
    bellekte eleniyordu. Personel giriş çıkışı olan yüz kiracıda bu
    tablo en hızlı büyüyen taraf; satır tavanına çarpıldığı gün
    kurulum durumu rozetleri sessizce yanlışlanır.
  - `organization_memberships`: her kiracının her üyesi, yalnızca
    "kaç aktif üye" sayısı için. Kota rozeti ve lisans kararı bu
    sayıdan çıkıyor; eksilmesi "limit aşılmadı" demek olur.
  - `organization_licenses`: kiracı başına tek satır, sorun değil ama
    aynı görünümde birleşiyor.

  Kiracı SAYISI bilerek sınırlanmıyor: o, Arvo'nun müşteri sayısı
  kadar (onlarca), listeleme ve Türkçe duyarsız arama ekranda kalıyor.
  Kural "her liste sayfalanır" değil, "kayıt sayısı işle birlikte
  büyüyen okuma sınırlanır" (AGENTS.md "Genel bakış sayfaları").

  GÜVENLİK: security_invoker. Satırları kurucu politikası açıyor
  (founder_can_read_all_organizations); kiracının kendi yöneticisi
  yalnızca kendi kurumunun satırını görür — kendi lisansı, kendi üye
  sayısı, kendi daveti, yani yeni bir şey açılmıyor.
*/

create or replace view public.platform_kiraci_liste
with (security_invoker = true, security_barrier = true) as
  select
    o.id,
    o.name,
    o.display_name,
    o.slug,
    o.status,
    o.plan_code,
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
    coalesce(u.aktif_uye, 0) as aktif_uye,
    d.davet_eposta,
    d.davet_durumu,
    d.davet_gonderildi,
    d.davet_kabul,
    d.davet_hatasi
  from public.organizations o
  left join public.organization_licenses l on l.organization_id = o.id
  left join lateral (
    select count(*) filter (where m.is_active) as aktif_uye
    from public.organization_memberships m
    where m.organization_id = o.id
  ) u on true
  /*
    Kiracı başına EN SON davet: kurulum durumu rozetinin kaynağı.
    Dizin uyumu: üyelik sayımı birincil anahtarın baş sütununu
    (organization_id) bağlıyor; davet yan sorgusu da
    organization_invitations'ın (organization_id, email) tekil
    dizinini kullanıyor — kiracı başına davet sayısı az olduğu için
    sıralama o küçük kümede yapılıyor, tablo taranmıyor.
  */
  left join lateral (
    select i.email as davet_eposta, i.status as davet_durumu,
           i.sent_at as davet_gonderildi, i.accepted_at as davet_kabul,
           i.error_message as davet_hatasi
    from public.organization_invitations i
    where i.organization_id = o.id
    order by i.created_at desc
    limit 1
  ) d on true;

revoke all on public.platform_kiraci_liste from public, anon;
grant select on public.platform_kiraci_liste to authenticated, service_role;

notify pgrst, 'reload schema';
