/*
  KADEMELİ KURUCU YETKİSİ (02.11.2026, kurum sahibinin isteği).

  Konsola giren herkes tam yetkiliydi: "yalnızca finans" ya da "yalnızca
  destek" bakacak birini eklemenin yolu yoktu. Artık kurucu başına izinli
  ALANLAR tutuluyor (public.platform_kurucu_alanlari). Alanlar dock'un iş
  alanlarıyla aynı (app/panel/os/konsol-apps.ts; birim testi ikisinin
  aynı kaldığını sabitliyor): kurucu menüde gördüğü uygulamayı açabilir,
  görmediğini açamaz.

  SATIRI OLMAYAN KURUCU TAM YETKİLİDİR (null kapsam). Bu hem bugünkü
  durumu korur hem de şu kuralı mümkün kılar: kısıtı yalnızca tam
  yetkili kurucu yazar ve kendi satırını yazamaz, yani en az bir tam
  yetkili her zaman kalır.

  Sınır uygulama katmanında (sayfa, sunucu işlemi, dock); veritabanı
  politikaları kısıtlı kurucuyu hâlâ kurucu sayıyor — gerekçe migration
  20261102181453'te.

  Saf modül (tests/unit/konsol-alanlari.test.ts).
*/
export const KONSOL_ALANLARI = [
  { kod: "musteriler", ad: "Müşteriler", aciklama: "Müşteri kartları, lisanslar, kullanıcılar, bireysel aboneler, duyuru ve aylık rapor" },
  { kod: "finans", ad: "Finans", aciklama: "Tahsilat, ödeme onayları, abonelikler, sözleşme onayları, proforma ve faturalar" },
  { kod: "destek", ad: "Destek", aciklama: "Kurumların destek talepleri ve hazır yanıtlar" },
  { kod: "urunler", ad: "Ürünler ve Fiyatlar", aciklama: "Ürünler, modül matrisi, fiyat listesi ve paket limitleri" },
  { kod: "sistem", ad: "Sistem", aciklama: "Kurulumlar, sistem sağlığı ve ayarlar" },
] as const;

export type KonsolAlani = (typeof KONSOL_ALANLARI)[number]["kod"];
/** null: tam yetki. Küme: yalnızca bu alanlar. */
export type KonsolKapsami = ReadonlySet<KonsolAlani> | null;

const GECERLI = new Set<string>(KONSOL_ALANLARI.map((a) => a.kod));

export const alanAdi = (kod: string) => KONSOL_ALANLARI.find((a) => a.kod === kod)?.ad ?? kod;

/**
 * Veritabanı satırından kapsam. Satır yoksa tam yetki. Satırdaki tanınmayan
 * adlar elenir (kısıt veritabanında da var); elendikten sonra boş kalan
 * küme "hiçbir alan" demektir, tam yetki DEĞİL — bozuk bir satır kimseyi
 * genişletmemeli.
 */
export function kapsamOku(satir: { alanlar: unknown } | null | undefined): KonsolKapsami {
  if (!satir) return null;
  const alanlar = Array.isArray(satir.alanlar) ? satir.alanlar : [];
  return new Set(alanlar.filter((a): a is KonsolAlani => typeof a === "string" && GECERLI.has(a)));
}

export const alanAcik = (kapsam: KonsolKapsami, alan: KonsolAlani) => kapsam === null || kapsam.has(alan);

/** Alanlardan BİRİ yeterli (aynı form iki alanın ekranında duruyorsa). */
export const alanlardanBiriAcik = (kapsam: KonsolKapsami, alanlar: readonly KonsolAlani[]) =>
  alanlar.some((alan) => alanAcik(kapsam, alan));

/** Formdan gelen seçim: geçerli, tekrarsız, katalog sırasında. */
export function alanSecimi(degerler: readonly unknown[]): KonsolAlani[] {
  const secili = new Set(degerler.map(String));
  return KONSOL_ALANLARI.map((a) => a.kod).filter((kod) => secili.has(kod));
}

/** Dock süzgeci: ana ekran her zaman; geri kalanı kapsamdaysa. */
export function uygulamalariSuz<T extends { key: string }>(uygulamalar: readonly T[], kapsam: KonsolKapsami): T[] {
  if (kapsam === null) return [...uygulamalar];
  return uygulamalar.filter((u) => u.key === "home" || (GECERLI.has(u.key) && kapsam.has(u.key as KonsolAlani)));
}

/**
 * Konsolun KENDİ kurumunu hedefleyen işlem (üye erişimi, giriş bağlantısı,
 * lisans, modül, kurum ayarı) yalnızca tam yetkili kurucuya açık. Eskiden
 * kısıtlı kurucu "Müşteriler" işlemleriyle tam yetkilinin üyeliğini
 * kapatabiliyor ya da kapalı bir kurucuyu açıp ona giriş bağlantısı
 * üretebiliyordu (gerekçe app/panel/platform/konsol-alani.ts).
 */
export function kendiKurumuEngeli(kapsam: KonsolKapsami, hedefKurum: string, konsolKurumu: string): string | null {
  return hedefKurum === konsolKurumu && kapsam !== null
    ? "ArvoOS'un kendi kurumunda bu işlemi yalnızca tam yetkili kurucu yapabilir."
    : null;
}
