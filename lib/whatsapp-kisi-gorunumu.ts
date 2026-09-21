/*
  Sohbet listesindeki kişi görünümü: baş harfler, renk tonu, numara biçimi.

  Yüz fotoğrafı yok (Meta profil resmini webhook'la vermiyor), bu yüzden
  ayırt edici olan baş harfler ve renk. Renk numaradan türetiliyor: aynı
  kişi her açılışta aynı renkte olsun, yoksa renk ayırt etmeye yaramaz.
*/

/** 905321234567 → 0532 123 45 67. Tanımadığı biçimi olduğu gibi bırakır. */
export function numaraYaz(phone: string): string {
  return phone.length === 12 && phone.startsWith("90")
    ? `0${phone.slice(2, 5)} ${phone.slice(5, 8)} ${phone.slice(8, 10)} ${phone.slice(10)}`
    : phone;
}

/**
 * Avatarda görünen bir ya da iki harf.
 *
 * Ad yoksa numaranın son iki hanesi kullanılıyor: boş bir yuvarlak
 * sohbetleri birbirinden ayırmaya yaramazdı.
 */
export function basHarfler(ad: string | null | undefined, phone: string): string {
  const kelimeler = (ad ?? "")
    .trim()
    .split(/\s+/)
    .filter((k) => /\p{L}/u.test(k));

  if (kelimeler.length >= 2) {
    return (ilkHarf(kelimeler[0]) + ilkHarf(kelimeler[1])).slice(0, 2);
  }
  if (kelimeler.length === 1) {
    // Türkçe kural: "işlem" → "İ", İngilizce kuralla "I" olurdu.
    return kelimeler[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  }
  return phone.slice(-2);
}

function ilkHarf(kelime: string): string {
  return kelime.slice(0, 1).toLocaleUpperCase("tr-TR");
}

/**
 * Numaradan renk tonu (0-359).
 *
 * Basit bir toplam yeterli: amaç güvenlik değil, komşu satırların
 * birbirinden ayrılması. Çarpan asal, yoksa art arda kaydedilen
 * numaralar aynı tona düşüyordu.
 */
export function renkTonu(phone: string): number {
  let toplam = 0;
  for (const harf of phone) toplam = (toplam * 31 + harf.charCodeAt(0)) % 360;
  return toplam;
}
