"use server";

import { createClient } from "@/lib/supabase/server";

export type TakipState = {
  error: string | null;
  result: {
    contract_no: string;
    contract_title: string;
    contract_status: string;
    workflow_status: string | null;
    last_update: string;
    total_amount: number;
    paid_amount: number;
    remaining_amount: number;
    progress_percentage: number;
    organization_name: string;
    organization_logo_url: string | null;
    organization_primary_color: string | null;
  } | null;
};

export async function lookupTracking(
  _previousState: TakipState,
  formData: FormData,
): Promise<TakipState> {
  const code = String(formData.get("tracking_code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 6) {
    return { error: "Lütfen size gönderilen takip kodunu eksiksiz girin.", result: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_contract_by_tracking_code_global", {
    p_tracking_code: code,
  });

  if (error) {
    return { error: "Sorgulama yapılamadı, lütfen tekrar deneyin.", result: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { error: "Girdiğiniz takip koduyla eşleşen bir sözleşme bulunamadı.", result: null };
  }

  return { error: null, result: row };
}
