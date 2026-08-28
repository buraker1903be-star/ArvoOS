type DocumentMessageInput = {
  organizationName: string;
  customerName?: string;
  documentNo?: string;
  title?: string;
  formattedAmount?: string;
  url: string;
};

const salutation = (name?: string) =>
  name ? `Sayın ${name},` : "Sayın Yetkili,";
const documentLabel = (type: "proposal" | "contract", no?: string) =>
  `${no ? `${no} numaralı ` : ""}${type === "proposal" ? "teklif" : "sözleşme"}`;

export function organizationBrandName(input: {
  slug?: string;
  displayName?: string | null;
  legalName: string;
}) {
  if (input.displayName?.trim()) return input.displayName.trim();
  if (input.slug === "akademikmerkez") return "AkademikMerkez";
  if (input.slug === "arvo-os") return "ArvoOS";
  return input.legalName
    .replace(/\s+(anonim|limited)\s+şirketi.*$/i, "")
    .replace(/\s+ltd\.?\s*şti\.?$/i, "")
    .trim();
}

export function proposalMessages(input: DocumentMessageInput) {
  const label = documentLabel("proposal", input.documentNo);
  const subject = `${input.documentNo ? `${input.documentNo} — ` : ""}Teklifiniz — ${input.organizationName}`;
  const message = `${salutation(input.customerName)}\n\n${input.title ? `${input.title} hizmetiniz için ` : ""}hazırlanan ${label} aşağıdadır.\n\nTeklifinizi incelemek ve onaylamak için:\n${input.url}\n\nSaygılarımızla,\n${input.organizationName}`;
  return {
    subject,
    email: message,
    whatsapp: message,
  };
}

export function contractMessages(input: DocumentMessageInput) {
  const label = documentLabel("contract", input.documentNo);
  const subject = `${input.documentNo ? `${input.documentNo} — ` : ""}Sözleşmeniz — ${input.organizationName}`;
  const message = `${salutation(input.customerName)}\n\n${input.title ? `${input.title} hizmetiniz için ` : ""}hazırlanan ${label} aşağıdadır.\n\nSözleşmenizi incelemek ve elektronik olarak imzalamak için:\n${input.url}\n\nSaygılarımızla,\n${input.organizationName}`;
  return {
    subject,
    email: message,
    whatsapp: message,
  };
}
