"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const defaultStages = new Set(["lead","qualified","proposal","contract","payment","won","lost"]);
const defaultProbability: Record<string, number> = { lead: 10, qualified: 25, proposal: 50, contract: 70, payment: 90, won: 100, lost: 0 };

function text(formData: FormData, key: string, max = 500) {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

async function crmContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  return context;
}

async function getStageConfiguration(supabase: Awaited<ReturnType<typeof getPanelContext>>["supabase"], organizationId: string) {
  const { data, error } = await supabase.from("organization_crm_stages")
    .select("code,probability")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  if (error) throw new Error("CRM aşamaları okunamadı: " + error.message);
  return new Map((data ?? []).map((item) => [String(item.code), Number(item.probability)]));
}

export async function createOpportunity(formData: FormData) {
  const { supabase, userId, membership } = await crmContext();
  const title = text(formData, "title", 180);
  const customerName = text(formData, "customer_name", 180);
  const contactEmail = text(formData, "contact_email", 240);
  const contactPhone = text(formData, "contact_phone", 80);
  const source = text(formData, "source", 160);
  const notes = text(formData, "notes", 4000);
  const expectedCloseDate = text(formData, "expected_close_date", 20) || null;
  const estimatedValue = Math.round(Number(formData.get("estimated_value") ?? 0) * 100);
  const selectedServiceType = text(formData, "service_type", 120);
  const customServiceType = text(formData, "other_service_type", 120);
  const serviceType = selectedServiceType === "Diğer" ? customServiceType : selectedServiceType;

  if (title.length < 2 || title.length > 180) throw new Error("Talep konusu 2–180 karakter olmalıdır.");
  if (customerName.length < 2 || customerName.length > 180) throw new Error("Müşteri veya kurum adı 2–180 karakter olmalıdır.");
  if (selectedServiceType === "Diğer" && customServiceType.length < 2) throw new Error("Diğer hizmet türünü yazmalısınız.");
  if (!Number.isFinite(estimatedValue) || estimatedValue < 0) throw new Error("Geçersiz talep tutarı.");

  const details = {
    customer_type: text(formData, "customer_type", 40),
    university: text(formData, "university", 180),
    faculty: text(formData, "faculty", 180),
    department: text(formData, "department", 180),
    program: text(formData, "program", 180),
    academic_level: text(formData, "academic_level", 80),
    advisor: text(formData, "advisor", 180),
    service_type: serviceType,
    language: text(formData, "language", 80),
    page_or_sample_info: text(formData, "page_or_sample_info", 300),
    analysis_software: text(formData, "analysis_software", 180),
    plagiarism_target: text(formData, "plagiarism_target", 80),
    ai_preference: text(formData, "ai_preference", 180),
    scope: text(formData, "scope", 4000),
  };

  const stageMap = await getStageConfiguration(supabase, membership.organization_id);
  const leadProbability = stageMap.get("lead") ?? defaultProbability.lead;

  const { error } = await supabase.from("crm_opportunities").insert({
    organization_id: membership.organization_id,
    title,
    customer_name: customerName,
    contact_email: contactEmail || null,
    contact_phone: contactPhone || null,
    source: source || null,
    notes: notes || null,
    expected_close_date: expectedCloseDate,
    estimated_value: estimatedValue,
    probability: leadProbability,
    request_details: details,
    owner_user_id: userId,
    created_by: userId,
  });
  if (error) throw new Error("Talep oluşturulamadı: " + error.message);
  revalidatePath("/panel/crm");
  revalidatePath("/panel");
}

export async function moveOpportunity(formData: FormData) {
  const { supabase, membership } = await crmContext();
  const opportunityId = text(formData, "opportunity_id", 80);
  const stage = text(formData, "stage", 80);
  const lostReason = text(formData, "lost_reason", 500);
  if (!opportunityId) throw new Error("Güncellenecek talep bulunamadı.");

  const stageMap = await getStageConfiguration(supabase, membership.organization_id);
  const validStage = stageMap.size ? stageMap.has(stage) : defaultStages.has(stage);
  if (!validStage) throw new Error("Geçersiz talep aşaması.");
  if (stage === "lost" && lostReason.length < 2) throw new Error("Kayıp nedeni girilmelidir.");

  const probability = stageMap.get(stage) ?? defaultProbability[stage] ?? 0;
  const { data, error } = await supabase.from("crm_opportunities").update({
    stage,
    probability,
    lost_reason: stage === "lost" ? lostReason : null,
    updated_at: new Date().toISOString(),
  }).eq("id", opportunityId).eq("organization_id", membership.organization_id).select("id").maybeSingle();
  if (error) throw new Error("Talep aşaması güncellenemedi: " + error.message);
  if (!data) throw new Error("Talep bulunamadı veya bu kaydı güncelleme yetkiniz yok.");
  revalidatePath("/panel/crm");
  revalidatePath("/panel");
}
