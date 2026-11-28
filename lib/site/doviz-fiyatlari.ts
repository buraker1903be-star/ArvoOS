/*
  DÖVİZ VARSAYILANLARI (28.11.2026'da lib/site/doviz.ts'ten ayrıldı).

  Ayrı modül, çünkü iki taraf da okuyor: pazarlama sitesi (doviz.ts) ve
  satış tarafının çok para birimli fiyat tablosu (fiyat-kaynagi.ts).
  İkisi birbirini import ederse döngü oluşuyordu; sabit ortada duruyor.

  Rakamların gerekçesi doviz.ts'te yazılı: sabit liste, kur çevrimi
  değil. Tutarlar sent / euro-sent cinsinden tam sayı.
*/
const d = (tam: number) => tam * 100;

/** Basamak ve ek kalem kodu → aylık döviz tutarı (küçük birim). */
export const DOVIZ_FIYATLARI: Record<string, { USD: number | null; EUR: number | null }> = {
  "arvoos-baslangic": { USD: d(59), EUR: d(55) },
  "arvoos-kurumsal": { USD: d(179), EUR: d(165) },
  "arvoos-ozel": { USD: null, EUR: null },

  "randevu-tek": { USD: d(29), EUR: d(27) },
  "randevu-coklu": { USD: d(59), EUR: d(55) },
  "randevu-zincir": { USD: null, EUR: null },

  "arvolab-arastirmaci": { USD: d(119), EUR: d(109) },
  "arvolab-kurum": { USD: null, EUR: null },

  "ek-kullanici": { USD: d(9), EUR: d(8) },
  "ek-sube": { USD: d(12), EUR: d(11) },
  "veri-aktarimi": { USD: null, EUR: null },
  "ozel-gelistirme": { USD: null, EUR: null },
};
