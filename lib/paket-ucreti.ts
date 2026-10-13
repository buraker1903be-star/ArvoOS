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

  Saf modül: birim testi tests/unit/paket-ucreti.test.ts.
*/
import { PLANS } from "./site/pricing";

/** Veritabanı paket kodu → yayımlanmış plan kodu. */
const YAYIN_KODU: Record<string, string> = {
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
export function paketListeFiyatiKurus(planCode: string | null | undefined): number | null {
  const kod = YAYIN_KODU[String(planCode ?? "").trim()];
  if (!kod) return null;
  return PLANS.find((plan) => plan.code === kod)?.aylikKurus ?? null;
}

/**
 * Kiracının aylık ücreti liste fiyatından sapıyor mu?
 *
 * Sapma HATA DEĞİL: çoğu kiracının pazarlıkla değişmiş tutarı var.
 * Ekran yalnızca "liste 1.990, bu kurum 1.500 ödüyor" diye gösteriyor;
 * kurucu bilerek mi öyle olduğunu kendisi bilir.
 */
export function ucretSapmasi(planCode: string | null | undefined, aylikKurus: number | null | undefined): {
  liste: number | null;
  mevcut: number | null;
  durum: "girilmedi" | "liste" | "farkli" | "teklif";
} {
  const liste = paketListeFiyatiKurus(planCode);
  const mevcut = aylikKurus === null || aylikKurus === undefined ? null : Number(aylikKurus);
  if (liste === null) return { liste, mevcut, durum: "teklif" };
  if (mevcut === null || mevcut === 0) return { liste, mevcut: null, durum: "girilmedi" };
  return { liste, mevcut, durum: mevcut === liste ? "liste" : "farkli" };
}
