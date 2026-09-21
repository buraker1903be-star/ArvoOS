"use server";

import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { verifyWhatsappNumber, whatsappInputError } from "@/lib/whatsapp-cloud";

/*
  Kurumun kendi WhatsApp numarasını bağlaması (Ayarlar → Entegrasyonlar).
  PayTR mağaza bilgileriyle aynı yol: yalnızca Kurum Sahibi ve Yönetici,
  anahtar AES-256-GCM ile şifreli, tablo yalnızca service_role'e açık.

  Bağlama sırasında numara Meta'ya sorulur: anahtar yanlışsa ya da numara
  başka hesaba aitse kayıt hiç yazılmaz. Yoksa hata ilk mesaj gönderilirken,
  yani müşteriye mesaj gitmeyince anlaşılırdı.
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
  const phoneNumberId = String(formData.get("phone_number_id") ?? "").replace(/\s/g, "");
  const wabaId = String(formData.get("waba_id") ?? "").replace(/\s/g, "");
  const token = String(formData.get("access_token") ?? "").trim();

  const bicimHatasi = whatsappInputError(phoneNumberId, wabaId, token);
  if (bicimHatasi) throw new Error(bicimHatasi);

  const kontrol = await verifyWhatsappNumber(phoneNumberId, token);
  if (!kontrol.ok) throw new Error(`Numara doğrulanamadı: ${kontrol.error}`);

  const now = new Date().toISOString();
  const { error } = await admin.from("whatsapp_accounts").upsert({
    organization_id: membership.organization_id,
    waba_id: wabaId,
    phone_number_id: phoneNumberId,
    display_phone: kontrol.number.displayPhone,
    verified_name: kontrol.number.verifiedName,
    access_token_enc: encryptSecret(token),
    status: "connected",
    last_verified_at: now,
    last_error: null,
    connected_by: userId ?? null,
    updated_at: now,
  }, { onConflict: "organization_id" });
  if (error) throw new Error(`WhatsApp bağlantısı kaydedilemedi: ${error.message}`);

  refresh();
}

/** Anahtar değişmeden numaranın hâlâ çalıştığını sınar (Meta anahtarı iptal etmiş olabilir). */
async function verifyWhatsappAccount__impl() {
  const { admin, membership } = await whatsappContext();
  const { data } = await admin
    .from("whatsapp_accounts")
    .select("phone_number_id,access_token_enc")
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!data) throw new Error("Bağlı bir WhatsApp numarası yok.");

  // Şifre çözme yalnızca burada; anahtar hiçbir yanıtta dönmez.
  const { decryptSecret } = await import("@/lib/payment-credentials");
  const kontrol = await verifyWhatsappNumber(data.phone_number_id, decryptSecret(data.access_token_enc));
  const now = new Date().toISOString();

  const { error } = await admin.from("whatsapp_accounts").update(
    kontrol.ok
      ? {
          status: "connected",
          display_phone: kontrol.number.displayPhone,
          verified_name: kontrol.number.verifiedName,
          last_verified_at: now,
          last_error: null,
          updated_at: now,
        }
      : { status: "unverified", last_verified_at: now, last_error: kontrol.error, updated_at: now },
  ).eq("organization_id", membership.organization_id);
  if (error) throw new Error(`Durum kaydedilemedi: ${error.message}`);

  refresh();
  // Hata kaydedildi ama kullanıcı da görsün: bildirim metni hatayı taşısın.
  if (!kontrol.ok) throw new Error(`Numara doğrulanamadı: ${kontrol.error}`);
}

async function removeWhatsappAccount__impl() {
  const { admin, membership } = await whatsappContext();
  const { error } = await admin.from("whatsapp_accounts").delete().eq("organization_id", membership.organization_id);
  if (error) throw new Error(`Bağlantı kaldırılamadı: ${error.message}`);
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
