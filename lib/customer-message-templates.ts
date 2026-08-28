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

export function proposalMessages(input: DocumentMessageInput) {
  const label = documentLabel("proposal", input.documentNo);
  const subject = `${input.documentNo ? `${input.documentNo} — ` : ""}Teklifiniz — ${input.organizationName}`;
  const detail = [
    input.title ? `Hizmet: ${input.title}` : "",
    input.formattedAmount ? `Teklif Tutarı: ${input.formattedAmount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    subject,
    email: `${salutation(input.customerName)}\n\n${input.title ? `${input.title} hizmetiniz için ` : ""}hazırlanan ${label} değerlendirmelerinize sunulmuştur.${detail ? `\n\n${detail}` : ""}\n\nTeklifinizi incelemek ve onaylamak için aşağıdaki bağlantıyı kullanabilirsiniz:\n${input.url}\n\nTeklif içeriği veya ödeme planıyla ilgili sorularınız için bizimle iletişime geçebilirsiniz.\n\nSaygılarımızla,\n${input.organizationName}`,
    whatsapp: `${salutation(input.customerName)}\n\n${input.title ? `${input.title} hizmetiniz için ` : ""}hazırlanan ${label} aşağıdadır.${input.formattedAmount ? `\n\nTeklif Tutarı: ${input.formattedAmount}` : ""}\n\nTeklifinizi incelemek ve onaylamak için:\n${input.url}\n\nSaygılarımızla,\n${input.organizationName}`,
  };
}

export function contractMessages(input: DocumentMessageInput) {
  const label = documentLabel("contract", input.documentNo);
  const subject = `${input.documentNo ? `${input.documentNo} — ` : ""}Sözleşmeniz — ${input.organizationName}`;
  const detail = [
    input.title ? `Hizmet: ${input.title}` : "",
    input.formattedAmount ? `Sözleşme Tutarı: ${input.formattedAmount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return {
    subject,
    email: `${salutation(input.customerName)}\n\n${input.title ? `${input.title} hizmetiniz için ` : ""}hazırlanan ${label} inceleme ve elektronik imzanıza sunulmuştur.${detail ? `\n\n${detail}` : ""}\n\nSözleşmenizi incelemek ve elektronik olarak imzalamak için aşağıdaki bağlantıyı kullanabilirsiniz:\n${input.url}\n\nBu bağlantı size özeldir; üçüncü kişilerle paylaşmamanızı rica ederiz. Sorularınız için bizimle iletişime geçebilirsiniz.\n\nSaygılarımızla,\n${input.organizationName}`,
    whatsapp: `${salutation(input.customerName)}\n\n${input.title ? `${input.title} hizmetiniz için ` : ""}hazırlanan ${label} aşağıdadır.${input.formattedAmount ? `\n\nSözleşme Tutarı: ${input.formattedAmount}` : ""}\n\nSözleşmenizi incelemek ve elektronik olarak imzalamak için:\n${input.url}\n\nSaygılarımızla,\n${input.organizationName}`,
  };
}
