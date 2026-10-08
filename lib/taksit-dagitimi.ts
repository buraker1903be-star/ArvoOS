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
