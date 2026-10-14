/*
  ArvoOS PAKET LİMİTLERİ — panelin tek kopyası.

  Veritabanındaki private.default_license_limits (20261013191844) yeni
  kiracının lisansına bu değerleri yazıyor; lisans formu "varsayılanı
  uygula" kısayolunda, konsolun Ücret ve Paketler ekranı da gösterimde
  bunları kullanıyor. Eskiden bu tablo lisans formunun içindeydi ve SQL
  ile elle eşit tutuluyordu: 13.10.2026'da SQL 3/15'e inmiş, form 5/25'te
  kalmıştı. İki tarafın eşitliğini tests/db/paket-limitleri.test.mjs
  sabitliyor (veritabanı işlevini çağırıp buradaki değerle karşılaştırıyor).

  Saf modül; yalnızca silinebilir tür ek açıklamaları var (Node tür
  ayıklamasıyla doğrudan içe aktarılabiliyor).
*/
export type PaketLimiti = { userLimit: number; storageLimitMb: number; aiCreditLimit: number };

export const PAKET_VARSAYILANI: Record<string, PaketLimiti> = {
  starter: { userLimit: 3, storageLimitMb: 5120, aiCreditLimit: 500 },
  professional: { userLimit: 15, storageLimitMb: 51200, aiCreditLimit: 2500 },
  enterprise: { userLimit: 250, storageLimitMb: 512000, aiCreditLimit: 10000 },
};
