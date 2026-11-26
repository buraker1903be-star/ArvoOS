/*
  KONSOLUN DÖNEM SEÇİMİ (26.11.2026).

  Ürün performansı tablosu ve ürün detayı "seçili dönem" üzerinden okunuyor.
  Dönem SAF bir fonksiyonla tarihe çevriliyor; sunucu UTC'de çalıştığı için
  gün sınırı Türkiye saatiyle alınıyor (lib/istanbul-date, AGENTS.md:
  `new Date().toISOString().slice(0,10)` gece 00:00–03:00 arasında dünü verir).

  Önceki dönem de burada: "önceki 30 güne göre" karşılaştırması iki ayrı
  yerde hesaplanırsa biri gün sınırını kaydırır ve ekranda birbirini
  tutmayan iki yüzde çıkar.
*/
import { istanbulMidnight, todayInIstanbul } from "@/lib/istanbul-date";

export const DONEMLER = [
  { kod: "30g", etiket: "Son 30 gün", gun: 30 },
  { kod: "90g", etiket: "Son 90 gün", gun: 90 },
  { kod: "12a", etiket: "Son 12 ay", gun: 365 },
] as const;

export type DonemKodu = (typeof DONEMLER)[number]["kod"];

export const VARSAYILAN_DONEM: DonemKodu = "30g";

/** Adresten gelen değer tanınmıyorsa varsayılana döner; ekran boş kalmaz. */
export function donemKodu(deger: string | undefined): DonemKodu {
  return DONEMLER.some((d) => d.kod === deger) ? (deger as DonemKodu) : VARSAYILAN_DONEM;
}

export type Donem = {
  kod: DonemKodu;
  etiket: string;
  gun: number;
  /** Dönemin başı (dahil) — Türkiye gününün 00:00'ı, ISO. */
  baslangic: string;
  /** Dönemin sonu (hariç) — yarının 00:00'ı, ISO. Bugünün kayıtları içeride. */
  bitis: string;
  /** Bir önceki aynı uzunluktaki pencere; karşılaştırma için. */
  oncekiBaslangic: string;
  oncekiBitis: string;
};

/**
 * Seçili dönemi tarihe çevirir.
 * @param bugun Türkiye gününün anahtarı (YYYY-MM-DD); testler sabitler.
 */
export function donem(kod: DonemKodu, bugun: string = todayInIstanbul()): Donem {
  const tanim = DONEMLER.find((d) => d.kod === kod) ?? DONEMLER[0];
  /* Bitiş YARIN 00:00: "son 30 gün" bugünü de kapsamalı. Üst sınır dahil
     yazılırsa (bugün 23:59) saniyelerle oynanır ve gün sonu kayıtları düşer. */
  const bitisGunu = gunEkle(bugun, 1);
  const baslangicGunu = gunEkle(bitisGunu, -tanim.gun);
  const oncekiBaslangicGunu = gunEkle(baslangicGunu, -tanim.gun);
  return {
    kod: tanim.kod, etiket: tanim.etiket, gun: tanim.gun,
    baslangic: istanbulMidnight(baslangicGunu).toISOString(),
    bitis: istanbulMidnight(bitisGunu).toISOString(),
    oncekiBaslangic: istanbulMidnight(oncekiBaslangicGunu).toISOString(),
    oncekiBitis: istanbulMidnight(baslangicGunu).toISOString(),
  };
}

/** YYYY-MM-DD gün anahtarına gün ekler; UTC'ye sabit, saat taşımaz. */
function gunEkle(gun: string, adet: number): string {
  const t = new Date(`${gun}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + adet);
  return t.toISOString().slice(0, 10);
}

/** Bir damga dönemin içinde mi (başı dahil, sonu hariç). */
export function donemde(damga: string | null | undefined, d: Pick<Donem, "baslangic" | "bitis">): boolean {
  if (!damga) return false;
  return damga >= d.baslangic && damga < d.bitis;
}
