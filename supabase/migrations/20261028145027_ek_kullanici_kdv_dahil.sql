/*
  EK KULLANICI VARSAYILANI KDV DAHİL (28.10.2026).

  Liste fiyatları KDV dahile geçti (lib/site/pricing.ts): ek kullanıcı
  249 TL'den (KDV hariç) 299 TL'ye (KDV dahil). Sütunun varsayılanı
  yalnızca YENİ açılan lisansı etkiler; mevcut lisanslardaki tutar
  kurumla yapılmış anlaşmadır ve sessizce değiştirilmez — konsoldaki
  "liste fiyatını uygula" onu bilerek günceller.
*/
alter table public.organization_licenses alter column extra_user_fee set default 29900;
