"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { kimlikSil, kimlikYaz, saglayiciKaydi } from "@/lib/payments/kimlik";
import { isProviderCode, kimlikSorunu, providerSpec, secretKeys } from "@/lib/payments/saglayicilar";

// Ödeme sağlayıcısı bilgileri (Ayarlar → Entegrasyonlar). Sağlayıcıdan
// bağımsız: hangi alanların istendiği kayıt defterinde (saglayicilar.ts),
// burada yalnızca yetki, denetim ve yazma var.
//
// Sağlayıcı tabloları yalnızca service_role'e açık; sahiplik kullanıcının
// kendi oturumuyla doğrulandıktan sonra sunucu anahtarıyla yazılır.

async function saglayiciContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) {
    throw new Error("Ödeme ayarlarını yalnızca Kurum Sahibi ve Yönetici değiştirebilir.");
  }
  assertModuleKeyAccess(context.membership.role, "finance", context.hiddenModuleKeys);
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı olmadığı için ödeme ayarları değiştirilemiyor.");
  if (!paymentCredentialsConfigured()) throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil; ödeme bilgileri güvenle saklanamıyor.");
  return { ...context, admin };
}

/*
  Sağlayıcı kodu FORMDAN geliyor. Kayıt defterinde olmayan bir değer
  reddediliyor: doğrulanmasaydı, formu elle değiştiren biri kuruma
  tanımadığımız bir sağlayıcı satırı yazdırabilirdi.
*/
function saglayiciKodu(formData: FormData) {
  const code = String(formData.get("provider") ?? "").trim();
  if (!isProviderCode(code)) throw new Error("Tanınmayan ödeme sağlayıcısı.");
  return code;
}

function tazele() {
  revalidatePath("/panel/settings");
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/genel-bakis");
}

async function saveProviderSettings__impl(formData: FormData) {
  const { admin, membership, userId } = await saglayiciContext();
  const provider = saglayiciKodu(formData);
  const spec = providerSpec(provider)!;

  const merchantId = String(formData.get("merchant_id") ?? "").trim();
  const enabled = formData.get("is_enabled") === "on";
  const modeRaw = String(formData.get("mode") ?? "").trim();
  // Test/canlı ayrımı olmayan sağlayıcıda kip her zaman canlı.
  const mode = spec.hasModes && modeRaw === "test" ? "test" : "production";

  const secrets: Record<string, string> = {};
  for (const key of secretKeys(provider)) secrets[key] = String(formData.get(key) ?? "").trim();

  const kayit = await saglayiciKaydi(admin, membership.organization_id, provider);
  const sorun = kimlikSorunu(provider, merchantId, secrets, kayit?.storedKeys ?? []);
  if (sorun) throw new Error(sorun);

  await kimlikYaz(admin, {
    organizationId: membership.organization_id,
    provider,
    merchantId,
    mode,
    enabled,
    secrets,
    actorId: userId,
  });
  tazele();
}

async function removeProviderSettings__impl(formData: FormData) {
  const { admin, membership } = await saglayiciContext();
  await kimlikSil(admin, membership.organization_id, saglayiciKodu(formData));
  tazele();
}

export async function saveProviderSettings(...args: Parameters<typeof saveProviderSettings__impl>) {
  return runPanelAction(() => saveProviderSettings__impl(...args), "Ödeme bilgileri kaydedildi");
}
export async function removeProviderSettings(...args: Parameters<typeof removeProviderSettings__impl>) {
  return runPanelAction(() => removeProviderSettings__impl(...args), "Ödeme bağlantısı kaldırıldı");
}
