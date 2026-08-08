import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ContractDocument } from "@/app/_components/contract-document";
import { ContractSignatureForm } from "./signature-form";

const errorMessages: Record<string, string> = {
  invalid_token: "Sözleşme bağlantısı geçersiz veya artık kullanılamıyor.",
  missing_consent: "İmzalama için ad soyad ve açık onay gereklidir.",
  invalid_signer: "Lütfen geçerli bir ad ve soyad girin.",
  invalid_signature: "Lütfen imza alanına imzanızı çizip tekrar deneyin.",
  sign_failed: "Sözleşme şu anda imzalanamadı. Lütfen tekrar deneyin.",
  empty_result: "İşlem tamamlandı ancak sonuç doğrulanamadı.",
};

const statusMessages: Record<string, string> = {
  signed: "Sözleşme imzalandı ve iş akışı oluşturuldu.",
  workflow_exists: "Sözleşme daha önce imzalanmış ve iş akışı oluşturulmuş.",
};

export default async function PublicContractPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{
    signed?: string;
    workflow?: string;
    created?: string;
    error?: string;
    status?: string;
  }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_crm_contract", {
    public_token: token,
  });
  const row = Array.isArray(data) ? data[0] : data;

  if (error || !row) notFound();

  await supabase.rpc("mark_crm_contract_viewed", { public_token: token });

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "arvo-os.com";
  const protocol = h.get("x-forwarded-proto") || "https";
  const verificationUrl = `${protocol}://${host}/sozlesme/${token}`;

  const notice = query.created
    ? "Teklif kabul edildi. Sözleşme imzaya hazırlandı."
    : query.signed
      ? statusMessages[query.status ?? "signed"] ??
        "Sözleşme imzalama işlemi tamamlandı."
      : null;

  const errorMessage = query.error
    ? errorMessages[query.error] ?? "İşlem tamamlanamadı. Lütfen tekrar deneyin."
    : null;

  const signatureForm = row.status === "signed"
    ? null
    : <ContractSignatureForm token={token} />;

  return (
    <ContractDocument
      row={row}
      verificationUrl={verificationUrl}
      notice={notice}
      errorMessage={errorMessage}
      signatureForm={signatureForm}
    />
  );
}
