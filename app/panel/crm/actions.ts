"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const stages = new Set(["lead","qualified","proposal","contract","payment","won","lost"]);
const stageProbability: Record<string, number> = { lead: 10, qualified: 25, proposal: 50, contract: 70, payment: 90, won: 100, lost: 0 };

async function crmContext() {
  const context = await getPanelContext();
  if (!context.modules.some((module) => module.code === "crm")) throw new Error("CRM modülüne erişiminiz yok.");
  return context;
}

export async function createOpportunity(formData: FormData) {
  const { supabase, userId, membership } = await crmContext();
  const title = String(formData.get("title") ?? "").trim();
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const contactEmail = String(formData.get("contact_email") ?? "").trim();
  const contactPhone = String(formData.get("contact_phone") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const expectedCloseDate = String(formData.get("expected_close_date") ?? "") || null;
  const estimatedValue = Math.round(Number(formData.get("estimated_value") ?? 0) * 100);

  if (title.length < 2 || title.length > 180) throw new Error("Fırsat başlığı 2–180 karakter olmalı.");
  if (customerName.length < 2 || customerName.length > 180) throw new Error("Müşteri adı 2–180 karakter olmalı.");
  if (!Number.isFinite(estimatedValue) || estimatedValue < 0) throw new Error("Geçersiz fırsat tutarı.");

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
    probability: stageProbability.lead,
    owner_user_id: userId,
    created_by: userId,
  });
  if (error) throw new Error("Fırsat oluşturulamadı: " + error.message);
  revalidatePath("/panel/crm");
  revalidatePath("/panel");
}

export async function moveOpportunity(formData: FormData) {
  const { supabase, membership } = await crmContext();
  const opportunityId = String(formData.get("opportunity_id") ?? "");
  const stage = String(formData.get("stage") ?? "");
  const lostReason = String(formData.get("lost_reason") ?? "").trim();
  if (!stages.has(stage)) throw new Error("Geçersiz satış aşaması.");
  if (stage === "lost" && lostReason.length < 2) throw new Error("Kayıp nedeni girilmelidir.");

  const { error } = await supabase.from("crm_opportunities").update({
    stage,
    probability: stageProbability[stage],
    lost_reason: stage === "lost" ? lostReason : null,
    updated_at: new Date().toISOString(),
  }).eq("id", opportunityId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Fırsat aşaması güncellenemedi: " + error.message);
  revalidatePath("/panel/crm");
  revalidatePath("/panel");
}
