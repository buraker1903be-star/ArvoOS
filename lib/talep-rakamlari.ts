/*
  Ana sayfa kartlarının talep (crm_opportunities) rakamları.

  Saf fonksiyonlar: birim testi (`talep-rakamlari.test.ts`) bunları sabitliyor.
*/

export type TalepSatiri = {
  stage: string;
  estimated_value: number | null;
  probability: number | null;
};

/* Kapanmış talepler tahmine girmez. */
export const KAPALI_ASAMALAR = ["won", "lost", "completed"] as const;

/* Teklifi hazırlanmış ya da onaylanmış, sonucu beklenen talepler. */
export const TEKLIF_BEKLEYEN_ASAMALAR = ["proposal_ready", "proposal_approved"] as const;

/** Tahmini değer × olasılık; satır başına yuvarlanır ki toplam ekrandakiyle birebir tutsun. */
export function agirlikliTahmin(satirlar: TalepSatiri[]): number {
  return satirlar.reduce(
    (toplam, satir) => toplam + Math.round(Number(satir.estimated_value ?? 0) * Number(satir.probability ?? 0) / 100),
    0,
  );
}

export function aktifTalepler<T extends TalepSatiri>(satirlar: T[]): T[] {
  return satirlar.filter((satir) => !(KAPALI_ASAMALAR as readonly string[]).includes(satir.stage));
}

/*
  "Teklif bekleyen" kartı: sayı ve altındaki tutar AYNI kümeden gelir.
  Eskiden tutar tüm aktif taleplerin (yeni talepler dahil) ağırlıklı
  tahminiydi; AkademikMerkez'de kart "0" teklif bekliyor ama
  "₺5.825.811 tahmini değer" gösteriyordu.
*/
export function teklifBekleyen(satirlar: TalepSatiri[]): { adet: number; tahmin: number } {
  const bekleyen = satirlar.filter((satir) => (TEKLIF_BEKLEYEN_ASAMALAR as readonly string[]).includes(satir.stage));
  return { adet: bekleyen.length, tahmin: agirlikliTahmin(bekleyen) };
}
