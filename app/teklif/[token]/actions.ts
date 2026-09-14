"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

export async function respondToProposal(token: string, formData: FormData) {
  const decision = String(formData.get("decision") ?? "");
  if (!['accept','reject'].includes(decision)) throw new Error("Geçersiz teklif kararı.");
  const requestHeaders = await headers();
  const responderIp = firstForwardedIp(requestHeaders.get("x-forwarded-for"))
    || requestHeaders.get("x-real-ip")
    || requestHeaders.get("cf-connecting-ip")
    || null;
  const responderUserAgent = requestHeaders.get("user-agent")?.slice(0, 1000) || null;
  const supabase = await createClient();

  // Personel teklifi müşteri adına sözleşmeye çevirdiyse teklif zaten
  // "kabul edildi"; müşterinin kararı ayrı olarak (onay ya da sözleşme
  // imzalanmadıysa ret) kaydedilir.
  const { data: stateRows } = await supabase.rpc("arvo_public_proposal_decision", { public_token: token });
  const state = (Array.isArray(stateRows) ? stateRows[0] : stateRows) as { status?: string; customer_decided?: boolean | null } | null;
  if (state?.status === "accepted" && state.customer_decided === false) {
    const { data, error } = await supabase.rpc("arvo_confirm_proposal_decision", {
      public_token: token,
      p_decision: decision,
      p_ip: responderIp,
      p_user_agent: responderUserAgent,
    });
    if (error) {
      console.error("arvo_confirm_proposal_decision failed", { code: error.code, message: error.message });
      throw new Error("Teklif kararı kaydedilemedi.");
    }
    const confirmed = (Array.isArray(data) ? data[0] : data) as { result_status?: string; contract_token?: string | null; contract_status?: string | null } | null;
    const outcome = confirmed?.result_status ?? "closed";
    // Onaydan sonra imzalanmamış sözleşme varsa müşteri doğrudan imzaya gider.
    if (outcome === "accepted" && confirmed?.contract_token && ["draft", "sent"].includes(confirmed.contract_status ?? "")) {
      redirect(`/sozlesme/${encodeURIComponent(confirmed.contract_token)}?created=1`);
    }
    const notice = outcome === "contract_signed" ? "locked" : outcome === "accepted" || outcome === "rejected" ? outcome : "closed";
    redirect(`/teklif/${encodeURIComponent(token)}?result=${notice}`);
  }

  const { data, error } = await supabase.rpc("respond_to_crm_proposal", { public_token: token, decision, p_ip: responderIp });
  if (error) throw new Error("Teklif kararı kaydedilemedi.");
  const row = Array.isArray(data) ? data[0] : data;
  // Karar tarihi ve IP'nin yanına cihaz/tarayıcı bilgisi de yazılır
  // (belgedeki "Karar ve doğrulama" alanı). Kayıt başarısız olsa bile
  // karar geçerlidir; yalnızca loglanır.
  if (row?.result_status === "accepted" || row?.result_status === "rejected") {
    const { error: agentError } = await supabase.rpc("arvo_record_proposal_response_agent", { public_token: token, p_user_agent: responderUserAgent });
    if (agentError) console.error("arvo_record_proposal_response_agent failed", { code: agentError.code, message: agentError.message });
  }
  if (row?.result_status === "accepted" && row?.contract_token) redirect(`/sozlesme/${encodeURIComponent(row.contract_token)}?created=1`);
  redirect(`/teklif/${encodeURIComponent(token)}?result=${encodeURIComponent(row?.result_status ?? decision)}`);
}
