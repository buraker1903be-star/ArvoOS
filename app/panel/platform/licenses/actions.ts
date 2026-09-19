"use server";

import { runPanelAction } from "@/lib/panel-action";

import { revalidatePath } from "next/cache";
import { getPanelContext } from "@/lib/panel-context";
import { isAddonProduct, productName } from "@/lib/products";
import { syncRandevuTenants } from "@/lib/randevu-bridge";
import { syncArvolabLicense } from "@/lib/arvolab";
import { syncArcTenants } from "@/lib/arc-bridge";

const licenseStatuses = new Set(["trialing", "active", "past_due", "suspended", "canceled"]);
const productStatuses = new Set(["inactive", ...licenseStatuses]);
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

// Kuruma özel aylık ücret (TL → kuruş). Boşsa kartla ödeme kapalı kalır.
function readOptionalMonthlyFee(formData: FormData, key = "monthly_fee") {
  const raw = String(formData.get(key) ?? "").trim();
  if (!raw) return null;
  const value = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Aylık ücret pozitif bir tutar olmalı.");
  return value;
}

async function updateOrganizationLicense__impl(formData: FormData) {
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
  const monthlyFee = readOptionalMonthlyFee(formData);

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
    monthly_fee: monthlyFee,
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

// ArvoLab / Arc aboneliği: ArvoOS'un kendi lisansından ayrı, ürün başına ücret
// ve dönem. Kurum yalnızca aldığı ürüne öder; ücreti boş bırakılan üründe
// kartla ödeme açılmaz.
async function updateProductLicense__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const product = String(formData.get("product") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const planCode = String(formData.get("plan_code") ?? "").trim();
  const currentPeriodEnd = String(formData.get("current_period_end") ?? "").trim();
  const suspensionReason = String(formData.get("suspension_reason") ?? "").trim();
  const monthlyFee = readOptionalMonthlyFee(formData);

  if (!organizationId) throw new Error("Kurum seçilmedi.");
  if (!isAddonProduct(product)) throw new Error("Geçerli bir ürün seçin.");
  if (!productStatuses.has(status)) throw new Error("Geçerli bir lisans durumu seçin.");
  if (planCode && !planCodes.has(planCode)) throw new Error("Geçerli bir paket seçin.");

  const { data: userData } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const { error } = await supabase.from("organization_product_licenses").upsert({
    organization_id: organizationId,
    product,
    status,
    plan_code: planCode || null,
    monthly_fee: monthlyFee,
    current_period_end: currentPeriodEnd ? new Date(currentPeriodEnd).toISOString() : null,
    suspended_at: status === "suspended" ? now : null,
    suspension_reason: status === "suspended" ? suspensionReason || "Kurucu tarafından askıya alındı" : null,
    updated_by: userData.user?.id ?? null,
    updated_at: now,
  }, { onConflict: "organization_id,product" });
  if (error) throw new Error(`${productName(product)} lisansı kaydedilemedi: ${error.message}`);

  // ArvoLab ayrı veritabanında: durumu oraya yansıt. Yansıtma başarısız olursa
  // lisans kaydı yine de geçerli; kurucu ekranında uyarı görünür.
  if (product === "arvolab") {
    const synced = await syncArvolabLicense(organizationId);
    if (synced === "failed") throw new Error("Lisans kaydedildi ancak ArvoLab'a yansıtılamadı. Bağlantı ayarlarını kontrol edip tekrar kaydedin.");
  }
  // ARC kendi veritabanına taşındığında kademe oradan okunuyor (lib/arc-bridge.ts).
  // Kurucu ekranında hata görünsün: sessiz kalınca köprünün hiç çalışmadığı
  // (ör. ortam değişkeni girilip yeniden dağıtılmadığı) anlaşılmıyordu.
  if (product === "arc") {
    const arc = await syncArcTenants(organizationId);
    if (arc.status === "failed" || arc.errors.length)
      throw new Error(`Lisans kaydedildi ancak ARC'a yansıtılamadı: ${arc.errors[0] ?? "bilinmeyen hata"}. Bağlantı ayarlarını kontrol edip tekrar kaydedin.`);
  }
  // Randevu da kendi veritabanında (lib/randevu-bridge.ts); salonun online
  // sayfası ve paneli lisansı oradan okuyor.
  if (product === "randevu") {
    const randevu = await syncRandevuTenants(organizationId);
    if (randevu.status === "not_configured")
      throw new Error("Lisans kaydedildi ancak Randevu köprüsü kapalı (RANDEVU_SUPABASE_URL / RANDEVU_SUPABASE_SECRET_KEY). Değişkenleri ekleyip yeniden dağıtın, sonra tekrar kaydedin.");
    if (randevu.status === "failed" || randevu.errors.length)
      throw new Error(`Lisans kaydedildi ancak Randevu'ya yansıtılamadı: ${randevu.errors[0] ?? "bilinmeyen hata"}. Bağlantı ayarlarını kontrol edip tekrar kaydedin.`);
  }

  revalidatePath(`/panel/platform/licenses?organization=${organizationId}`);
  revalidatePath("/panel/billing");
}

async function resetOrganizationAiCredits__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");
  const organizationId = String(formData.get("organization_id") ?? "").trim();
  if (!organizationId) throw new Error("Kurum seçilmedi.");
  const { error } = await supabase.from("organization_licenses").update({ ai_credits_used: 0, updated_at: new Date().toISOString() }).eq("organization_id", organizationId);
  if (error) throw new Error(`AI kredileri sıfırlanamadı: ${error.message}`);
  revalidatePath(`/panel/platform/licenses?organization=${organizationId}`);
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function updateOrganizationLicense(...args: Parameters<typeof updateOrganizationLicense__impl>) {
  return runPanelAction(() => updateOrganizationLicense__impl(...args), "Lisans kaydedildi");
}
export async function updateProductLicense(...args: Parameters<typeof updateProductLicense__impl>) {
  return runPanelAction(() => updateProductLicense__impl(...args), "Ürün lisansı kaydedildi");
}
export async function resetOrganizationAiCredits(...args: Parameters<typeof resetOrganizationAiCredits__impl>) {
  return runPanelAction(() => resetOrganizationAiCredits__impl(...args), "AI kullanımı sıfırlandı");
}
