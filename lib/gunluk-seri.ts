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
export type GunlukSeri = {
  days: SeriGunu[]; total: number; previous: number; today: number; max: number; delta: number | null;
  /** Bu dönemin ve önceki dönemin takvim aralığı ("27 Eki – 9 Kas"); etiket hesapla aynı günlerden. */
  aralik: string; oncekiAralik: string;
};

const kisaGun = (an: number) => new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(an));

/**
 * @param tarihler kaydın zamanı (ISO). Önceki dönem kıyası için en az
 *   2×gun gün geriye kadar olanlar verilmeli.
 * @param agirlik her kaydın sayıya katkısı (ör. tutar); verilmezse 1.
 */
/** Son `gun` günün boş dilimleri (bugün en sonda) ve gün→sıra indeksi. */
function dilimleriKur(simdi: number, gun: number) {
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
  return { days, indeks };
}

/** Dilimler dolduktan sonraki özet alanları (iki girişte ortak). */
function seriOzeti(days: SeriGunu[], previous: number, gun: number, simdi: number): GunlukSeri {
  const total = days.reduce((toplam, g) => toplam + g.count, 0);
  return {
    aralik: `${kisaGun(simdi - (gun - 1) * GUN_MS)} – ${kisaGun(simdi)}`,
    oncekiAralik: `${kisaGun(simdi - (2 * gun - 1) * GUN_MS)} – ${kisaGun(simdi - gun * GUN_MS)}`,
    days,
    total,
    previous,
    today: days[gun - 1].count,
    max: Math.max(1, ...days.map((g) => g.count)),
    delta: previous ? Math.round(((total - previous) / previous) * 100) : null,
  };
}

export function gunlukSeri(tarihler: string[], simdi: number, gun = 14, agirlik?: number[]): GunlukSeri {
  const { days, indeks } = dilimleriKur(simdi, gun);
  /*
    Önceki dönem de TAKVİM günüyle (OS-02, 09.11.2026). Eskiden bu dönem
    takvim günüyle (bugün dahil 14 gün), önceki dönem kayan saatle
    (şimdiden 14–28 gün önce) sayılıyordu: iki pencere arasında, bu
    dönemin ilk gününden önceki günün saat şimdiye kadarki kısmı hiçbir
    yere sayılmıyor, öndeki bir günün kalanı da önceki döneme
    giriyordu — "önceki döneme göre" yüzdesi etiketteki günlerle
    eşleşmiyordu. Veritabanı dilimlerindeki (gunlukSeriDilimler) kural.
  */
  const oncekiBasi = gunAnahtari(simdi - (2 * gun - 1) * GUN_MS);
  const buDonemBasi = days[0].key;
  let previous = 0;
  tarihler.forEach((tarih, sira) => {
    if (!tarih) return;
    const katki = agirlik?.[sira] ?? 1;
    const anahtar = gunAnahtari(tarih);
    const yer = indeks.get(anahtar);
    if (yer !== undefined) days[yer].count += katki;
    else if (anahtar >= oncekiBasi && anahtar < buDonemBasi) previous += katki;
  });
  return seriOzeti(days, previous, gun, simdi);
}

/*
  VERİTABANINDAN GELEN GÜN DİLİMLERİ ekrana.

  Sayım artık orada yapılıyor (ör. crm_genel_bakis_ozeti): sayfa
  kurumun bütün kayıtlarını çekip bellekte saymıyor — satır tavanına
  çarpıldığı gün grafik sessizce eksiliyordu. Dönen özet yalnızca kayıt
  OLAN günleri taşıyor; boş gün de çubuk olarak görünmeli, yoksa "dün
  hiç talep gelmedi" bilgisi kayboluyor ve çubuklar yanıltıcı biçimde
  bitişik duruyor.

  Gün anahtarı iki tarafta da TÜRKİYE günü: veritabanı
  `timezone('Europe/Istanbul', …)::date` ile üretiyor, buradaki
  `gunAnahtari` aynı sınırı kullanıyor. Biri UTC'ye kayarsa günün ilk
  ve son kaydı yanlış dilime düşer.

  Önceki dönem: aynı uzunlukta, hemen öncesindeki pencere. Özet 2×gun
  günü taşıdığı için pencerenin dışında kalan her gün oraya toplanır.
*/
export function gunlukSeriDilimler(
  ozet: readonly { gun: string; adet: number }[],
  simdi: number,
  gun = 14,
): GunlukSeri {
  const { days, indeks } = dilimleriKur(simdi, gun);
  const oncekiBasi = gunAnahtari(simdi - (2 * gun - 1) * GUN_MS);
  let previous = 0;
  for (const satir of ozet) {
    const adet = Number(satir.adet) || 0;
    const yer = indeks.get(satir.gun);
    if (yer !== undefined) days[yer].count += adet;
    else if (satir.gun >= oncekiBasi) previous += adet;
  }
  return seriOzeti(days, previous, gun, simdi);
}

/*
  DÖNEM DEĞİŞİMİ METNİ (OS-02, 09.11.2026). Grafik kartı yüzdeyi kendisi
  yazıyordu: %0 yeşil "+0%" çıkıyor (değişim yokken büyüme rengi), iki
  dönem de sıfırken hiçbir şey yazmıyor, okunamayan veri gerçek sıfırla
  aynı çiziliyordu. Kural tek yerde ve saf:
    - önceki > 0      → yüzde (bu dönem 0 ise −%100), artış yeşil, düşüş kırmızı, eşit nötr
    - önceki = 0 < bu → yüzde YOK, "önceki 14 günde talep yok", nötr
    - ikisi de 0      → "değişim yok", nötr
    - okunamadı       → "yüklenemedi", uyarı; sıfır gibi gösterilmez
  Tanımsız değişim hiçbir zaman yeşil ya da ok almaz.
*/
export type DonemDegisimi = {
  tur: "artis" | "azalis" | "esit" | "onceki-yok" | "ikisi-sifir" | "yuklenemedi";
  yuzde: number | null;
  metin: string;
  ton: "success" | "danger" | "neutral" | "warning";
};

export function donemDegisimi(
  { total, previous }: { total: number; previous: number },
  { adet, gun = 14, hata = false }: { adet: string; gun?: number; hata?: boolean },
): DonemDegisimi {
  const donem = `önceki ${gun} güne göre`;
  if (hata) return { tur: "yuklenemedi", yuzde: null, metin: "Veri yüklenemedi; değişim hesaplanamadı", ton: "warning" };
  if (previous > 0) {
    const yuzde = Math.round(((total - previous) / previous) * 100);
    if (yuzde === 0) return { tur: "esit", yuzde: 0, metin: `${donem} değişim yok`, ton: "neutral" };
    return yuzde > 0
      ? { tur: "artis", yuzde, metin: `+%${yuzde} ${donem}`, ton: "success" }
      : { tur: "azalis", yuzde, metin: `−%${Math.abs(yuzde)} ${donem}`, ton: "danger" };
  }
  if (total > 0) return { tur: "onceki-yok", yuzde: null, metin: `Önceki ${gun} günde ${adet} yok; yüzde hesaplanmadı`, ton: "neutral" };
  return { tur: "ikisi-sifir", yuzde: null, metin: `Değişim yok; önceki ${gun} günde de ${adet} yok`, ton: "neutral" };
}
