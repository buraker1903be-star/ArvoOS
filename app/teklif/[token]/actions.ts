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
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_crm_proposal", { public_token: token, decision, p_ip: responderIp });
  if (error) throw new Error("Teklif kararı kaydedilemedi.");
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.result_status === "accepted" && row?.contract_token) redirect(`/sozlesme/${encodeURIComponent(row.contract_token)}?created=1`);
  redirect(`/teklif/${encodeURIComponent(token)}?result=${encodeURIComponent(row?.result_status ?? decision)}`);
}
