/**
 * Telefon numarası gösterimi.
 *
 * Kayıtlar veritabanına çok farklı biçimlerde girilmiş:
 *   "+90 536 746 75 92" · "552 348 29 87" · "0532 462 80 98" · "5348215801"
 * Hepsi aynı numara biçimi ama ekranda beş farklı şekilde görünüyor.
 *
 * Hedef biçim: +90 (5XX) XXX XX XX
 *
 * Veriyi değiştirmiyoruz, yalnızca gösterimde biçimlendiriyoruz.
 * Tanıyamadığımız bir numarayı ASLA kırpmıyor veya değiştirmiyoruz —
 * yurt dışı numarası ya da eksik kayıt olabilir; olduğu gibi gösteriyoruz.
 */

/** Sadece rakamları bırakır. */
const digitsOnly = (value: string) => value.replace(/\D/g, "");

/**
 * Türkiye numarasını 10 haneye indirger (başındaki 90 / 0 atılır).
 * Türkiye numarası değilse null döner.
 */
function toNationalDigits(value: string): string | null {
  const raw = value.trim();
  // Başka bir ülke kodu varsa dokunma: "+49...", "0044..."
  if (/^\+(?!90)/.test(raw)) return null;
  if (/^00(?!90)/.test(raw)) return null;

  let digits = digitsOnly(raw);
  if (digits.startsWith("0090")) digits = digits.slice(4);
  else if (digits.startsWith("90") && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);

  return digits.length === 10 ? digits : null;
}

/** Ekranda gösterilecek hali: +90 (532) 462 80 98 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const national = toNationalDigits(value);
  if (!national) return value.trim(); // tanımadık, olduğu gibi bırak
  return `+90 (${national.slice(0, 3)}) ${national.slice(3, 6)} ${national.slice(6, 8)} ${national.slice(8, 10)}`;
}

/** tel: bağlantısı için boşluksuz hali: +905324628098 */
export function phoneHref(value: string | null | undefined): string | null {
  if (!value) return null;
  const national = toNationalDigits(value);
  if (national) return `+90${national}`;
  const digits = digitsOnly(value);
  return digits.length >= 7 ? (value.trim().startsWith("+") ? "+" + digits : digits) : null;
}

/**
 * Arama için: numaranın hem ham hem biçimli hem de yalın rakam hali.
 *
 * Ekranda "+90 (534) 821 58 01" gören kullanıcı bunu aratıyor, ama
 * veritabanında "5348215801" yazıyor. Üç varyantı da arama metnine
 * koyunca kullanıcı gördüğü gibi arayabiliyor.
 */
export function phoneSearchTerms(value: string | null | undefined): string {
  if (!value) return "";
  return [value, formatPhone(value), digitsOnly(value)].join(" ");
}
