"use server";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";

const licenseStatuses = new Set(["trialing", "active", "past_due", "suspended", "canceled"]);
const planCodes = new Set(["starter", "professional", "enterprise"]);

function readPositiveInteger(formData: FormData, key: string) {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} pozitif bir tam sayı olmalı.`);
  return value;
}

function readNonNegativeInteger(formData: FormData, key: string) {
  const value = Number.parseInt(String(formData.get(key) ?? ""), 10);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${key} sıfır veya pozitif olmalı.`);
  return value;
}

export async function updateOrganizationLicense(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const planCode = String(formData.get("plan_code") ?? "").trim();
  const licenseStatus = String(formData.get("license_status") ?? "").trim();
  const userLimit = readPositiveInteger(formData, "user_limit");
  const storageLimitMb = readPositiveInteger(formData, "storage_limit_mb");
  const aiCreditLimit = readNonNegativeInteger(formData, "ai_credit_limit");
  const trialEndsAt = String(formData.get("trial_ends_at") ?? "").trim();
  const currentPeriodEnd = String(formData.get("current_period_end") ?? "").trim();
  const suspensionReason = String(formData.get("suspension_reason") ?? "").trim();

  if (!organizationId) throw new Error("Kurum seçilmedi.");
  if (!planCodes.has(planCode)) throw new Error("Geçerli bir paket seçin.");
  if (!licenseStatuses.has(licenseStatus)) throw new Error("Geçerli bir lisans durumu seçin.");

  const { data: userData } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const payload = {
    organization_id: organizationId,
    plan_code: planCode,
    license_status: licenseStatus,
    trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
    current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd).toISOString() : null,
    user_limit: userLimit,
    storage_limit_mb: storageLimitMb,
    ai_credit_limit: aiCreditLimit,
    suspended_at: licenseStatus === "suspended" ? now : null,
    suspension_reason: licenseStatus === "suspended" ? suspensionReason || "Kurucu tarafından askıya alındı" : null,
    updated_by: userData.user?.id ?? null,
    updated_at: now,
  };

  const { error: licenseError } = await supabase.from("organization_licenses").upsert(payload, { onConflict: "organization_id" });
  if (licenseError) throw new Error(`Lisans kaydedilemedi: ${licenseError.message}`);

  const organizationStatus = licenseStatus === "suspended" || licenseStatus === "canceled" ? "suspended" : "active";
  const { error: organizationError } = await supabase.from("organizations").update({
    plan_code: planCode,
    status: organizationStatus,
    provisioning_state: licenseStatus === "suspended" ? "suspended" : undefined,
    updated_at: now,
  }).eq("id", organizationId);
  if (organizationError) throw new Error(`Kurum durumu güncellenemedi: ${organizationError.message}`);

  revalidatePath("/panel", "layout");
  revalidatePath(`/panel/platform/licenses?organization=${organizationId}`);
}

export async function resetOrganizationAiCredits(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) throw new Error("Kurum seçilmedi.");
  const { error } = await supabase.from("organization_licenses").update({ ai_credits_used: 0, updated_at: new Date().toISOString() }).eq("organization_id", organizationId);
  if (error) throw new Error(`AI kredileri sıfırlanamadı: ${error.message}`);
  revalidatePath(`/panel/platform/licenses?organization=${organizationId}`);
}
