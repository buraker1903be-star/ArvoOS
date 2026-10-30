/*
  MAAŞ TAKİBİ VE HAKEDİŞ — saf kurallar (30.10.2026).

  ArvoOS BORDRO HESAPLAMIYOR (gerekçe migration 20261030065444'te):
  SGK ve vergiyi mali müşavir hesaplıyor. Burada yalnızca işverenin
  ÖDEYECEĞİ tutar ve müşavirin ihtiyaç duyduğu sayılar var. Ekranlar
  (app/panel/hr/maaslar, app/panel/hr/hakedisler) yalnızca çiziyor;
  kural burada, birim testi tests/unit/maas.test.ts.
*/

export type MaasSatiri = {
  anlasilan_net: number | null;
  resmi_net: number | null;
  ek_odeme: number;
  avans: number;
  kesinti: number;
};

/**
 * Ödenecek tutar (kuruş). Müşavirin hesapladığı net GİRİLMİŞSE esas o:
 * resmî bordronun neti; girilmemişse anlaşılan net. Ek ödeme eklenir,
 * avans ve kesinti düşülür. Hiçbir net yoksa null — "0 ödenecek" demek
 * maaşı unutulmuş kişiyi ödenmiş gibi gösterirdi.
 */
export function odenecekTutar(s: MaasSatiri): { tutar: number | null; eksi: boolean } {
  const taban = s.resmi_net ?? s.anlasilan_net;
  if (taban === null || taban === undefined) return { tutar: null, eksi: false };
  const tutar = taban + (s.ek_odeme || 0) - (s.avans || 0) - (s.kesinti || 0);
  /* Avans ve kesinti maaşı aşıyorsa ödenecek sıfır, ama ekran bunu
     söylemeli: fark bir sonraki aya devreden bir alacaktır, sessizce
     yok olmamalı. */
  return tutar < 0 ? { tutar: 0, eksi: true } : { tutar, eksi: false };
}

export type IzinKaydi = { leave_type: string; start_date: string; end_date: string; status: string };

export const IZIN_ADI: Record<string, string> = {
  annual: "Yıllık izin", excuse: "Mazeret izni", sick: "Rapor", unpaid: "Ücretsiz izin", other: "Diğer",
};

const GUN = 86_400_000;
const gunSayisi = (bas: string, son: string) => Math.round((Date.parse(`${son}T00:00:00Z`) - Date.parse(`${bas}T00:00:00Z`)) / GUN) + 1;

/** Ayın son günü (YYYY-AA-GG); ay anahtarı ayın ilk günü. */
export function ayinSonu(ay: string): string {
  const [y, a] = ay.split("-").map(Number);
  return new Date(Date.UTC(y, a, 0)).toISOString().slice(0, 10);
}

/**
 * Ayın izin günleri, türe göre, TAKVİM günü. Yalnızca onaylı izinler;
 * ay sınırını aşan iznin yalnızca bu aya düşen günleri sayılır. SGK'nın
 * "eksik gün" bildirimi (ücretsiz izin, rapor) takvim günüyle yapılıyor;
 * müşavir bu sayıyı istiyor. Kesintiyi müşavir hesaplıyor, burası
 * hesaplamıyor.
 */
export function ayinIzinleri(izinler: IzinKaydi[], ay: string): Record<string, number> {
  const son = ayinSonu(ay);
  const sonuc: Record<string, number> = {};
  for (const i of izinler) {
    if (i.status !== "approved") continue;
    const bas = i.start_date > ay ? i.start_date : ay;
    const bit = i.end_date < son ? i.end_date : son;
    if (bas > bit) continue;
    sonuc[i.leave_type] = (sonuc[i.leave_type] ?? 0) + gunSayisi(bas, bit);
  }
  return sonuc;
}

/** Müşavirin eksik gün olarak bildireceği günler: ücretsiz izin ve rapor. */
export const eksikGun = (izinler: Record<string, number>) => (izinler.unpaid ?? 0) + (izinler.sick ?? 0);

/** Hakedişte ödenecek: anlaşılan tutar eksi müşavirin söylediği stopaj. */
export const hakedisNeti = (h: { tutar: number; stopaj: number }) => Math.max(0, h.tutar - (h.stopaj || 0));

export const BELGE_ADI: Record<string, string> = { fatura: "Fatura", smm: "Serbest meslek makbuzu", yok: "Belge yok" };

/** Bordroya giren çalışma tipleri; sözleşmeli (contractor) hakedişle ödenir. */
export const KADROLU_TIPLER = ["full_time", "part_time", "intern"] as const;
export const kadroluMu = (tip: string) => (KADROLU_TIPLER as readonly string[]).includes(tip);
