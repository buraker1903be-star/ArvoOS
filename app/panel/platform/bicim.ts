import type { StgTone } from "../settings/settings-ui";

/*
  Platform ekranlarının ortak biçimleyicileri.

  Aynı para, tarih ve depolama biçimi sekiz sayfada ayrı ayrı yazılıydı;
  biri düzeltilince diğerleri sapıyordu — depolama kiracı dosyasında GB
  yazarken lisans sayfasında hâlâ "512000 MB" idi.
*/

const sayiBicimi = new Intl.NumberFormat("tr-TR");

/** Tutarlar kuruş cinsinden tamsayı (AGENTS.md "Değişmezler"). */
export const para = (kurus: number, birim = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: birim || "TRY" }).format(kurus / 100);

export const sayi = (deger: number) => sayiBicimi.format(deger);

export const tarih = (deger: string | null) =>
  deger ? new Date(deger).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" }) : "—";

export const tarihSaat = (deger: string | null) =>
  deger
    ? new Date(deger).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "medium", timeStyle: "short" })
    : "—";

/** <input type="date"> için ISO gün. */
export const tarihDegeri = (deger: string | null) => (deger ? deger.slice(0, 10) : "");

/**
 * Depolamayı okunur birimde yazar. "512000 MB" kimsenin kafasında bir
 * büyüklüğe karşılık gelmiyordu; 500 GB geliyor.
 */
export function depolama(mb: number): string {
  if (mb >= 1024) {
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: mb >= 10240 ? 0 : 1 }).format(mb / 1024)} GB`;
  }
  return `${sayiBicimi.format(mb)} MB`;
}

/** Kullanım yüzdesi. Limit yoksa (0) oran da yok. */
export const yuzde = (kullanilan: number, limit: number) =>
  limit > 0 ? Math.min(100, Math.round((kullanilan / limit) * 100)) : 0;

/**
 * Kullanım oranının tonu. Eşikler tek yerde: liste rozetiyle sayfa
 * içindeki ölçer aynı anda sarıya dönmeli, yoksa kurucu hangisine
 * inanacağını bilemez.
 */
export const kullanimTonu = (oran: number): StgTone =>
  oran >= 100 ? "danger" : oran >= 85 ? "warning" : "success";

/** Lisans ve abonelik durumlarının tonu (etiketler lib/products.ts'te). */
export const LISANS_TONU: Record<string, StgTone> = {
  trialing: "info", active: "success", past_due: "warning",
  suspended: "danger", canceled: "danger", inactive: "neutral",
};

/** Paket kodları ekranda görünmemeli. */
export const PAKET_ADI: Record<string, string> = {
  starter: "Başlangıç", professional: "Profesyonel", enterprise: "Kurumsal",
};
