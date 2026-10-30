/*
  PROFORMAYA ArvoARC (30.10.2026).

  caf618a ("ArvoARC'a proforma kesilemiyordu") kodda proforma ürün
  listesini kataloğa bağladı ve ArvoARC'ı ekledi; commit mesajı
  "product sütununda kısıt yok, migration gerekmiyor" diyordu. Kısıt
  VAR: 20261028155350 `platform_proformalari_product_check` ile ürünü
  üç değere (arvoos, arvolab, randevu) sabitliyor. Sonuç: form ArvoARC'ı
  sunuyor, kayıt veritabanında "violates check constraint" ile düşüyor;
  otomatik iş de her sabah ArvoARC lisansı için aynı hatayı yazıyor.

  Kısıt bilerek KALDIRILMIYOR, genişletiliyor: ürün kodu belgenin hangi
  panelde görüneceğini ve hangi ödemeyle eşleşeceğini belirliyor;
  yazım hatalı bir kod hiçbir panelde görünmeyen bir proforma olurdu.
  Kodla veritabanının ayrışmaması için tests/unit/proforma-urunleri.test.ts
  bu kısıttaki listeyi PROFORMA_URUNLERI ile karşılaştırıyor: yeni bir
  ürün eklenip migration yazılmazsa test düşüyor.
*/
alter table public.platform_proformalari
  drop constraint if exists platform_proformalari_product_check;
alter table public.platform_proformalari
  add constraint platform_proformalari_product_check check (product = any (array['arvoos', 'arvolab', 'randevu', 'arc']));
