"use server";

import { createClient } from "@/lib/supabase/server";

export type CustomerFileMessage = {
  sender_type: "customer" | "staff";
  sender_name: string;
  body: string;
  created_at: string;
};

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
    tracking_code: string;
    messages: CustomerFileMessage[];
  } | null;
};

export type CustomerMessageState = {
  error: string | null;
  success: string | null;
  messages: CustomerFileMessage[] | null;
};

async function listMessages(code: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_customer_file_messages", {
    p_tracking_code: code,
  });
  if (error) throw error;
  return (data ?? []) as CustomerFileMessage[];
}

export async function refreshCustomerFileMessages(code: string): Promise<CustomerFileMessage[]> {
  const normalizedCode = String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalizedCode.length < 6) return [];
  try {
    return await listMessages(normalizedCode);
  } catch {
    return [];
  }
}

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

  let messages: CustomerFileMessage[] = [];
  try {
    messages = await listMessages(code);
  } catch {
    messages = [];
  }

  return { error: null, result: { ...row, tracking_code: code, messages } };
}

export async function sendCustomerFileMessage(
  _previousState: CustomerMessageState,
  formData: FormData,
): Promise<CustomerMessageState> {
  const code = String(formData.get("tracking_code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = String(formData.get("body") ?? "").trim();
  if (code.length < 6 || body.length < 2 || body.length > 2000) {
    return { error: "Mesajınızı 2–2000 karakter arasında yazın.", success: null, messages: null };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_customer_file_message", {
    p_tracking_code: code,
    p_body: body,
  });
  if (error) {
    return { error: error.message.includes("kısa bir süre") ? "Yeni bir mesaj göndermeden önce kısa bir süre bekleyin." : "Mesaj gönderilemedi, lütfen tekrar deneyin.", success: null, messages: null };
  }
  try {
    const messages = await listMessages(code);
    return { error: null, success: "Mesajınız operasyon ekibine iletildi.", messages };
  } catch {
    return { error: null, success: "Mesajınız operasyon ekibine iletildi.", messages: null };
  }
}
