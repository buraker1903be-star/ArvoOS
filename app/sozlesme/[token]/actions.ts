"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

// Hatalar URL'de metin olarak değil kod olarak taşınır; sayfa kodu sabit bir
// mesaja çevirir. Eskiden "?error=..." içindeki her metin kurum logolu
// sözleşmenin içinde gösteriliyordu (ör. sahte IBAN talimatı).
const contractUrl = (token: string, params: Record<string, string>) => {
  const query = new URLSearchParams(params);
  return `/sozlesme/${encodeURIComponent(token)}?${query.toString()}`;
};

export async function signContract(token: string, formData: FormData) {
  const signerName = String(formData.get("signer_name") ?? "").trim().slice(0, 180);
  const signatureData = String(formData.get("signature_data") ?? "").trim();
  const accepted = String(formData.get("accepted") ?? "") === "on";

  if (signerName.length < 2 || !accepted) {
    redirect(contractUrl(token, { error: "missing" }));
  }

  if (!signatureData.startsWith("data:image/png;base64,") || signatureData.length < 200) {
    redirect(contractUrl(token, { error: "signature" }));
  }

  const supabase = await createClient();

  // İptal edilmiş, reddedilmiş veya zaten imzalanmış sözleşme imzalanamaz.
  // Eskiden müşteri eski linkten iptal edilmiş sözleşmeyi imzalayabiliyor,
  // bu da iş akışı ve ödeme planı oluşturuyordu.
  const { data: current } = await supabase.rpc("get_public_crm_contract", { public_token: token });
  const contract = Array.isArray(current) ? current[0] : current;
  if (!contract || contract.signed_at || !["draft", "sent"].includes(contract.status)) {
    redirect(contractUrl(token, { error: "closed" }));
  }

  const requestHeaders = await headers();
  const signerIp = firstForwardedIp(requestHeaders.get("x-forwarded-for"))
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("cf-connecting-ip")
    || null;
  const signerUserAgent = requestHeaders.get("user-agent")?.slice(0, 1000) || null;

  const { data, error } = await supabase.rpc("sign_crm_contract_v2", {
    public_token: token,
    signer_name: signerName,
    signature_data: signatureData,
    signer_ip: signerIp,
    signer_user_agent: signerUserAgent,
  });

  if (error) {
    console.error("sign_crm_contract_v2 failed", { code: error.code, message: error.message });
    redirect(contractUrl(token, { error: "failed" }));
  }

  const row = Array.isArray(data) ? data[0] : data;
  redirect(contractUrl(token, {
    signed: "1",
    workflow: String(row?.workflow_id ?? ""),
  }));
}
