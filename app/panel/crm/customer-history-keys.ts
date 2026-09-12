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

/* ---------- Müşteri sorgulama penceresi ----------
 * Kural veritabanındaki crm_customer_search ile aynı
 * (supabase/migrations/20260912200000_crm_customer_lookup.sql):
 * harf içermeyen sorgu telefon sayılır; en az 4 rakam gerekir. Harf varsa
 * ad soyad araması; en az 2 harf gerekir. */

export const LOOKUP_MIN_DIGITS = 4;
export const LOOKUP_MIN_LETTERS = 2;

/** Aranan telefon parçası: "+90 532" -> "532", "05324628098" -> "5324628098". */
export function searchPhoneDigits(raw: string): string {
  const trimmed = raw.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (/^(\+|00)\s*9\s*0/.test(trimmed)) digits = digits.replace(/^(00)?90/, "");
  else if (digits.length > 10) digits = digits.slice(-10);
  return digits.replace(/^0+/, "");
}

export type LookupQuery =
  | { mode: "phone"; digits: string; key: string }
  | { mode: "name"; name: string; tokens: string[]; key: string }
  | { mode: "short"; kind: "phone" | "name" }
  | null;

/** Sorgunun türünü ve aramaya hazır olup olmadığını söyler. */
export function parseLookupQuery(raw: string): LookupQuery {
  const value = raw.trim().slice(0, 120);
  if (!value) return null;
  if (!/[^0-9\s+()./-]/.test(value)) {
    const digits = searchPhoneDigits(value);
    if (value.replace(/\D/g, "").length < LOOKUP_MIN_DIGITS || digits.length < 3) return { mode: "short", kind: "phone" };
    return { mode: "phone", digits, key: `p|${digits}` };
  }
  const name = nameKey(value);
  if (name.replace(/ /g, "").length < LOOKUP_MIN_LETTERS) return { mode: "short", kind: "name" };
  return { mode: "name", name, tokens: name.split(" "), key: `n|${name}` };
}

/** Müşteri sorgulamadan "Bu müşteri için yeni talep": talep formunu doldurur. */
export const NEW_REQUEST_PREFILL_EVENT = "arvo:new-request-prefill";
export type NewRequestPrefill = { name: string; phone: string | null; email: string | null };

/** Sonuç listesinden seçilen müşterinin anahtarı ("p:5324628098" / "n:isik caglar"). */
export function isCustomerKey(value: unknown): value is string {
  return typeof value === "string" && /^(p:\d{7,10}|n:[^\n]{1,180})$/.test(value);
}
