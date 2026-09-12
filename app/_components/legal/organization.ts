// Kurumun resmi ve banka bilgilerinin belge satırına (DocumentRow)
// taşınması. Panel sorgusu (organizations sütunları) ve herkese açık
// arvo_public_organization_legal aynı sütun adlarını döndürür.

import type { DocumentRow } from "./format";

export const ORGANIZATION_LEGAL_COLUMNS = "legal_name,legal_address,legal_city,legal_district,tax_office,tax_number,mersis_no,bank_name,bank_account_holder,iban";

export type OrganizationLegal = {
  legal_name: string | null;
  legal_address: string | null;
  legal_city: string | null;
  legal_district: string | null;
  tax_office: string | null;
  tax_number: string | null;
  mersis_no: string | null;
  bank_name: string | null;
  bank_account_holder: string | null;
  iban: string | null;
};

const clean = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
};

/** Kaynak kayıt yoksa (migration uygulanmadı / RPC hata verdi) boş alanlar döner; belge eski davranışla çizilir. */
export function organizationLegalFields(source: DocumentRow | null | undefined): DocumentRow {
  const record = source ?? {};
  return {
    organization_legal_name: clean(record.legal_name),
    organization_legal_address: clean(record.legal_address),
    organization_legal_city: clean(record.legal_city),
    organization_legal_district: clean(record.legal_district),
    organization_tax_office: clean(record.tax_office),
    organization_tax_number: clean(record.tax_number),
    organization_mersis_no: clean(record.mersis_no),
    organization_bank_name: clean(record.bank_name),
    organization_bank_account_holder: clean(record.bank_account_holder),
    organization_iban: clean(record.iban),
  };
}
