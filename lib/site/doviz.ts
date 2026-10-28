/*
  DÖVİZ FİYATLARI (28.10.2026, global site).

  Türkçe sayfa TL, İngilizce sayfa USD, Almanca / İspanyolca / Fransızca
  sayfalar EUR gösterir. Karar ZİYARETÇİNİN ÜLKESİNE değil SAYFANIN
  DİLİNE bağlı: aynı adres herkese aynı fiyatı gösterir, arama motoru ve
  önbellek de öyle görür. Türkiye'deki müşteri TL fiyatı /tr'de bulur.

  SABİT LİSTE, KUR ÇEVRİMİ DEĞİL (kurum sahibinin kararı, 28.10.2026):
  döviz fiyatı kur oynadıkça değişmez, küsuratlı çıkmaz ($47,83 gibi).
  Rakamlar global SaaS bandına göre yuvarlak seçildi; TL listesinin
  çevirisi değiller.

  ArvoLab 28.10.2026'da $59/55 €'dan $119/109 €'ya çıktı: TL fiyatı
  4.990'a (KDV dahil, net ~2,1 kat) çıkarken dövizde eski rakamda
  kalsaydı aynı ürün yurt dışında yarı fiyatına satılırdı. Döviz
  tutarları KDV ve satış vergisi hariçtir.

  TL tarafı değişmedi: varsayılan pricing.ts'te, Kurucu Konsolu'ndan
  yayımlanan tutar üstüne yazar (fiyat-kaynagi). Döviz tutarları
  şimdilik yalnızca burada; konsoldan değiştirilemiyor.

  Tutarlar sent / euro-sent cinsinden tamsayı (depo değişmezi: para
  küçük birim cinsinden). Teklif usulü basamak TL'de null'sa dövizde de
  null — bir para biriminde rakam yayımlayıp ötekinde "teklif" demek
  çelişki olurdu (birim testi sabitliyor).
*/
import { YILLIK_ODENEN_AY, planlar, tutarYaz, type Plan, type SiteProduct } from "./pricing";
import { ekKalemTutari, planTutari, type Fiyatlar } from "./fiyat-kaynagi";
import { LOCALE_TAGS, type Locale } from "./routes";

export type ParaBirimi = "TRY" | "USD" | "EUR";

export const SAYFA_PARA_BIRIMI: Record<Locale, ParaBirimi> = { tr: "TRY", en: "USD", de: "EUR", es: "EUR", fr: "EUR", ar: "USD" };

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

/** Sayfanın para biriminde aylık tutar; teklif usulüyse null. */
export function sayfaPlanTutari(plan: Plan, locale: Locale, fiyatlar?: Fiyatlar): number | null {
  const kur = SAYFA_PARA_BIRIMI[locale];
  if (kur === "TRY") return planTutari(plan, fiyatlar);
  return DOVIZ_FIYATLARI[plan.code]?.[kur] ?? null;
}

/** Yıllık bedel: aylığın tam katı, bölme ve yuvarlama yok (TL ile aynı kural). */
export function sayfaPlanYillikTutari(plan: Plan, locale: Locale, fiyatlar?: Fiyatlar): number | null {
  const aylik = sayfaPlanTutari(plan, locale, fiyatlar);
  return aylik === null ? null : aylik * YILLIK_ODENEN_AY;
}

export function sayfaEkKalemTutari(kod: string, locale: Locale, fiyatlar?: Fiyatlar): number | null {
  const kur = SAYFA_PARA_BIRIMI[locale];
  if (kur === "TRY") return ekKalemTutari(kod, fiyatlar);
  return DOVIZ_FIYATLARI[kod]?.[kur] ?? null;
}

/**
 * "1.990 TL" · "$59" · "55 €" — sayfanın dilinin para yazımıyla.
 * TL eski biçiminde kalıyor ("1.990 TL"): Türkçe sayfa bu değişiklikle
 * görünüşünü değiştirmesin.
 */
export function paraYaz(kucukBirim: number, locale: Locale): string {
  const kur = SAYFA_PARA_BIRIMI[locale];
  if (kur === "TRY") return `${tutarYaz(kucukBirim, locale)} TL`;
  /*
    Arapça sayfa doları İngilizce biçimle yazar ("$59"). Arapça yerel ayar
    "US$ 59" üretiyor ve sağdan sola satırda "$US 59" diye diziliyordu;
    Körfez'deki SaaS sitelerinin de yaptığı gibi tanıdık biçim kalsın.
  */
  return new Intl.NumberFormat(locale === "ar" ? "en-US" : LOCALE_TAGS[locale], { style: "currency", currency: kur, maximumFractionDigits: 0, minimumFractionDigits: 0 }).format(kucukBirim / 100);
}

/*
  Ana sayfadaki ürün kartının "Başlangıç: …" fiyatı: o ürünün rakamı
  yayımlanmış en ucuz basamağı, sayfanın para biriminde. Ücretler
  sayfasıyla AYNI kaynak (sayfaPlanTutari) — kartta ayrı bir rakam
  yazılsaydı fiyat değişince biri eski kalırdı. Kişi başı fiyatlanan
  basamak (ArvoLab) birimini de taşır; "$45" yazıp kişi başı olduğunu
  söylememek fiyatı olduğundan düşük gösterirdi. Hiçbir basamağın
  rakamı yoksa null: kart "teklif usulü" yazar.
*/
export function baslangicFiyati(urun: SiteProduct, locale: Locale, fiyatlar?: Fiyatlar): { tutar: number; kisiBasi: boolean } | null {
  let enUcuz: { tutar: number; kisiBasi: boolean } | null = null;
  for (const plan of planlar(urun)) {
    const tutar = sayfaPlanTutari(plan, locale, fiyatlar);
    if (tutar === null) continue;
    if (!enUcuz || tutar < enUcuz.tutar) enUcuz = { tutar, kisiBasi: Boolean(plan.kisiBasi) };
  }
  return enUcuz;
}
