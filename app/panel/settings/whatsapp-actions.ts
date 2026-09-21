"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { removeWhatsappAccountRow, saveWhatsappAccountRow, verifyWhatsappAccountRow } from "@/lib/whatsapp-account";

/*
  Kurumun kendi WhatsApp numarasını bağlaması (Ayarlar → Entegrasyonlar).
  PayTR mağaza bilgileriyle aynı yol: yalnızca Kurum Sahibi ve Yönetici,
  anahtar AES-256-GCM ile şifreli, tablo yalnızca service_role'e açık.

  İşin kendisi lib/whatsapp-account.ts'te: aynı bağlama Randevu panelinden
  de yapılabiliyor (köprü: app/api/bridge/randevu/whatsapp). Mantığı iki
  yerde yazmak, birinde Meta doğrulamasını unutmak demekti.
*/

async function whatsappContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) {
    throw new Error("WhatsApp bağlantısını yalnızca Kurum Sahibi ve Yönetici yönetebilir.");
  }
  assertModuleKeyAccess(context.membership.role, "integrations", context.hiddenModuleKeys);
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı olmadığı için WhatsApp bağlantısı kullanılamıyor.");
  if (!paymentCredentialsConfigured()) throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil; WhatsApp erişim anahtarı güvenle saklanamıyor.");
  return { ...context, admin };
}

const refresh = () => revalidatePath("/panel/settings");

async function saveWhatsappAccount__impl(formData: FormData) {
  const { admin, membership, userId } = await whatsappContext();
  await saveWhatsappAccountRow(admin, {
    organizationId: membership.organization_id,
    wabaId: String(formData.get("waba_id") ?? "").replace(/\s/g, ""),
    phoneNumberId: String(formData.get("phone_number_id") ?? "").replace(/\s/g, ""),
    token: String(formData.get("access_token") ?? "").trim(),
    connectedBy: userId ?? null,
  });
  refresh();
}

/** Anahtar değişmeden numaranın hâlâ çalıştığını sınar (Meta anahtarı iptal etmiş olabilir). */
async function verifyWhatsappAccount__impl() {
  const { admin, membership } = await whatsappContext();
  const sonuc = await verifyWhatsappAccountRow(admin, membership.organization_id);
  refresh();
  // Hata kaydedildi ama kullanıcı da görsün: bildirim metni hatayı taşısın.
  if (!sonuc.ok) throw new Error(`Numara doğrulanamadı: ${sonuc.error}`);
}

async function removeWhatsappAccount__impl() {
  const { admin, membership } = await whatsappContext();
  await removeWhatsappAccountRow(admin, membership.organization_id);
  refresh();
}

export async function saveWhatsappAccount(...args: Parameters<typeof saveWhatsappAccount__impl>) {
  return runPanelAction(() => saveWhatsappAccount__impl(...args), "WhatsApp numarası bağlandı");
}
export async function verifyWhatsappAccount(...args: Parameters<typeof verifyWhatsappAccount__impl>) {
  return runPanelAction(() => verifyWhatsappAccount__impl(...args), "WhatsApp bağlantısı doğrulandı");
}
export async function removeWhatsappAccount(...args: Parameters<typeof removeWhatsappAccount__impl>) {
  return runPanelAction(() => removeWhatsappAccount__impl(...args), "WhatsApp bağlantısı kaldırıldı");
}
