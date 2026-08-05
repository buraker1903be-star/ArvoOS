"use server";

import { createClient } from "@/lib/supabase/server";

export type LookupState = {
  error: string | null;
  results: {
    contract_no: string;
    contract_title: string;
    contract_status: string;
    workflow_status: string | null;
    last_update: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    progress_percentage: number;
  }[] | null;
};

export async function lookupStatus(
  orgSlug: string,
  _previousState: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const suffix = String(formData.get("phone_suffix") ?? "").replace(/[^0-9]/g, "");
  if (suffix.length !== 4) {
    return { error: "Lütfen telefon numaranızın son 4 hanesini girin.", results: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_contracts_by_phone_suffix", {
    p_org_slug: orgSlug,
    p_phone_suffix: suffix,
  });

  if (error) {
    return { error: "Sorgulama yapılamadı, lütfen tekrar deneyin.", results: null };
  }

  if (!data || data.length === 0) {
    return { error: "Girdiğiniz bilgilerle eşleşen bir sözleşme bulunamadı.", results: null };
  }

  return { error: null, results: data };
}
