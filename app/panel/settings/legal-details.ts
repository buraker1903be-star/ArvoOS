// "Resmi bilgiler ve banka" alanlarının ortak kuralları: form (anlık uyarı)
// ve sunucu işlemi (kesin kontrol) aynı fonksiyonları kullanır.

import { TURKISH_CITIES } from "@/app/_components/legal/format";
import { digitsOnly, ibanError, mersisError, normalizeIban, taxNumberError } from "@/app/_components/legal/identifiers";

export const LEGAL_FIELDS = [
  "legal_name", "legal_address", "legal_city", "legal_district", "tax_office",
  "tax_number", "mersis_no", "bank_name", "bank_account_holder", "iban",
] as const;
export type LegalField = (typeof LEGAL_FIELDS)[number];
export type LegalDetailsValues = Record<LegalField, string>;
export type LegalDetailsErrors = Partial<Record<LegalField, string>>;

// Veritabanı kısıtlarıyla aynı sınırlar (20260912202000_org_legal_bank_details.sql).
export const LEGAL_LIMITS: Record<LegalField, number> = {
  legal_name: 200, legal_address: 500, legal_city: 60, legal_district: 60, tax_office: 120,
  tax_number: 11, mersis_no: 16, bank_name: 120, bank_account_holder: 200, iban: 34,
};

export function legalDetailsFrom(source?: Record<string, unknown> | null): LegalDetailsValues {
  const values = {} as LegalDetailsValues;
  for (const field of LEGAL_FIELDS) {
    const value = source?.[field];
    values[field] = typeof value === "string" ? value : "";
  }
  return values;
}

const singleLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** Kaydedilecek biçim: boşluklar sadeleşir, numaralar yalnızca rakam, IBAN bitişik ve büyük harf. */
export function normalizeLegalDetails(values: LegalDetailsValues): LegalDetailsValues {
  return {
    legal_name: singleLine(values.legal_name),
    legal_address: values.legal_address.split(/\r?\n/).map(singleLine).filter(Boolean).join("\n"),
    legal_city: singleLine(values.legal_city),
    legal_district: singleLine(values.legal_district),
    tax_office: singleLine(values.tax_office),
    tax_number: digitsOnly(values.tax_number),
    mersis_no: digitsOnly(values.mersis_no),
    bank_name: singleLine(values.bank_name),
    bank_account_holder: singleLine(values.bank_account_holder),
    iban: normalizeIban(values.iban),
  };
}

export function validateLegalDetails(raw: LegalDetailsValues): LegalDetailsErrors {
  const values = normalizeLegalDetails(raw);
  const errors: LegalDetailsErrors = {};
  for (const field of LEGAL_FIELDS) {
    if (field === "iban" || field === "tax_number" || field === "mersis_no") continue;
    if (values[field].length > LEGAL_LIMITS[field]) errors[field] = `En fazla ${LEGAL_LIMITS[field]} karakter girilebilir.`;
  }
  if (values.legal_city && !TURKISH_CITIES.includes(values.legal_city)) errors.legal_city = "Listeden bir il seçin.";
  if (values.legal_address && !values.legal_city) errors.legal_city = "Adres girildiğinde il de seçilmelidir (tebligat ve yetkili mahkeme için).";
  if ((values.legal_city || values.legal_district) && !values.legal_address) errors.legal_address = "İl/ilçe ile birlikte açık adres de girilmelidir.";

  const taxError = taxNumberError(raw.tax_number);
  if (taxError) errors.tax_number = taxError;
  else if (values.tax_office && !values.tax_number) errors.tax_number = "Vergi dairesi girildiğinde vergi numarası da gerekli.";
  if (values.tax_number && !values.tax_office && !errors.tax_office) errors.tax_office = "Vergi numarası girildiğinde vergi dairesi de gerekli.";

  const mersis = mersisError(raw.mersis_no);
  if (mersis) errors.mersis_no = mersis;

  const iban = ibanError(raw.iban);
  if (iban) errors.iban = iban;
  else if (!values.iban && (values.bank_name || values.bank_account_holder)) errors.iban = "Banka bilgisi girildiğinde IBAN da gerekli.";
  return errors;
}

export const firstLegalError = (errors: LegalDetailsErrors) => LEGAL_FIELDS.map((field) => errors[field]).find(Boolean) ?? null;
