/*
  PROFORMANIN MÜŞTERİYE ULAŞIP ULAŞMADIĞI (02.11.2026).

  29.10–02.11.2026 arasında otomatik proforma migration'ı canlıda yoktu ve
  kesilen proformalar müşteriye hiç gitmedi; konsolun ana sayfası onları
  yine "gönderilmiş, ödemesi gelmemiş" diye listeliyordu. Gönderim iki
  kanal (e-posta, uygulama içi bildirim) ve her birinin zamanı ayrı
  tutuluyor (lib/otomatik-proforma-isi proformayiUlastir); bu kural
  ikisinden ekranın göstereceği tek durumu çıkarıyor.

  Saf modül (tests/unit/proforma-gonderim.test.ts).
*/
export type GonderimKaydi = { gonderildi_at?: string | null; bildirildi_at?: string | null; gonderim_hatasi?: string | null };
export type GonderimDurumu = "gitti" | "eksik" | "gitmedi";

export function gonderimDurumu(k: GonderimKaydi): GonderimDurumu {
  const eposta = Boolean(k.gonderildi_at);
  const bildirim = Boolean(k.bildirildi_at);
  if (eposta && bildirim) return "gitti";
  /* Biri gittiyse müşteri belgeden haberdar; eksik kanal yeniden denenir
     (yalnizEksik), müşteri aynı e-postayı iki kez almaz. */
  if (eposta || bildirim) return "eksik";
  return "gitmedi";
}

export const GONDERIM_ADI: Record<GonderimDurumu, string> = {
  gitti: "Müşteriye gitti",
  eksik: "Yarım gitti",
  gitmedi: "Müşteriye gitmedi",
};

export const GONDERIM_TONU: Record<GonderimDurumu, "success" | "warning" | "danger"> = {
  gitti: "success",
  eksik: "warning",
  gitmedi: "danger",
};

/** Kuyruk sırası: gitmeyen önce, sonra yarım, sonra giden; eşitlikte verilen sıra korunur. */
export function gonderimSirasi<T extends GonderimKaydi>(satirlar: readonly T[]): T[] {
  const agirlik: Record<GonderimDurumu, number> = { gitmedi: 0, eksik: 1, gitti: 2 };
  return satirlar.map((s, i) => ({ s, i })).sort((a, b) => agirlik[gonderimDurumu(a.s)] - agirlik[gonderimDurumu(b.s)] || a.i - b.i).map((x) => x.s);
}
