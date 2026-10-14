/*
  PAKET ADLARI — TEK KAYNAK (14.10.2026, kurum sahibi: "paket adlarını
  belli standarta taşıyalım").

  Veritabanı kodu ile ekranda yazan ad arasındaki eşleme beş ayrı yerde
  elle yazılıydı (konsol biçimleyicisi, lisans formu, ürün formu, sözleşme
  abonelik alanları, kart ödeme bağlantısı) ve hepsi sitedekinden
  farklıydı: konsol `professional`'a "Profesyonel", `enterprise`'a
  "Kurumsal" diyordu; sitede ₺5.990'lık "Kurumsal" `professional`'ın,
  teklif usulü "Özel kurum" `enterprise`'ın karşılığı. Kurucu aynı paketi
  iki ekranda iki adla görüyordu.

  Ad SİTEDEKİ addır (lib/site/pricing PLANS, YAYIN_KODU eşlemesiyle);
  birim testi (tests/unit/paket-adlari.test.ts) ikisinin aynı kaldığını
  sabitliyor. Saf modül.
*/
export const PAKET_ADLARI: Record<string, string> = {
  starter: "Başlangıç",
  professional: "Kurumsal",
  enterprise: "Özel kurum",
};

/** Seçim listeleri için sıralı paketler (küçükten büyüğe). */
export const PAKET_SECENEKLERI = (["starter", "professional", "enterprise"] as const)
  .map((kod) => ({ kod, ad: PAKET_ADLARI[kod] }));

/** Kodun ekrandaki adı; bilinmeyen kod olduğu gibi yazılır. */
export const paketAdi = (kod: string | null | undefined) => (kod ? PAKET_ADLARI[kod] ?? kod : "");

/*
  ÖZEL ALAN ADI YALNIZCA ÖZEL KURUM PAKETİNDE (14.10.2026, kurum sahibinin
  kararı: "kendi özel alan adları var, bu da özel kurum niteliğinde").
  Eskiden hiçbir pakete bağlı değildi; kurum ayarlarından her pakete alan
  adı girilebiliyordu. Kural dört yazma yolunda da aynı (konsolun kurum
  ayarları, yeni müşteri sihirbazı, lisans formunda paket değişikliği,
  kurumun kendi Ayarlar'ı); KALDIRMAK her pakette serbest — aksi hâlde
  paketi düşen kurum alan adından kurtulamazdı.
*/
export const OZEL_ALAN_ADI_PAKETI = "enterprise";
export const ozelAlanAdiAcikMi = (planCode: string | null | undefined) => planCode === OZEL_ALAN_ADI_PAKETI;
export const OZEL_ALAN_ADI_UYARISI = "Özel alan adı yalnızca Özel kurum paketinde kullanılabilir.";
