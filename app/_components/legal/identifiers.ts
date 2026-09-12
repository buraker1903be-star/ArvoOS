// Kurumun resmi kimlik ve banka bilgileri için doğrulama/biçimlendirme.
// Hem ayarlar formunda (anlık uyarı) hem sunucu işleminde (kesin kontrol)
// aynı kurallar kullanılır; saf fonksiyonlardır.

export const digitsOnly = (value: unknown) => String(value ?? "").replace(/\D/g, "");

/**
 * Vergi Kimlik Numarası (10 hane) — GİB kontrol algoritması:
 * ilk 9 hanenin her biri için t = (d + 9 - i) mod 10, v = t·2^(9-i) mod 9
 * (t ≠ 0 iken v = 0 ise 9); son hane = (10 - Σv mod 10) mod 10.
 */
export function isValidVkn(value: string) {
  if (!/^\d{10}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const t = (Number(value[i]) + 9 - i) % 10;
    let v = (t * 2 ** (9 - i)) % 9;
    if (t !== 0 && v === 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10 === Number(value[9]);
}

/**
 * T.C. Kimlik Numarası (11 hane): ilk hane 0 olamaz;
 * 10. hane = ((1,3,5,7,9. haneler)·7 − (2,4,6,8. haneler)) mod 10;
 * 11. hane = ilk 10 hanenin toplamı mod 10.
 */
export function isValidTckn(value: string) {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  const tenth = (((odd * 7 - even) % 10) + 10) % 10;
  if (tenth !== d[9]) return false;
  return d.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10 === d[10];
}

/** Vergi numarası alanı: 10 haneli VKN veya 11 haneli TCKN. Hata metni ya da null. */
export function taxNumberError(raw: string) {
  const value = digitsOnly(raw);
  if (!value) return null;
  if (/[^\d\s]/.test(raw.trim())) return "Vergi numarası yalnızca rakamlardan oluşmalıdır.";
  if (value.length === 10) return isValidVkn(value) ? null : "Vergi kimlik numarası geçersiz (kontrol hanesi tutmuyor).";
  if (value.length === 11) return isValidTckn(value) ? null : "T.C. kimlik numarası geçersiz (kontrol haneleri tutmuyor).";
  return "10 haneli vergi kimlik numarası veya 11 haneli T.C. kimlik numarası girin.";
}

export function taxNumberKind(raw: string): "vkn" | "tckn" | null {
  const value = digitsOnly(raw);
  if (value.length === 10) return "vkn";
  if (value.length === 11) return "tckn";
  return null;
}

/** MERSİS numarası: 16 hane (isteğe bağlı). */
export function mersisError(raw: string) {
  const value = digitsOnly(raw);
  if (!value) return null;
  if (/[^\d\s]/.test(raw.trim())) return "MERSİS numarası yalnızca rakamlardan oluşmalıdır.";
  return value.length === 16 ? null : "MERSİS numarası 16 haneli olmalıdır.";
}

/** Boşlukları atar, büyük harfe çevirir: " tr33 0006 ..." → "TR330006...". */
export function normalizeIban(raw: unknown) {
  return String(raw ?? "").replace(/[\s-]+/g, "").toUpperCase();
}

/** ISO 13616 mod-97 kontrolü (ülke kodu ve kontrol haneleri sona taşınır). */
export function ibanChecksumValid(iban: string) {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = /\d/.test(char) ? char : String(char.charCodeAt(0) - 55);
    for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Türkiye IBAN'ı: TR + 24 rakam (26 karakter) ve geçerli mod-97. */
export function isValidTrIban(raw: unknown) {
  const iban = normalizeIban(raw);
  return /^TR\d{24}$/.test(iban) && ibanChecksumValid(iban);
}

export function ibanError(raw: string) {
  const iban = normalizeIban(raw);
  if (!iban) return null;
  if (!iban.startsWith("TR")) return "IBAN “TR” ile başlamalıdır.";
  if (!/^TR\d*$/.test(iban)) return "IBAN’da TR’den sonra yalnızca rakam bulunmalıdır.";
  if (iban.length !== 26) return `IBAN 26 karakter olmalıdır (şu an ${iban.length}).`;
  return ibanChecksumValid(iban) ? null : "IBAN kontrol haneleri tutmuyor; lütfen numarayı kontrol edin.";
}

/** "TR330006100519786457841326" → "TR33 0006 1005 1978 6457 8413 26" */
export function formatIban(raw: unknown) {
  const iban = normalizeIban(raw);
  return iban.match(/.{1,4}/g)?.join(" ") ?? iban;
}
