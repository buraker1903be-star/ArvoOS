"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function respondToProposal(token: string, formData: FormData) {
  const safeToken = String(token ?? "").trim();
  const decision = String(formData.get("decision") ?? "");

  if (!safeToken) {
    redirect("/teklif/gecersiz?result=invalid_token");
  }

  if (!['accept', 'reject'].includes(decision)) {
    redirect(`/teklif/${encodeURIComponent(safeToken)}?result=invalid_decision`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_to_crm_proposal", {
    public_token: safeToken,
    decision,
  });

  if (error) {
    console.error("respond_to_crm_proposal failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      decision,
    });
    redirect(`/teklif/${encodeURIComponent(safeToken)}?result=save_failed`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const resultStatus = String(row?.result_status ?? "").trim();

  if (resultStatus === "accepted" && row?.contract_token) {
    redirect(
      `/sozlesme/${encodeURIComponent(String(row.contract_token))}?created=1`,
    );
  }

  if (!resultStatus) {
    console.error("respond_to_crm_proposal returned no result status", {
      decision,
      data,
    });
    redirect(`/teklif/${encodeURIComponent(safeToken)}?result=empty_result`);
  }

  redirect(
    `/teklif/${encodeURIComponent(safeToken)}?result=${encodeURIComponent(resultStatus)}`,
  );
}
