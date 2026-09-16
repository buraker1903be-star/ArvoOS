"use server";

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openTrackingAccess, trackingAccessMessage } from "@/lib/tracking-access";
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
    /** Teklif/sözleşme rozetleri ve teklif onayı; null → gösterilmez. */
    documents: TrackingDocuments | null;
  } | null;
};

/** arvo_tracking_documents: teklifin etkin durumu ve müşteri kararı, sözleşme imza durumu. */
export type TrackingDocuments = {
  proposal: { no: string | null; status: string; customerDecided: boolean; canAccept: boolean; canReject: boolean } | null;
  contract: { no: string | null; status: string; signed: boolean } | null;
};

export type ProposalDecisionState = { error: string | null; success: string | null; documents: TrackingDocuments | null };

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

function readDocuments(value: unknown): TrackingDocuments | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { proposal?: Record<string, unknown> | null; contract?: Record<string, unknown> | null };
  const proposal = raw.proposal;
  const contract = raw.contract;
  return {
    proposal: proposal
      ? {
          no: typeof proposal.no === "string" ? proposal.no : null,
          status: String(proposal.status ?? ""),
          customerDecided: proposal.customer_decided === true,
          canAccept: proposal.can_accept === true,
          canReject: proposal.can_reject === true,
        }
      : null,
    contract: contract
      ? { no: typeof contract.no === "string" ? contract.no : null, status: String(contract.status ?? ""), signed: contract.signed === true }
      : null,
  };
}

// Takip RPC'leri artık yalnızca service_role ile çağrılabiliyor (bkz.
// lib/tracking-access.ts). İstemci, sınır kapısından geçen çağrı yerinden
// aşağı aktarılır; her yardımcı kendi istemcisini kurmaz, yoksa tek bir
// müşteri işlemi sınır sayacını birden çok kez tüketirdi.
async function fetchDocuments(supabase: SupabaseClient, code: string): Promise<TrackingDocuments | null> {
  const { data, error } = await supabase.rpc("arvo_tracking_documents", { p_tracking_code: code });
  if (error) {
    console.error("[takip] belge durumu okunamadı", { code: error.code, message: error.message });
    return null;
  }
  return readDocuments(data);
}

const firstForwardedIp = (value: string | null) => value?.split(",")[0]?.trim() || null;

/**
 * Müşteri teklifi takip ekranından onaylar ya da (sözleşme imzalanmadıysa)
 * reddeder. Karar tarih-saat, IP ve cihaz bilgisiyle kaydedilir.
 */
export async function respondToProposalFromTracking(
  previous: ProposalDecisionState,
  formData: FormData,
): Promise<ProposalDecisionState> {
  const code = String(formData.get("tracking_code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const decision = String(formData.get("decision") ?? "");
  if (code.length < 6 || !["accept", "reject"].includes(decision)) {
    return { ...previous, error: "İşlem tamamlanamadı, lütfen tekrar deneyin.", success: null };
  }
  // Teklifi REDDETME yetkisi de bu kodla geliyor; sınır kapısı burada da şart.
  const access = await openTrackingAccess(code);
  if (!access.ok) return { ...previous, error: trackingAccessMessage(access.reason), success: null };
  const { supabase } = access;

  const before = await fetchDocuments(supabase, code);
  const requestHeaders = await headers();
  const ip = firstForwardedIp(requestHeaders.get("x-forwarded-for")) || requestHeaders.get("x-real-ip") || requestHeaders.get("cf-connecting-ip") || null;
  const userAgent = requestHeaders.get("user-agent")?.slice(0, 1000) || null;

  const { data, error } = await supabase.rpc("arvo_tracking_confirm_proposal", {
    p_tracking_code: code,
    p_decision: decision,
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (error) {
    console.error("[takip] teklif kararı kaydedilemedi", { code: error.code, message: error.message });
    return { ...previous, error: "Kararınız kaydedilemedi, lütfen tekrar deneyin.", success: null };
  }
  const result = (Array.isArray(data) ? data[0] : data) as { result_status?: string; contract_status?: string | null } | null;
  const outcome = result?.result_status ?? "";

  // Ret sonrası sözleşme iptal olduğu için takip sorgusu artık onu bulmaz;
  // ekrandaki rozetler önceki durumdan güncellenir.
  let documents = await fetchDocuments(supabase, code);
  if (!documents && before) {
    documents = {
      proposal: before.proposal ? { ...before.proposal, status: outcome === "rejected" ? "rejected" : before.proposal.status, customerDecided: true, canAccept: false, canReject: false } : null,
      contract: before.contract ? { ...before.contract, status: result?.contract_status ?? before.contract.status } : null,
    };
  }

  if (outcome === "accepted") {
    return {
      error: null,
      documents,
      success: documents?.contract && !documents.contract.signed
        ? "Teklifi kabul ettiniz. Sıradaki adım: sözleşmenizi inceleyip imzalamak."
        : "Teklif onayınız kaydedildi. Teşekkür ederiz.",
    };
  }
  if (outcome === "rejected") {
    return { error: null, documents, success: "Teklifi reddettiniz; ekibimiz bilgilendirildi. Sorunuz varsa mesaj alanından yazabilirsiniz." };
  }
  if (outcome === "contract_signed") return { error: "Sözleşmeniz imzalandığı için teklif reddedilemez.", success: null, documents };
  return { error: "Bu teklif artık karara açık değil.", success: null, documents };
}

async function listMessages(supabase: SupabaseClient, code: string) {
  const { data, error } = await supabase.rpc("list_customer_file_messages", {
    p_tracking_code: code,
  });
  if (error) throw error;
  return (data ?? []) as CustomerFileMessage[];
}

export async function refreshCustomerFileMessages(code: string): Promise<CustomerFileMessage[]> {
  const normalizedCode = String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalizedCode.length < 6) return [];
  const access = await openTrackingAccess(normalizedCode);
  if (!access.ok) return [];
  try {
    return await listMessages(access.supabase, normalizedCode);
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

  const access = await openTrackingAccess(code);
  if (!access.ok) return { error: trackingAccessMessage(access.reason), result: null };
  const { supabase } = access;

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
  // Okunamazsa "Belgeleriniz" bölümü sessizce kaybolmasın; komşu çağrılar
  // (iş planı, belgeler) hatayı zaten günlüğe yazıyor.
  const { data: linkRows, error: linkError } = await supabase.rpc("arvo_tracking_document_links", {
    p_tracking_code: code,
  });
  if (linkError) console.error("[takip] belge bağlantıları okunamadı", { code: linkError.code, message: linkError.message });
  const documentLinks = (Array.isArray(linkRows) ? linkRows[0] : linkRows) ?? null;

  // İş planı ve ödeme takvimi; okunamazsa bölüm gösterilmez.
  const { data: planData, error: planError } = await supabase.rpc("arvo_tracking_work_plan", {
    p_tracking_code: code,
  });
  if (planError) console.error("[takip] iş planı okunamadı", { code: planError.code, message: planError.message });
  const workPlan = planError ? null : readWorkPlan(planData);
  const documents = await fetchDocuments(supabase, code);

  let messages: CustomerFileMessage[] = [];
  try {
    messages = await listMessages(supabase, code);
  } catch {
    messages = [];
  }

  let files: CustomerPortalFile[] | null = null;
  try {
    files = await fetchCustomerPortalFiles(supabase, code);
  } catch (error) {
    console.error("[takip] müşteri portalı dosyaları okunamadı", error);
    files = null;
  }

  return { error: null, result: { ...row, tracking_code: code, messages, files, documentLinks, workPlan, documents } };
}

/** Sekmeye dönüldüğünde (ör. PAYTR ödemesinden sonra) dosya kilitlerini tazeler. */
export async function refreshCustomerPortalFiles(code: string): Promise<CustomerPortalFile[] | null> {
  const normalizedCode = String(code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (normalizedCode.length < 6) return null;
  const access = await openTrackingAccess(normalizedCode);
  if (!access.ok) return null;
  try {
    return await fetchCustomerPortalFiles(access.supabase, normalizedCode);
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
  const access = await openTrackingAccess(code);
  if (!access.ok) return { error: trackingAccessMessage(access.reason), success: null, messages: null };
  const { supabase } = access;

  const { error } = await supabase.rpc("send_customer_file_message", {
    p_tracking_code: code,
    p_body: body,
  });
  if (error) {
    return { error: error.message.includes("kısa bir süre") ? "Yeni bir mesaj göndermeden önce kısa bir süre bekleyin." : "Mesaj gönderilemedi, lütfen tekrar deneyin.", success: null, messages: null };
  }
  try {
    const messages = await listMessages(supabase, code);
    return { error: null, success: "Mesajınız operasyon ekibine iletildi.", messages };
  } catch {
    return { error: null, success: "Mesajınız operasyon ekibine iletildi.", messages: null };
  }
}
