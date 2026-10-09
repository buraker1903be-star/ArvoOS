/*
  Cari tahsilatlarını taksitlere dağıtır: en eski vadeden başlayarak.

  Taksitlerin kendi "status" sütunu cari tahsilatıyla güncellenmiyor:
  müşteri 31.500 TL ödemiş, tek taksit (47.000 TL) hâlâ "ödenmedi"
  görünüyor ve cari detayı tamamını "gecikti" sayıyordu. Cari dökümü
  (tahsilat − iade) tek doğru kaynak; taksitlerin durumu ondan türetilir.
  İptal edilen taksit dağıtıma girmez. Tutarlar kuruş.

  Saf modül: birim testi taksit-dagitimi.test.ts.
*/

export type DagitilacakTaksit = { id: string; due_date: string | null; amount: number; status: string };
export type TaksitDurumu = "odendi" | "kismi" | "bekliyor" | "gecikti" | "iptal";
export type DagitilmisTaksit<T> = T & { odenen: number; kalan: number; durum: TaksitDurumu };

export function taksitleriDagit<T extends DagitilacakTaksit>(taksitler: T[], netTahsilat: number, bugun: string): DagitilmisTaksit<T>[] {
  // Vadesiz taksitler en sona; aynı vadede verilen sıra korunur.
  const sirali = [...taksitler].sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31"));
  let kalanTahsilat = Math.max(0, Math.round(netTahsilat));
  return sirali.map((taksit) => {
    const tutar = Math.max(0, Math.round(Number(taksit.amount)));
    if (taksit.status === "cancelled") return { ...taksit, odenen: 0, kalan: 0, durum: "iptal" as const };
    const odenen = Math.min(tutar, kalanTahsilat);
    kalanTahsilat -= odenen;
    const kalan = tutar - odenen;
    const durum: TaksitDurumu = kalan === 0 ? "odendi" : taksit.due_date && taksit.due_date < bugun ? "gecikti" : odenen > 0 ? "kismi" : "bekliyor";
    return { ...taksit, odenen, kalan, durum };
  });
}

/**
 * Cari dökümünden dağıtılacak net tahsilat: tahsilatlar (credit) eksi
 * iadeler (adjustment kaynaklı debit). Cari detayı ve listesiyle aynı kural.
 */
export function netTahsilat(hareketler: { entry_type: string; source_type: string | null; amount: number }[]): number {
  let net = 0;
  for (const h of hareketler) {
    if (h.entry_type === "credit") net += Number(h.amount);
    else if (h.entry_type === "debit" && h.source_type === "adjustment") net -= Number(h.amount);
  }
  return Math.max(0, Math.round(net));
}

/**
 * Kalan taksit toplamını açık bakiyeye sığdırır: fazla, EN GEÇ vadeli
 * taksitlerden düşülür (vadesiz olanlar en geç sayılır).
 *
 * Ödeme planı sözleşmeden büyük olabiliyor (09.10.2026: 45.000 TL'lik
 * sözleşmenin planı 2 × 27.500 = 55.000 TL'ydi). Kalanlar o zaman açık
 * bakiyeyi aşıyor ve "30.000 TL açık, 40.000 TL vadesi geçti" gibi
 * imkânsız bir tablo çıkıyordu. Borç bakiyede yazılı olandan fazla
 * olamaz; tamamen düşen taksit "ödendi" sayılır.
 */
export function bakiyeyeSigdir<T extends { due_date: string | null; kalan: number; durum: TaksitDurumu }>(taksitler: T[], acikBakiye: number): T[] {
  let fazla = taksitler.reduce((toplam, t) => toplam + t.kalan, 0) - Math.max(0, Math.round(acikBakiye));
  if (fazla <= 0) return taksitler;
  const sonuc = [...taksitler];
  const enGecten = sonuc.map((t, sira) => ({ t, sira })).sort((a, b) => (b.t.due_date ?? "9999-12-31").localeCompare(a.t.due_date ?? "9999-12-31") || b.sira - a.sira);
  for (const { t, sira } of enGecten) {
    if (fazla <= 0) break;
    if (t.kalan <= 0) continue;
    const dus = Math.min(t.kalan, fazla);
    fazla -= dus;
    const kalan = t.kalan - dus;
    sonuc[sira] = { ...t, kalan, durum: kalan === 0 ? "odendi" : t.durum };
  }
  return sonuc;
}
