import { istanbulMidnight, monthStartKey } from "./istanbul-date";

/*
  Prim penceresinin dönem süzgeci (eski Prim Hesaplama sayfasından).
  Saf: testi tests/unit/prim-donemi.test.ts.

  Dönem sınırları Türkiye takvimine göre ("YYYY-MM-DD", bitiş hariç).
  Eskiden sunucu (UTC) saatiyle hesaplanıyordu; ayın 1'inde 00:00–03:00
  arasında hak edilen prim önceki aya düşüyordu.

  "tum" seçiliyse süzgeç yok (null): pencere tüm geçmişi gösterir. Prim
  Hesabı'nın bakiyesi zaten tüm geçmişten; dönem yalnızca hareket
  listesini ve dönem özetini daraltır.
*/

export const PRIM_DONEMLERI = [
  ["tum", "Tümü"],
  ["bu-ay", "Bu ay"],
  ["gecen-ay", "Geçen ay"],
  ["bu-yil", "Bu yıl"],
  ["ozel", "Özel"],
] as const;

export type PrimDonemi = { kod: string; startKey: string; endKey: string; start: Date; end: Date } | null;

const gecerliGun = (deger?: string) => Boolean(deger && /^\d{4}-\d{2}-\d{2}$/.test(deger));

export function primDonemi(kod: string | undefined, bugun: string, baslangic?: string, bitis?: string): PrimDonemi {
  const [yil, ay] = bugun.split("-").map(Number);
  const aralik = (startKey: string, endKey: string, k: string) => ({ kod: k, startKey, endKey, start: istanbulMidnight(startKey), end: istanbulMidnight(endKey) });
  if (kod === "bu-ay") return aralik(monthStartKey(yil, ay), monthStartKey(yil, ay + 1), kod);
  if (kod === "gecen-ay") return aralik(monthStartKey(yil, ay - 1), monthStartKey(yil, ay), kod);
  if (kod === "bu-yil") return aralik(monthStartKey(yil, 1), monthStartKey(yil + 1, 1), kod);
  if (kod === "ozel" && gecerliGun(baslangic) && gecerliGun(bitis) && baslangic! <= bitis!) {
    const sonrakiGun = new Date(Date.parse(`${bitis}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    return aralik(baslangic!, sonrakiGun, kod);
  }
  return null;
}

/** "1 Eylül 2026 – 30 Eylül 2026" (bitiş anahtarı hariç olduğu için bir gün geri). */
export function primDonemiYazisi(donem: NonNullable<PrimDonemi>) {
  const bicim = (ms: number) => new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(ms));
  const ilk = Date.parse(`${donem.startKey}T00:00:00Z`);
  const son = Date.parse(`${donem.endKey}T00:00:00Z`) - 86_400_000;
  return ilk >= son ? bicim(ilk) : `${bicim(ilk)} – ${bicim(son)}`;
}

/** Gün anahtarı ("2026-09-01") dönemin içinde mi? Defter hareketleri gün anahtarıyla gelir. */
export const gunDonemde = (gun: string, donem: PrimDonemi) => !donem || (gun >= donem.startKey && gun < donem.endKey);
