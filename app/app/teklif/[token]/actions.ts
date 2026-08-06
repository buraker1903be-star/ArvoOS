"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function respondToProposal(token: string, formData: FormData) {
  const decision = String(formData.get("decision") ?? "");
  if (!['accept','reject'].includes(decision)) throw new Error("Geçersiz teklif kararı.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_crm_proposal", { public_token: token, decision });
  if (error) throw new Error("Teklif kararı kaydedilemedi.");
  const row = Array.isArray(data) ? data[0] : data;
  if (row?.result_status === "accepted" && row?.contract_token) redirect(`/sozlesme/${encodeURIComponent(row.contract_token)}?created=1`);
  redirect(`/teklif/${encodeURIComponent(token)}?result=${encodeURIComponent(row?.result_status ?? decision)}`);
}
