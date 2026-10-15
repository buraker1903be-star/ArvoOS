"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { isSubscriberProduct, productName } from "@/lib/products";
import { BIREYSEL_PLAN_KODU } from "@/lib/paket-ucreti";
import { kurusOku } from "@/lib/turkish-amount";

// Bireysel abonelerin denetimi. Fiyat ve deneme süresi ürün geneli
// (product_plans); askıya alma ve dönem tek tek abonede.

const subscriberStatuses = new Set(["trialing", "active", "past_due", "suspended", "canceled"]);

async function updateProductPlan__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const product = String(formData.get("product") ?? "").trim();
  if (!isSubscriberProduct(product)) throw new Error("Geçerli bir ürün seçin.");

  /* Ücreti fiyat listesinden gelen ürünün (ArvoLab) tutarı burada
     yazılmıyor; formda alanı da yok. Eski satırdaki tutar köprüde
     artık okunmuyor. */
  const listeden = product in BIREYSEL_PLAN_KODU;
  const rawFee = listeden ? "" : String(formData.get("individual_monthly_fee") ?? "").trim();
  const fee = rawFee ? kurusOku(rawFee) : null;
  if (rawFee && (!Number.isSafeInteger(fee) || (fee ?? 0) <= 0)) throw new Error("Bireysel aylık ücret pozitif bir tutar olmalı.");

  const trialDays = Number.parseInt(String(formData.get("trial_days") ?? ""), 10);
  if (!Number.isSafeInteger(trialDays) || trialDays < 0 || trialDays > 365) throw new Error("Deneme süresi 0 ile 365 gün arasında olmalı.");

  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("product_plans").upsert({
    product,
    ...(listeden ? {} : { individual_monthly_fee: fee }),
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
/*
  Bireysel aboneyi kurum lisansına taşır ya da geri alır (14.10.2026).

  Kurumla anlaşma yapılınca personelin önceden açtığı bireysel abonelik
  bireysel sayılmaya devam ediyordu. Satır silinmiyor (ödeme geçmişi ona
  bağlı); kurum_id yazılıyor ve köprü erişimi kurumun lisansından veriyor
  (app/api/bridge/subscription).

  Kurumun o ürün için lisans satırı yoksa taşıma reddedilir: kişinin
  erişimi taşındığı anda kapanırdı.
*/
async function setSubscriberOrganization__impl(formData: FormData) {
  const { supabase, isPlatformOwner } = await getPanelContext();
  if (!isPlatformOwner) throw new Error("Bu işlem için kurucu yetkisi gerekiyor.");

  const subscriberId = String(formData.get("subscriber_id") ?? "").trim();
  const kurumId = String(formData.get("kurum_id") ?? "").trim();
  if (!subscriberId) throw new Error("Abone seçilmedi.");

  const { data: abone, error: aboneHatasi } = await supabase.from("product_subscribers")
    .select("id,product").eq("id", subscriberId).maybeSingle();
  if (aboneHatasi) throw new Error(`Abone okunamadı: ${aboneHatasi.message}`);
  if (!abone) throw new Error("Abone bulunamadı.");

  if (kurumId) {
    const { data: lisans, error: lisansHatasi } = await supabase.from("organization_product_licenses")
      .select("status").eq("organization_id", kurumId).eq("product", abone.product).maybeSingle();
    if (lisansHatasi) throw new Error(`Kurum lisansı okunamadı: ${lisansHatasi.message}`);
    if (!lisans) throw new Error(`Kurumun ${productName(abone.product)} lisansı yok; önce kuruma ürünü açın.`);
  }

  const { data: userData } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const { error } = await supabase.from("product_subscribers").update({
    kurum_id: kurumId || null,
    kuruma_gecti_at: kurumId ? now : null,
    updated_by: userData.user?.id ?? null,
    updated_at: now,
  }).eq("id", subscriberId);
  if (error) throw new Error(`Abone güncellenemedi: ${error.message}`);

  revalidatePath("/panel/platform/subscribers");
  revalidatePath("/panel/platform/musteriler");
}

export async function setSubscriberOrganization(...args: Parameters<typeof setSubscriberOrganization__impl>) {
  const [veri] = args;
  return runPanelAction(() => setSubscriberOrganization__impl(...args),
    veri.get("kurum_id") ? "Abone kurum lisansına taşındı" : "Abone yeniden bireysel abone");
}

export async function updateProductPlan(...args: Parameters<typeof updateProductPlan__impl>) {
  return runPanelAction(() => updateProductPlan__impl(...args), "Plan kaydedildi");
}
export async function updateSubscriber(...args: Parameters<typeof updateSubscriber__impl>) {
  return runPanelAction(() => updateSubscriber__impl(...args), "Abone kaydedildi");
}
