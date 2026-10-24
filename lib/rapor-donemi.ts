import { monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";

/*
  RAPOR DÖNEMİ — TEK YERDE (2026-10-24).

  Dönem çözümü raporlar sayfasının içinde duruyordu. Sekiz rapor aynı
  dönemi okuyacak ve her biri kendi kopyasını taşısaydı, "Bu ay" bir
  raporda ayın 1'inden, başkasında dünden başlayabilirdi — iki rapor
  aynı dönem etiketiyle farklı sayı gösterirdi ve hiçbiri hata vermezdi.

  DÖNEM TÜRKİYE GÜNÜYLE (12.10.2026'da düzeltildi).

  Eskiden aralık sunucunun yerel saatiyle (`new Date(yıl, ay, 1)`)
  kuruluyor, kayıtlar da zaman damgasının UTC gününe (`slice(0, 10)`)
  göre aralığa sokuluyordu. Sunucu UTC'de çalıştığı için ayın 1'inde
  00:00–03:00 arasında gelen talep ya da imzalanan sözleşme önceki aya
  yazılıyor; ayın ilk üç saatinde "Bu ay" hâlâ geçen ayı gösteriyordu.
  Artık her şey "YYYY-AA-GG" Türkiye günü anahtarı: dönem bugünden,
  kayıt kendi anından (`gunAnahtari`) türetiliyor.

  Geçersiz özel aralık ("?baslangic=abc") eskiden `Invalid Date`
  üretip sorgu penceresinde `toISOString` ile sayfayı düşürüyordu;
  artık "Bu ay"a dönülüyor, ters girilen aralık düzeltiliyor.
*/
const GUN = /^\d{4}-\d{2}-\d{2}$/;

export const AYLAR = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export const gecerliGun = (deger?: string): deger is string =>
  Boolean(deger && GUN.test(deger) && !Number.isNaN(Date.parse(`${deger}T00:00:00Z`)));

/** Ayın son günü; ay 1–12, taşma serbest. */
export const ayinSonGunu = (yil: number, ay: number) => new Date(Date.UTC(yil, ay, 0)).toISOString().slice(0, 10);

/** Zaman damgası Türkiye gününe; yalın tarih ("2026-10-01") olduğu gibi. */
export const gunAnahtari = (deger: string) => (deger.length > 10 ? todayInIstanbul(new Date(deger)) : deger);

export const gunYazisi = (gun: string) => {
  const [y, a, g] = gun.split("-");
  return `${g}.${a}.${y}`;
};

export type Donem = { startKey: string; endKey: string; key: string };

export function donemCoz(range?: string, customStart?: string, customEnd?: string): Donem {
  const [yil, ay] = todayInIstanbul().split("-").map(Number);
  if (range === "gecen_ay") return { startKey: monthStartKey(yil, ay - 1), endKey: ayinSonGunu(yil, ay - 1), key: range };
  if (range === "bu_yil") return { startKey: `${yil}-01-01`, endKey: `${yil}-12-31`, key: range };
  if (range === "ozel" && gecerliGun(customStart) && gecerliGun(customEnd)) {
    const [startKey, endKey] = customStart <= customEnd ? [customStart, customEnd] : [customEnd, customStart];
    return { startKey, endKey, key: range };
  }
  return { startKey: monthStartKey(yil, ay), endKey: ayinSonGunu(yil, ay), key: "bu_ay" };
}

/** Başlıkta ve yazdırma künyesinde görünen dönem adı. */
export const donemEtiketi = ({ startKey, endKey, key }: Donem) =>
  key === "bu_ay" ? "Bu ay"
  : key === "gecen_ay" ? "Geçen ay"
  : key === "bu_yil" ? "Bu yıl"
  : `${gunYazisi(startKey)} – ${gunYazisi(endKey)}`;

/**
 * Aralıktaki günleri sınayan yüklem. Rapor gövdeleri bunu kullanıyor;
 * her biri kendi karşılaştırmasını yazsaydı biri `>=`, öteki `>`
 * kullanabilirdi — dönemin ilk günü bir raporda içeride, ötekinde
 * dışarıda kalırdı.
 */
export const aralikYuklemi = ({ startKey, endKey }: Donem) => (deger: string | null) => {
  if (!deger) return false;
  const gun = gunAnahtari(deger);
  return gun >= startKey && gun <= endKey;
};
