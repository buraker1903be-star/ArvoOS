/*
  PARA ÇEKİRDEĞİ (28.11.2026) — tutar + ISO para birimi birlikte.

  Depo 28.11.2026'ya kadar tek para birimliydi: tutarlar kuruş cinsinden
  tam sayı (bu doğruydu ve değişmiyor), ama BİRİM hiçbir yerde taşınmıyordu.
  Kırk beş ekranda `Intl.NumberFormat(..., { currency: "TRY" })` yazılıydı
  ve `lib/site/pricing.ts` tek bir `PARA_BIRIMI = "TRY"` sabiti tutuyordu.
  ArvoLab'ın USD satışıyla birlikte bu kabul kırıldı.

  Buradaki kural üç cümle:

   1. TUTAR HER ZAMAN ALT BİRİM. Kuruş ya da sent; ikisi de 100'de bir.
      `Tutar` tipi değeri ve birimi BİRLİKTE taşır, çünkü ayrı taşınan
      ikisi er geç ayrışıyor.
   2. FARKLI BİRİMLER TOPLANMAZ. `topla()` tek bir sayı değil, para
      birimine göre AYRILMIŞ bir liste döndürür — "12.500 + 850 = 13.350"
      gibi bir toplamı yazmak API'de mümkün değil.
   3. KUR ÇEVRİMİ YOK. Bu modül bilerek kur bilmiyor. Çevrim gerekirse
      kaynağı, zamanı ve yöntemiyle ayrı bir raporlama özelliği olarak
      tasarlanacak (kurum sahibinin kararı).
*/

/** Satışta ve tahsilatta kullanılabilen para birimleri. */
export const SATIS_PARA_BIRIMLERI = ["TRY", "USD"] as const;
export type ParaBirimi = (typeof SATIS_PARA_BIRIMLERI)[number];

/** Varsayılan: on yıllık kayıtların tamamı ve bütün mevcut sözleşmeler. */
export const VARSAYILAN_PARA_BIRIMI: ParaBirimi = "TRY";

export const paraBirimiMi = (deger: unknown): deger is ParaBirimi =>
  typeof deger === "string" && (SATIS_PARA_BIRIMLERI as readonly string[]).includes(deger);

/**
 * Serbest metinden para birimi; tanınmazsa null.
 *
 * `null` dönmesi önemli: bilinmeyen bir birimi sessizce TRY saymak,
 * 100 USD'lik bir ödemeyi 100 TL gibi göstermenin en kısa yolu.
 */
export function paraBirimiCoz(deger: unknown): ParaBirimi | null {
  if (typeof deger !== "string") return null;
  const temiz = deger.trim().toUpperCase();
  /* PayTR "TL" yazıyor; ISO karşılığı TRY. Sağlayıcı sınırında çeviri
     AÇIK yapılır, veritabanına her zaman ISO kodu girer. */
  if (temiz === "TL") return "TRY";
  return paraBirimiMi(temiz) ? temiz : null;
}

/** Sağlayıcı sınırı: ISO kodundan PayTR'nin beklediği değere. */
export const paytrParaBirimi = (birim: ParaBirimi): "TL" | "USD" => (birim === "TRY" ? "TL" : "USD");

/** Tutar: değer ALT BİRİMDE (kuruş/sent), birim ISO kodu. */
export type Tutar = { altBirim: number; paraBirimi: ParaBirimi };

export const tutar = (altBirim: number, paraBirimi: ParaBirimi): Tutar => ({ altBirim, paraBirimi });

export const aynitBirim = (a: Tutar, b: Tutar): boolean => a.paraBirimi === b.paraBirimi;

/*
  BİÇİM. Türkçe arayüzde TL simgeyle ("₺4.990,00"), öteki birimler
  kodla ("850,00 USD") yazılıyor — kurum sahibinin örneklediği biçim
  bu. Sayı ayırıcıları her iki durumda da Türkçe: panelin tamamı
  tr-TR okuyor ve aynı ekranda iki ayrı ayırıcı görmek tutarı yanlış
  okutuyor.
*/
const BICIM = new Map<ParaBirimi, Intl.NumberFormat>();
function bicim(birim: ParaBirimi): Intl.NumberFormat {
  let f = BICIM.get(birim);
  if (!f) {
    f = birim === "TRY"
      ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    BICIM.set(birim, f);
  }
  return f;
}

/** "₺4.990,00" · "850,00 USD" */
export function paraYaz(t: Tutar): string {
  const sayi = bicim(t.paraBirimi).format(t.altBirim / 100);
  return t.paraBirimi === "TRY" ? sayi : `${sayi} ${t.paraBirimi}`;
}

/** Tutarsız (yalnızca birim) yazım: "USD", "₺". */
export const paraIsareti = (birim: ParaBirimi): string => (birim === "TRY" ? "₺" : birim);

/**
 * Para birimine göre AYRI toplamlar.
 *
 * Dönen liste satış birimlerinin sabit sırasında (TRY, USD): aynı ekranda
 * iki kez çağrıldığında sıra değişmesin.
 */
export function topla(kalemler: readonly Tutar[]): Tutar[] {
  const toplam = new Map<ParaBirimi, number>();
  for (const k of kalemler) toplam.set(k.paraBirimi, (toplam.get(k.paraBirimi) ?? 0) + k.altBirim);
  return SATIS_PARA_BIRIMLERI.filter((b) => toplam.has(b)).map((b) => tutar(toplam.get(b) ?? 0, b));
}

/**
 * Toplamların tek satırlık yazımı: "₺12.500,00 · 850,00 USD".
 *
 * Hiç kalem yoksa `bos` (varsayılan "—"): sıfır yazmak, "veri yok" ile
 * "gerçekten sıfır"ı karıştırıyor.
 */
export const toplamYaz = (kalemler: readonly Tutar[], bos = "—"): string => {
  const t = topla(kalemler);
  return t.length ? t.map(paraYaz).join(" · ") : bos;
};

/*
  TÜRKÇE GİRİŞ. "1.234,56" bin ayırıcılıdır, 1,234 değil; kural ve
  gerekçesi lib/turkish-amount.ts'te (depo değişmezi). Burada yalnızca
  birimle eşleştiriliyor.
*/
export { kurusOku, liraYazisi, parseTurkishAmount } from "./turkish-amount";

/** Alt birimi tam sayıya sabitler; ondalık bir değer buraya hiç girmemeli. */
export function altBirimDogrula(deger: unknown, alan = "tutar"): number {
  const sayi = typeof deger === "number" ? deger : Number(deger);
  if (!Number.isFinite(sayi) || !Number.isInteger(sayi)) throw new Error(`${alan} tam sayı alt birim olmalı.`);
  if (sayi < 0) throw new Error(`${alan} negatif olamaz.`);
  return sayi;
}

/**
 * İki tutarın tahsilat eşleşmesi.
 *
 * Para birimi FARKLIYSA tutar eşit olsa bile eşleşme yok: 100 USD ile
 * 100 TRY aynı ödeme değildir. Ödeme dönüşünde bu kural tek yerde
 * duruyor ki webhook, manuel onay ve mutabakat aynı cevabı versin.
 */
export function odemeEslesiyorMu(beklenen: Tutar, gelen: Tutar): boolean {
  return beklenen.paraBirimi === gelen.paraBirimi && beklenen.altBirim === gelen.altBirim;
}

/** Eşleşmeme sebebi; eşleşiyorsa null. Ekranda ve kayıtta aynı metin. */
export function eslesmeFarki(beklenen: Tutar, gelen: Tutar): string | null {
  if (beklenen.paraBirimi !== gelen.paraBirimi) {
    return `Para birimi uyuşmuyor: beklenen ${beklenen.paraBirimi}, gelen ${gelen.paraBirimi}.`;
  }
  if (beklenen.altBirim !== gelen.altBirim) {
    return `Tutar uyuşmuyor: beklenen ${paraYaz(beklenen)}, gelen ${paraYaz(gelen)}.`;
  }
  return null;
}
