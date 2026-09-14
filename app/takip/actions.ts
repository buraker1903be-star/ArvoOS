"use server";

import { createClient } from "@/lib/supabase/server";
import { fetchCustomerPortalFiles, type CustomerPortalFile } from "./portal-files-data";
import { normalizeWorkPlan } from "@/lib/work-plan";
import { installmentLabel } from "@/lib/payment-schedule";

// DİKKAT: "use server" dosyasında `export type { X }` (yeniden dışa aktarma)
// YAZMAYIN. Next derleyicisi bunu sunucu işlemi sanıp çalışma anında var
// olmayan X'e başvuruyor; modül yüklenirken çöküyor ve buradaki TÜM işlemler
// 500 veriyordu (takip kodu hiçbir kodla açılmıyordu). Tipi doğrudan
// ./portal-files-data'dan içe aktarın. `export type X = {...}` tanımları sorunsuz.

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
    /** Müşteri portalı dosyaları; null → bölüm gösterilmez (okunamadı). */
    files: CustomerPortalFile[] | null;
    /** Müşterinin erişebileceği belge bağlantıları (teklif + sözleşme). */
    documentLinks: {
      proposal_share_token: string | null;
      proposal_no: string | null;
      proposal_status: string | null;
      contract_share_token: string | null;
      contract_no: string | null;
      contract_status: string | null;
    } | null;
    /** null → bölüm gösterilmez (okunamadı ya da migration yok). */
    workPlan: TrackingWorkPlan | null;
  } | null;
};

export type TrackingPayment = {
  sequence: number;
  label: string;
  amount: number;
  due_date: string | null;
  trigger: string | null;
  status: string | null;
};

/** İş planı (ara teslimler) ve ödeme takvimi — arvo_tracking_work_plan. */
export type TrackingWorkPlan = {
  items: { sequence: number; title: string; due_date: string }[];
  source: "contract" | "addendum";
  payments: TrackingPayment[];
  pendingAddendum: boolean;
};

export type CustomerMessageState = {
  error: string | null;
  success: string | null;
  messages: CustomerFileMessage[] | null;
};

function readWorkPlan(value: unknown): TrackingWorkPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { work_plan?: unknown; source?: unknown; payments?: unknown; pending_addendum?: unknown };
  const rows = (Array.isArray(raw.payments) ? raw.payments : []).map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const sequence = Number(row.sequence) || index + 1;
    return {
      sequence,
      label: installmentLabel(row.label, sequence),
      amount: Number(row.amount) || 0,
      due_date: typeof row.due_date === "string" && row.due_date ? row.due_date : null,
      trigger: typeof row.trigger === "string" && row.trigger ? row.trigger : null,
      status: typeof row.status === "string" && row.status ? row.status : null,
    };
  });
  // Tek satırlık (peşin ya da eski biçimli) plan takvim bilgisi taşımaz ve
  // kısmi ödemelerde "Ödeme özeti" ile çelişir (tek taksit ödenmemiş görünür);
  // ödeme takvimi yalnızca gerçek taksitli planda gösterilir.
  const payments = rows.length >= 2 ? rows : [];
  return {
    items: normalizeWorkPlan(raw.work_plan),
    source: raw.source === "addendum" ? "addendum" : "contract",
    payments,
    pendingAddendum: raw.pending_addendum === true,
  };
}

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

  // Müşteri, onayladığı teklife ve sözleşmeye buradan da ulaşabilmeli.
  const { data: linkRows } = await supabase.rpc("arvo_tracking_document_links", {
    p_tracking_code: code,
  });
  const documentLinks = (Array.isArray(linkRows) ? linkRows[0] : linkRows) ?? null;

  // İş planı ve ödeme takvimi; okunamazsa bölüm gösterilmez.
  const { data: planData, error: planError } = await supabase.rpc("arvo_tracking_work_plan", {
    p_tracking_code: code,
  });
  if (planError) console.error("[takip] iş planı okunamadı", { code: planError.code, message: planError.message });
  const workPlan = planError ? null : readWorkPlan(planData);

  let messages: CustomerFileMessage[] = [];
  try {
    messages = await listMessages(code);
  } catch {
    messages = [];
  }

  let files: CustomerPortalFile[] | null = null;
  try {
    files = await fetchCustomerPortalFiles(code);
  } catch (error) {
    console.error("[takip] müşteri portalı dosyaları okunamadı", error);
    files = null;
  }

  return { error: null, result: { ...row, tracking_code: code, messages, files, documentLinks, workPlan } };
}

/** Sekmeye dönüldüğünde (ör. PAYTR ödemesinden sonra) dosya kilitlerini tazeler. */
export async function refreshCustomerPortalFiles(code: string): Promise<CustomerPortalFile[] | null> {
  try {
    return await fetchCustomerPortalFiles(code);
  } catch {
    return null;
  }
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
