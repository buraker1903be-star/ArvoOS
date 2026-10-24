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

/* Marka adı kararı nötr bir modülde (lib/kurum-adi): panel içi
   evrak da (rapor künyesi) aynı kararı kullanıyor ve finans
   raporunun "müşteri mesajı şablonları"nı içe aktarması okuyanı
   yanıltırdı. Buradan yeniden dışa veriliyor. */
export { organizationBrandName } from "@/lib/kurum-adi";

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
