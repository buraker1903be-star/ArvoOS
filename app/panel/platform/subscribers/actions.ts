"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { isAddonProduct, productName } from "@/lib/products";

// Bireysel abonelerin denetimi. Fiyat ve deneme süresi ürün geneli
// (product_plans); askıya alma ve dönem tek tek abonede.

const subscriberStatuses = new Set(["trialing", "active", "past_due", "suspended", "canceled"]);

async function updateProductPlan__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const product = String(formData.get("product") ?? "").trim();
  if (!isAddonProduct(product)) throw new Error("Geçerli bir ürün seçin.");

  const rawFee = String(formData.get("individual_monthly_fee") ?? "").trim();
  const fee = rawFee ? Math.round(Number(rawFee) * 100) : null;
  if (rawFee && (!Number.isSafeInteger(fee) || (fee ?? 0) <= 0)) throw new Error("Bireysel aylık ücret pozitif bir tutar olmalı.");

  const trialDays = Number.parseInt(String(formData.get("trial_days") ?? ""), 10);
  if (!Number.isSafeInteger(trialDays) || trialDays < 0 || trialDays > 365) throw new Error("Deneme süresi 0 ile 365 gün arasında olmalı.");

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("product_plans").upsert({
    product,
    individual_monthly_fee: fee,
    trial_days: trialDays,
    updated_by: userData.user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "product" });
  if (error) throw new Error(`${productName(product)} planı kaydedilemedi: ${error.message}`);

  revalidatePath("/panel/platform/subscribers");
}

async function updateSubscriber__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const subscriberId = String(formData.get("subscriber_id") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const periodEnd = String(formData.get("current_period_end") ?? "").trim();
  const trialEndsAt = String(formData.get("trial_ends_at") ?? "").trim();
  const suspensionReason = String(formData.get("suspension_reason") ?? "").trim();
  if (!subscriberId) throw new Error("Abone seçilmedi.");
  if (!subscriberStatuses.has(status)) throw new Error("Geçerli bir durum seçin.");

  const now = new Date().toISOString();
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("product_subscribers").update({
    status,
    trial_ends_at: trialEndsAt ? new Date(trialEndsAt).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
    suspended_at: status === "suspended" ? now : null,
    suspension_reason: status === "suspended" ? suspensionReason || "Kurucu tarafından askıya alındı" : null,
    updated_by: userData.user?.id ?? null,
    updated_at: now,
  }).eq("id", subscriberId);
  if (error) throw new Error(`Abone güncellenemedi: ${error.message}`);

  revalidatePath("/panel/platform/subscribers");
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function updateProductPlan(...args: Parameters<typeof updateProductPlan__impl>) {
  return runPanelAction(() => updateProductPlan__impl(...args), "Plan kaydedildi");
}
export async function updateSubscriber(...args: Parameters<typeof updateSubscriber__impl>) {
  return runPanelAction(() => updateSubscriber__impl(...args), "Abone kaydedildi");
}
