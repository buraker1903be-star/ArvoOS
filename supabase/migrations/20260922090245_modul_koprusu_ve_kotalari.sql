-- ============================================================
-- Modül köprüsü (Standalone / Integrated) ve modül kotaları
--
-- Kiracılar ürünleri iki modda kullanıyor:
--   Integrated — ArvoOS ile birlikte. CRM sözleşmesi onaylandığında
--                ArvoLAB'da iş emri açılır, sonuç müşteri kartına döner.
--   Standalone — ürün tek başına. Kiracı ArvoOS CRM'i kullanmıyor ya da
--                kullanıyor ama iki sistemin birbirine karışmasını
--                istemiyor.
--
-- Bu ayrım bugün HİÇBİR YERDE saklanmıyordu: köprünün kapsamı lisanstan
-- türetiliyor (arcOrganizationIds, randevuOrganizationIds), yani "lisansı
-- var" ile "entegre çalışıyor" aynı şey sayılıyordu. Bağımsız çalışmak
-- isteyen kiracıya verilecek bir cevap yoktu.
--
-- DONDURMA İLE KARIŞTIRILMAMALI. status erişimi keser (kiracı ürüne
-- giremez). integrated erişimi kesmez, yalnızca otomatik veri akışını
-- durdurur. Biri tahsilat aracı, diğeri ürün tercihi.
--
-- Varsayılan true: bugünkü davranış aynen korunuyor, hiçbir kiracının
-- senkronu bu migration'la kesilmiyor.
-- ============================================================

alter table public.organization_product_licenses
  add column if not exists integrated boolean not null default true,
  /*
    Modül kotaları jsonb: her ürün başka bir şey ölçüyor (ArvoLAB aylık
    test sayısı, ARC arşiv alanı, Randevu personel ve randevu sayısı).
    Her ürüne ayrı sütun açmak tabloyu dördün katı genişletir ve beşinci
    ürün geldiğinde yine migration gerektirirdi.

    UYARI: buraya yazılan her limitin BİR ÖLÇÜMÜ olmalı. ArvoOS'ta
    storage_limit_mb yıllarca girildi, kullanım hiç hesaplanmadı ve
    ekrandaki sayının karşılığı yoktu; kurucu onu bir koruma sandı.
    Ölçümü yazılmamış limit arayüzde gösterilmemeli.
  */
  add column if not exists limits jsonb not null default '{}'::jsonb;

comment on column public.organization_product_licenses.integrated is
  'true: ArvoOS ile otomatik veri akışı açık (Integrated). false: ürün tek başına çalışır (Standalone). Erişimi kesmez; onu status yapar.';
comment on column public.organization_product_licenses.limits is
  'Ürüne özgü kotalar. Yalnızca ölçümü yazılmış alanlar arayüzde gösterilir.';

-- Köprü planlayıcıları bu sütunu okuyacak; kapsam sorgusu ona göre daralır.
create index if not exists organization_product_licenses_koprulu_idx
  on public.organization_product_licenses (product, organization_id)
  where integrated;

notify pgrst, 'reload schema';
