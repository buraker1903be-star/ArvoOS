/*
  ANALİTİK GÜN SERİSİ (22.10.2026).

  analitik_ozet yalnızca kaydı OLAN günleri döndürüyor; grafik boş günü
  de çubuk olarak göstermeli, yoksa "dün kimse gelmedi" bilgisi kaybolur
  ve çubuklar yanıltıcı biçimde bitişik durur. Özet 2×gün pencereyle
  çağrılıyor: pencereden önceki günler "önceki dönem" toplamına gider.

  Gün anahtarları iki tarafta da TÜRKİYE günü: veritabanı
  `(created_at at time zone 'Europe/Istanbul')::date` üretiyor, bugün de
  todayInIstanbul'dan geliyor. Burada saat yok, yalnızca gün aritmetiği
  (UTC gece yarısına sabitli, kaymıyor).

  Saf modül: testi tests/unit/analitik-seri.test.ts.
*/
export type GunSatiri = { gun: string; ziyaretci: number; sayfa: number; form: number };
export type Donem = { ziyaretci: number; sayfa: number; form: number };

const GUN_MS = 86_400_000;
export const gunEkle = (gun: string, n: number) => new Date(Date.parse(`${gun}T00:00:00Z`) + n * GUN_MS).toISOString().slice(0, 10);

export function analitikSerisi(gunluk: readonly GunSatiri[], bugun: string, gun: number) {
  const ilk = gunEkle(bugun, -(gun - 1));
  const oncekiIlk = gunEkle(bugun, -(2 * gun - 1));
  const harita = new Map(gunluk.map((satir) => [satir.gun, satir]));
  const gunler: GunSatiri[] = Array.from({ length: gun }, (_, sira) => {
    const anahtar = gunEkle(ilk, sira);
    const satir = harita.get(anahtar);
    return { gun: anahtar, ziyaretci: Number(satir?.ziyaretci ?? 0), sayfa: Number(satir?.sayfa ?? 0), form: Number(satir?.form ?? 0) };
  });
  const onceki: Donem = { ziyaretci: 0, sayfa: 0, form: 0 };
  for (const satir of gunluk) {
    if (satir.gun >= oncekiIlk && satir.gun < ilk) {
      onceki.ziyaretci += Number(satir.ziyaretci) || 0;
      onceki.sayfa += Number(satir.sayfa) || 0;
      onceki.form += Number(satir.form) || 0;
    }
  }
  return { gunler, onceki, enCok: Math.max(1, ...gunler.map((g) => g.ziyaretci)) };
}

/**
 * Önceki döneme göre değişim yüzdesi. Önceki dönem sıfırsa yüzde
 * anlamsız (sonsuz): null döner, ekran "önceki dönemde veri yok" yazar.
 */
export function degisim(simdi: number, once: number): number | null {
  if (!once) return null;
  return Math.round(((simdi - once) / once) * 100);
}

/**
 * Kaç günde bir etiket: 7 günde her gün, 14'te iki, 30'da beş. Son gün
 * (bugün) her zaman etiketli — gözün aradığı ilk çubuk o.
 */
export function etiketliMi(sira: number, toplam: number): boolean {
  const adim = toplam <= 7 ? 1 : toplam <= 14 ? 2 : 5;
  return (toplam - 1 - sira) % adim === 0;
}
