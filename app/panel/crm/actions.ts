"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const defaultProbability: Record<string, number> = { lead: 10, qualified: 25, proposal: 50, lost: 0 };

function text(formData: FormData, key: string, max = 500) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

async function crmContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  return context;
}

async function getStageConfiguration(supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"], organizationId: string) {
  const { data, error } = await supabase.from("organization_crm_stages").select("code,probability").eq("organization_id", organizationId).eq("is_active", true);
  if (error) throw new Error("CRM aşamaları okunamadı: " + error.message);
  return new Map((data ?? []).map((item) => [String(item.code), Number(item.probability)]));
}

export async function createOpportunity(formData: FormData) {
  const { supabase, userId, membership } = await crmContext();
  const title = text(formData, "title", 180);
  const customerName = text(formData, "customer_name", 180);
  const selectedServiceType = text(formData, "service_type", 120);
  const customServiceType = text(formData, "other_service_type", 120);
  if (title.length < 2) throw new Error("Talep konusu en az 2 karakter olmalıdır.");
  if (customerName.length < 2) throw new Error("Müşteri veya kurum adı en az 2 karakter olmalıdır.");
  if (selectedServiceType === "Diğer" && customServiceType.length < 2) throw new Error("Diğer hizmet türünü yazmalısınız.");

  const stageMap = await getStageConfiguration(supabase, membership.organization_id);
  const details = {
    customer_type: text(formData, "customer_type", 40),
    university: text(formData, "university", 180),
    department: text(formData, "department", 180),
    academic_level: text(formData, "academic_level", 80),
    service_type: selectedServiceType === "Diğer" ? customServiceType : selectedServiceType,
    language: text(formData, "language", 80),
    scope: text(formData, "scope", 4000),
  };
  const { error } = await supabase.from("crm_opportunities").insert({
    organization_id: membership.organization_id,
    title,
    customer_name: customerName,
    contact_email: text(formData, "contact_email", 240) || null,
    contact_phone: text(formData, "contact_phone", 80) || null,
    source: text(formData, "source", 160) || null,
    notes: text(formData, "notes", 4000) || null,
    expected_close_date: text(formData, "expected_close_date", 20) || null,
    estimated_value: 0,
    probability: stageMap.get("lead") ?? defaultProbability.lead,
    stage: "lead",
    request_details: details,
    owner_user_id: userId,
    created_by: userId,
  });
  if (error) throw new Error("Talep oluşturulamadı: " + error.message);
  revalidatePath("/panel/crm"); revalidatePath("/panel");
}

export async function updateOpportunity(formData: FormData) {
  const { supabase, membership } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const currentDetails = JSON.parse(text(formData, "current_details", 10000) || "{}");
  const requestDetails = {
    ...currentDetails,
    service_type: text(formData, "service_type", 180),
    academic_level: text(formData, "academic_level", 80),
    university: text(formData, "university", 180),
    department: text(formData, "department", 180),
    language: text(formData, "language", 80),
    scope: text(formData, "scope", 4000),
  };
  const { data, error } = await supabase.from("crm_opportunities").update({
    title: text(formData, "title", 180), customer_name: text(formData, "customer_name", 180),
    contact_email: text(formData, "contact_email", 240) || null, contact_phone: text(formData, "contact_phone", 80) || null,
    source: text(formData, "source", 160) || null, notes: text(formData, "notes", 4000) || null,
    expected_close_date: text(formData, "expected_close_date", 20) || null, request_details: requestDetails, updated_at: new Date().toISOString(),
  }).eq("id", opportunityId).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error) throw new Error("Talep güncellenemedi: " + error.message);
  if (!data) throw new Error("Talep bulunamadı veya yetkiniz yok.");
  revalidatePath("/panel/crm");
}

export async function archiveOpportunity(formData: FormData) {
  const { supabase, membership } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const { data, error } = await supabase.from("crm_opportunities").update({
    stage: "lost", probability: 0, lost_reason: text(formData, "archive_reason", 500) || "Talep iptal edilerek arşivlendi.", updated_at: new Date().toISOString(),
  }).eq("id", opportunityId).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error) throw new Error("Talep arşivlenemedi: " + error.message);
  if (!data) throw new Error("Talep bulunamadı veya yetkiniz yok.");
  revalidatePath("/panel/crm"); revalidatePath("/panel/crm/proposals"); revalidatePath("/panel");
}

export async function moveOpportunity(formData: FormData) {
  const { supabase, membership } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const stage = text(formData, "stage", 80);
  if (!new Set(["lead", "qualified", "proposal", "lost"]).has(stage)) throw new Error("Geçersiz talep durumu.");
  const lostReason = text(formData, "lost_reason", 500);
  if (stage === "lost" && lostReason.length < 2) throw new Error("Arşiv nedeni girilmelidir.");
  const stageMap = await getStageConfiguration(supabase, membership.organization_id);
  const { data, error } = await supabase.from("crm_opportunities").update({
    stage, probability: stageMap.get(stage) ?? defaultProbability[stage] ?? 0,
    lost_reason: stage === "lost" ? lostReason : null, updated_at: new Date().toISOString(),
  }).eq("id", opportunityId).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error) throw new Error("Talep durumu güncellenemedi: " + error.message);
  if (!data) throw new Error("Talep bulunamadı veya bu kaydı güncelleme yetkiniz yok.");
  revalidatePath("/panel/crm"); revalidatePath("/panel");
}
