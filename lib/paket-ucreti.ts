/*
  Paket kodundan LİSTE FİYATINA.

  Kurucu her yeni kiracının aylık ücretini elle yazıyordu; yayımlanmış
  fiyat listesi (arvo-os.com/ucretler) ile paneldeki tutar arasında
  hiçbir bağ yoktu. Fiyat listesi 13.10.2026'da değişti ve o güne kadar
  elle girilmiş tutarların hiçbiri kendiliğinden güncellenmedi — zaten
  güncellenmemeli (yürürlükteki dönem etkilenmez), ama YENİ kurulumun
  varsayılanı da eski kalıyordu.

  Veritabanındaki plan_code (starter/professional/enterprise) ile
  yayımlanmış plan kodu (arvoos-baslangic/-kurumsal/-ozel) aynı şey
  değil; eşleme burada, tek yerde. Rakam yok: lib/site/pricing.ts tek
  kaynak olmaya devam ediyor.

  KONSOLDAN YAYIMLANAN FİYAT (14.10.2026). Tutar eskiden doğrudan koddan
  (PLANS) okunuyordu; konsolda yayımlanan yeni fiyat sitede görünüyor,
  kurulumun "liste fiyatını uygula" düğmesi ise hâlâ eski rakamı
  yazıyordu. Çağıran yayımlanmış tabloyu (lib/site/fiyat-oku) veriyor;
  verilmezse koddaki değer — sitedeki kuralın aynısı (fiyat-kaynagi).

  Saf modül: birim testi tests/unit/paket-ucreti.test.ts.
*/
import { PLANS } from "./site/pricing";
import type { Fiyatlar } from "./site/fiyat-kaynagi";

/** Veritabanı paket kodu → yayımlanmış plan kodu. */
export const YAYIN_KODU: Record<string, string> = {
  starter: "arvoos-baslangic",
  professional: "arvoos-kurumsal",
  enterprise: "arvoos-ozel",
};

/**
 * Paketin yayımlanmış aylık liste fiyatı (kuruş).
 *
 * null üç durumda: paket tanınmıyor, yayımlanmış planı yok ya da plan
 * TEKLİF usulü (Özel kurum). Teklif usulü pakete uydurma bir varsayılan
 * yazmak, pazarlıkla belirlenen bir tutarı liste fiyatı gibi göstermek
 * olurdu.
 */
export function paketListeFiyatiKurus(planCode: string | null | undefined, fiyatlar?: Fiyatlar): number | null {
  const kod = YAYIN_KODU[String(planCode ?? "").trim()];
  if (!kod) return null;
  if (fiyatlar?.has(kod)) return fiyatlar.get(kod) ?? null;
  return PLANS.find((plan) => plan.code === kod)?.aylikKurus ?? null;
}

/*
  BİREYSEL ABONENİN FİYATI LİSTEDEN (14.10.2026). ArvoLab'ın bireysel
  aboneliği tek kişilik aylık abonelik; sitedeki karşılığı kişi başı
  satılan Araştırmacı basamağı. Eskiden tutarı konsolun Bireysel Aboneler
  ekranında ayrıca giriliyordu (product_plans.individual_monthly_fee):
  sitede 1.990 yazarken ArvoLab başka bir tutar tahsil edebiliyordu.
  ArvoARC'ın bireysel planının listede karşılığı yok; o, product_plans'ta
  kalıyor.
*/
export const BIREYSEL_PLAN_KODU: Record<string, string> = { arvolab: "arvolab-arastirmaci" };

/** Bireysel abonenin liste fiyatı; ürünün listede karşılığı yoksa undefined (product_plans geçerli). */
export function bireyselListeFiyatiKurus(urun: string, fiyatlar?: Fiyatlar): number | null | undefined {
  const kod = BIREYSEL_PLAN_KODU[urun];
  if (!kod) return undefined;
  if (fiyatlar?.has(kod)) return fiyatlar.get(kod) ?? null;
  return PLANS.find((plan) => plan.code === kod)?.aylikKurus ?? null;
}

/**
 * Kiracının aylık ücreti liste fiyatından sapıyor mu?
 *
 * Sapma HATA DEĞİL: çoğu kiracının pazarlıkla değişmiş tutarı var.
 * Ekran yalnızca "liste 1.990, bu kurum 1.500 ödüyor" diye gösteriyor;
 * kurucu bilerek mi öyle olduğunu kendisi bilir.
 */
export function ucretSapmasi(planCode: string | null | undefined, aylikKurus: number | null | undefined, fiyatlar?: Fiyatlar): {
  liste: number | null;
  mevcut: number | null;
  durum: "girilmedi" | "liste" | "farkli" | "teklif";
} {
  const liste = paketListeFiyatiKurus(planCode, fiyatlar);
  const mevcut = aylikKurus === null || aylikKurus === undefined ? null : Number(aylikKurus);
  if (liste === null) return { liste, mevcut, durum: "teklif" };
  if (mevcut === null || mevcut === 0) return { liste, mevcut: null, durum: "girilmedi" };
  return { liste, mevcut, durum: mevcut === liste ? "liste" : "farkli" };
}
