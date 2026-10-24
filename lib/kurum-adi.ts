/*
  KURUMUN MARKA ADI (24.10.2026'da kendi modülüne alındı).

  İşlev `lib/customer-message-templates.ts` içinde duruyordu, yani
  müşteriye giden mesajların dosyasında. Oysa aynı karar PANEL İÇİ
  evrakta da gerekiyor: rapor künyesinde yöneticinin görmesi gereken
  şey hangi MARKANIN rakamlarına baktığıdır, kurumun ticari unvanı
  değil. Finans raporunun "müşteri mesajı şablonları"nı içe aktarması
  okuyanı yanıltırdı.

  ÜÇ AD, ÜÇ AYRI İŞ — karıştırılmamalı:
   - `organizations.name`  → TİCARİ UNVAN. Teklif, sözleşme ve
     gizlilik sözleşmesinde basılan yasal taraf adı. Rapor künyesi
     bunu göstermez.
   - `organizations.display_name` → MARKA. Kenar çubuğu, müşteri
     mesajları ve rapor künyesi bunu gösterir.
   - `organizations.legal_name` → Ayarlar'daki ticari unvan alanı.

  Marka adı yoksa ticari unvandan türetiliyor: "… Ltd. Şti." ve
  "… Anonim Şirketi" ekleri atılıyor. Unvanı olduğu gibi yazmak
  kurum adını her ekranda bir satır uzunluğunda gösterirdi.
*/
export function organizationBrandName(input: {
  slug?: string;
  displayName?: string | null;
  legalName: string;
}) {
  if (input.displayName?.trim()) return input.displayName.trim();
  /* İki kurucu kurumun kısa adı koda yazılı: ikisinin de ticari
     unvanı aynı ("ARVOCULTURE GROUP …") ve unvandan türetmek ikisini
     aynı ada indirirdi. Yeni kiracılar `display_name` ile geliyor. */
  if (input.slug === "akademikmerkez") return "AkademikMerkez";
  if (input.slug === "arvo-os") return "ArvoOS";
  return unvandanMarka(input.legalName);
}

/*
  ŞİRKET EKİNİ ATARKEN TÜRKÇE BÜYÜK HARF TUZAĞI (24.10.2026).

  Ek, `/\s+ltd\.?\s*şti\.?$/i` ile atılıyordu ve `/i` bayrağı
  Türkçe İ'yi i'ye KATLAMIYOR: "Beta Danışmanlık LTD.ŞTİ." eşleşmiyor,
  marka adı "Beta Danışmanlık LTD.ŞTİ." olarak kalıyordu — üstelik
  Türkçe'de unvanın büyük harfle yazılması olağan. Aynı tuzak bu
  ekosistemde daha önce de kuruldu (ArvoARC çeviri doğrulaması).

  Çözüm: eşleşme için unvanın Türkçe kurallarla küçültülmüş bir
  KOPYASI kullanılıyor, kesme özgün metinden yapılıyor. `ı` da `i`ye
  indiriliyor çünkü Türkçe küçültme büyük "I"yı noktasız ı yapıyor
  ("LIMITED" → "lımıted"). İki dönüşüm de uzunluğu korur, yani
  kopyadaki konum özgün metinde de geçerli.
*/
const SIRKET_EKLERI = [
  /\s+(anonim|limited)\s+şirketi.*$/,
  /\s+ltd\.?\s*şti\.?$/,
];

export function unvandanMarka(unvan: string): string {
  const temiz = unvan.trim();
  const kucuk = temiz.toLocaleLowerCase("tr").replace(/ı/g, "i");
  for (const ek of SIRKET_EKLERI) {
    const eslesme = kucuk.match(ek);
    if (eslesme?.index !== undefined) return temiz.slice(0, eslesme.index).trim();
  }
  return temiz;
}
