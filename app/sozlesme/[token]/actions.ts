"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const firstForwardedIp = (value: string | null) =>
  value?.split(",")[0]?.trim() || null;

const contractUrl = (token: string, params: Record<string, string>) => {
  const query = new URLSearchParams(params);
  return `/sozlesme/${encodeURIComponent(token)}?${query.toString()}`;
};

export async function signContract(token: string, formData: FormData) {
  const safeToken = String(token ?? "").trim().slice(0, 200);
  const signerName = String(formData.get("signer_name") ?? "")
    .trim()
    .slice(0, 180);
  const signatureData = String(formData.get("signature_data") ?? "").trim();
  const accepted = String(formData.get("accepted") ?? "") === "on";

  if (!safeToken) {
    redirect("/sozlesme/gecersiz?error=invalid_token");
  }

  if (signerName.length < 2 || !accepted) {
    redirect(contractUrl(safeToken, { error: "missing_consent" }));
  }

  if (
    !signatureData.startsWith("data:image/png;base64,") ||
    signatureData.length < 200 ||
    signatureData.length > 500000
  ) {
    redirect(contractUrl(safeToken, { error: "invalid_signature" }));
  }

  const requestHeaders = await headers();
  const signerIp =
    firstForwardedIp(requestHeaders.get("x-forwarded-for")) ||
    requestHeaders.get("x-real-ip") ||
    requestHeaders.get("cf-connecting-ip") ||
    null;
  const signerUserAgent =
    requestHeaders.get("user-agent")?.slice(0, 1000) || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_crm_contract_v2", {
    public_token: safeToken,
    signer_name: signerName,
    signature_data: signatureData,
    signer_ip: signerIp,
    signer_user_agent: signerUserAgent,
  });

  if (error) {
    console.error("sign_crm_contract_v2 failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });

    const errorCode = error.message.includes("invalid_token")
      ? "invalid_token"
      : error.message.includes("invalid_signer")
        ? "invalid_signer"
        : error.message.includes("invalid_signature")
          ? "invalid_signature"
          : "sign_failed";

    redirect(contractUrl(safeToken, { error: errorCode }));
  }

  const row = Array.isArray(data) ? data[0] : data;
  const resultStatus = String(row?.result_status ?? "").trim();

  if (!resultStatus) {
    console.error("sign_crm_contract_v2 returned no result status", { data });
    redirect(contractUrl(safeToken, { error: "empty_result" }));
  }

  redirect(
    contractUrl(safeToken, {
      signed: "1",
      status: resultStatus,
      workflow: String(row?.workflow_id ?? ""),
    }),
  );
}
