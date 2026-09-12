/**
 * Geri dönen müşteri eşleştirmesinin ortak anahtarları.
 *
 * Hem talep formu (istemci) hem sunucu aynı kuralı kullansın diye ayrı,
 * bağımlılıksız bir dosyada. Telefonlar veritabanında çok farklı
 * biçimlerde duruyor ("+90 532 …", "0532 …", "532…"); son 10 hane aynıysa
 * aynı numara sayılıyor. Adlar Türkçe büyük/küçük harf ve aksan farkı
 * gözetmeden karşılaştırılıyor ("IŞIK" == "ışık" == "isik").
 */

/** En az bu kadar rakam girilmeden telefonla arama yapılmaz. */
export const MIN_PHONE_DIGITS = 7;
/** Ad soyadla arama için en az harf sayısı (boşluklar hariç). */
export const MIN_NAME_CHARS = 5;

/** Yalnızca rakamlar; 10 haneden uzunsa son 10 hane (ülke kodu / baştaki 0 atılır). */
export function phoneKey(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/** Türkçe duyarsız, aksansız, tek boşluklu ad anahtarı. */
export function nameKey(value: string | null | undefined): string {
  return String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function phoneReady(phone: string | null | undefined): boolean {
  return phoneKey(phone).length >= MIN_PHONE_DIGITS;
}

export function nameReady(name: string | null | undefined): boolean {
  return nameKey(name).replace(/ /g, "").length >= MIN_NAME_CHARS;
}

/** Arama yapılacak kadar bilgi girildi mi? (gereksiz sorguların önünde tek kapı) */
export function lookupReady(phone: string | null | undefined, name: string | null | undefined): boolean {
  return phoneReady(phone) || nameReady(name);
}
