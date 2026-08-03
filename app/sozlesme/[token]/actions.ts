"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

const contractUrl = (token: string, params: Record<string, string>) => {
  const query = new URLSearchParams(params);
  return `/sozlesme/${encodeURIComponent(token)}?${query.toString()}`;
};

export async function signContract(token: string, formData: FormData) {
  const signerName = String(formData.get("signer_name") ?? "").trim().slice(0, 180);
  const signatureData = String(formData.get("signature_data") ?? "").trim();
  const accepted = String(formData.get("accepted") ?? "") === "on";

  if (signerName.length < 2 || !accepted) {
    redirect(contractUrl(token, { error: "Ad soyad ve açık onay gereklidir." }));
  }

  if (!signatureData.startsWith("data:image/png;base64,") || signatureData.length < 200) {
    redirect(contractUrl(token, { error: "Lütfen mavi imza alanına imzanızı çiziniz." }));
  }

  const requestHeaders = await headers();
  const signerIp = firstForwardedIp(requestHeaders.get("x-forwarded-for"))
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("cf-connecting-ip")
    || null;
  const signerUserAgent = requestHeaders.get("user-agent")?.slice(0, 1000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_crm_contract_v2", {
    public_token: token,
    signer_name: signerName,
    signature_data: signatureData,
    signer_ip: signerIp,
    signer_user_agent: signerUserAgent,
  });

  if (error) {
    redirect(contractUrl(token, { error: `Sözleşme imzalanamadı: ${error.message}`.slice(0, 300) }));
  }

  const row = Array.isArray(data) ? data[0] : data;
  redirect(contractUrl(token, {
    signed: "1",
    workflow: String(row?.workflow_id ?? ""),
  }));
}
