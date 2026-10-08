/*
  Genel bakış grafiği için günlük seri: son N günün (bugün dahil) her
  gününe düşen kayıt sayısı ve bir önceki N günle kıyas.

  Ana ekran ve modül genel bakışları aynı grafiği kullanıyor
  (app/panel/os/genel-bakis.tsx). Gün sınırı Türkiye saatiyle: sunucu UTC'de
  çalıştığı için gece 00:00–03:00 arası kayıt yoksa bir önceki güne düşerdi
  (AGENTS.md: tarih Türkiye saatiyle).

  Saf fonksiyon: saat dışarıdan verilir (simdi), birim testi gunluk-seri.test.ts.
*/
const TZ = "Europe/Istanbul";
const GUN_MS = 24 * 60 * 60 * 1000;

const gunAnahtari = (deger: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(deger));

export type SeriGunu = { key: string; count: number; day: string; title: string; isToday: boolean };
export type GunlukSeri = { days: SeriGunu[]; total: number; previous: number; today: number; max: number; delta: number | null };

/**
 * @param tarihler kaydın zamanı (ISO). Önceki dönem kıyası için en az
 *   2×gun gün geriye kadar olanlar verilmeli.
 * @param agirlik her kaydın sayıya katkısı (ör. tutar); verilmezse 1.
 */
export function gunlukSeri(tarihler: string[], simdi: number, gun = 14, agirlik?: number[]): GunlukSeri {
  const indeks = new Map<string, number>();
  const days: SeriGunu[] = Array.from({ length: gun }, (_, sira) => {
    const an = simdi - (gun - 1 - sira) * GUN_MS;
    const key = gunAnahtari(an);
    indeks.set(key, sira);
    return {
      key,
      count: 0,
      day: new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric" }).format(new Date(an)),
      title: new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(an)),
      isToday: sira === gun - 1,
    };
  });
  let previous = 0;
  tarihler.forEach((tarih, sira) => {
    if (!tarih) return;
    const katki = agirlik?.[sira] ?? 1;
    const yer = indeks.get(gunAnahtari(tarih));
    if (yer !== undefined) days[yer].count += katki;
    else {
      const yas = simdi - Date.parse(tarih);
      if (yas >= gun * GUN_MS && yas < 2 * gun * GUN_MS) previous += katki;
    }
  });
  const total = days.reduce((toplam, g) => toplam + g.count, 0);
  return {
    days,
    total,
    previous,
    today: days[gun - 1].count,
    max: Math.max(1, ...days.map((g) => g.count)),
    delta: previous ? Math.round(((total - previous) / previous) * 100) : null,
  };
}
