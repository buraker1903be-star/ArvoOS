/*
  HAZIR CEVAPLAR — saf kısım.

  Ortak kutuda aynı sorulara her gün yeniden yazılıyor. Hazır cevap
  metni kurumun; yer tutucular gönderim anında doldurulur, veritabanında
  değil — aynı şablon iki yazışmada aynı metni üretirdi.

  Yer tutucu kümesi BİLEREK küçük: bir şablon dili değil, üç bilgi.
  Daha fazlası, panelde öğrenilmesi gereken ikinci bir dil demek.
*/

export const YER_TUTUCULAR = [
  { anahtar: "musteri", aciklama: "Yazışmadaki kişinin adı" },
  { anahtar: "ben", aciklama: "Cevabı yazan personelin adı" },
  { anahtar: "kurum", aciklama: "Kurumun adı" },
] as const;

export type SablonDegerleri = { musteri?: string | null; ben?: string | null; kurum?: string | null };

/* Yer tutucu ve ÖNÜNDEKİ yatay boşluk birlikte yakalanıyor: değer
   boşsa boşluk da gitsin, "Sayın , merhaba" kalmasın. */
const DESEN = /([ \t]*)\{\{\s*([A-Za-z_]+)\s*\}\}/g;

/**
 * Yer tutucuları doldurur.
 *
 * Değeri olmayan yer tutucu METİNDEN DÜŞER ve çevresindeki fazlalık
 * toplanır: "Sayın {{musteri}}," şablonu ad bilinmiyorken "Sayın ,"
 * üretmemeli. Tanınmayan yer tutucu olduğu gibi kalır — kullanıcı
 * yazdığı şeyi ekranda görsün, sessizce kaybolmasın.
 */
export function sablonuDoldur(govde: string, degerler: SablonDegerleri): string {
  const bilinen = new Set<string>(YER_TUTUCULAR.map((yer) => yer.anahtar));
  /* toLowerCase, toLocaleLowerCase DEĞİL: Türkçe yerelde "I" harfi "ı"ya
     iniyor ve "{{MUSTERI}}" tanınmıyordu. Anahtarlar ASCII. */
  const dusenSatirlar = new Set<number>();
  let satir = 0;
  let sonIndeks = 0;

  const doldurulmus = (govde ?? "").replace(DESEN, (tamami, bosluk: string, anahtar: string, indeks: number) => {
    satir += (govde.slice(sonIndeks, indeks).match(/\n/g) ?? []).length;
    sonIndeks = indeks;
    const ad = anahtar.toLowerCase();
    if (!bilinen.has(ad)) return tamami;
    const deger = (degerler[ad as keyof SablonDegerleri] ?? "").trim();
    if (deger) return `${bosluk}${deger}`;
    dusenSatirlar.add(satir);
    return "";
  });

  /* Yalnızca yer tutucu DÜŞEN satırların baştaki boşluğu kırpılıyor:
     her satırı kırpmak, şablondaki girintili listeyi bozardı. */
  return doldurulmus
    .split("\n")
    .map((metin, sira) => (dusenSatirlar.has(sira) ? metin.replace(/^[ \t]+/, "").replace(/[ \t]+([,.;:!?])/g, "$1") : metin))
    .join("\n")
    .trimEnd();
}

/** Şablon adı: iki ile seksen karakter, baş/son boşluksuz. */
export function sablonAdiEngeli(ham: string): string | null {
  const ad = (ham ?? "").trim();
  if (ad.length < 2) return "Hazır cevabın adı en az 2 karakter olmalı.";
  if (ad.length > 80) return "Hazır cevabın adı en fazla 80 karakter olabilir.";
  return null;
}

/** Şablon gövdesi: iki ile beş bin karakter. */
export function sablonGovdesiEngeli(ham: string): string | null {
  const govde = (ham ?? "").trim();
  if (govde.length < 2) return "Hazır cevabın metni boş olamaz.";
  if (govde.length > 5000) return "Hazır cevabın metni en fazla 5.000 karakter olabilir.";
  return null;
}
