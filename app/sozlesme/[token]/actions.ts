"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

export async function signContract(token: string, formData: FormData) {
  const signerName = String(formData.get("signer_name") ?? "").trim().slice(0, 180);
  const accepted = String(formData.get("accepted") ?? "") === "on";
  if (signerName.length < 2 || !accepted) {
    throw new Error("Sözleşmeyi onaylamak için ad soyad ve açık onay gereklidir.");
  }

  const requestHeaders = await headers();
  const signerIp = firstForwardedIp(requestHeaders.get("x-forwarded-for"))
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("cf-connecting-ip")
    || null;
  const signerUserAgent = requestHeaders.get("user-agent")?.slice(0, 1000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_crm_contract", {
    public_token: token,
    signer_name: signerName,
    signer_ip: signerIp,
    signer_user_agent: signerUserAgent,
  });

  if (error) {
    throw new Error(`Sözleşme onaylanamadı: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  redirect(`/sozlesme/${encodeURIComponent(token)}?signed=1&workflow=${encodeURIComponent(row?.workflow_id ?? "")}`);
}
