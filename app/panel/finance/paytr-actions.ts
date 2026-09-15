"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, encryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";

// PayTR işlemleri: mağaza bilgileri (Ayarlar) ve taksit ödeme bağlantısı
// (Finans → PAYTR Tahsilatları). Yalnızca Kurum Sahibi ve Yönetici.
// Sağlayıcı tabloları yalnızca service_role'e açık; sahiplik kontrolleri
// kullanıcının kendi oturumuyla (RLS) yapıldıktan sonra sunucu anahtarıyla yazılır.

async function paytrContext() {
  const context = await getPanelContext();
  if (!["owner", "admin"].includes(context.membership.role)) throw new Error("PayTR işlemlerini yalnızca Kurum Sahibi ve Yönetici yapabilir.");
  assertModuleKeyAccess(context.membership.role, "finance", context.hiddenModuleKeys);
  const admin = createAdminClient();
  if (!admin) throw new Error("Sunucu anahtarı tanımlı olmadığı için PayTR kullanılamıyor.");
  if (!paymentCredentialsConfigured()) throw new Error("PAYMENT_CREDENTIALS_KEY tanımlı değil; PayTR bilgileri güvenle saklanamıyor.");
  return { ...context, admin };
}
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

async function loadCredentials(admin: Admin, organizationId: string): Promise<PaytrCredentials> {
  const { data } = await admin
    .from("organization_payment_providers")
    .select("merchant_id,merchant_key_enc,merchant_salt_enc,is_enabled")
    .eq("organization_id", organizationId)
    .eq("provider", "paytr")
    .maybeSingle();
  if (!data) throw new Error("PayTR bağlı değil. Ayarlar → Entegrasyonlar'dan mağaza bilgilerini girin.");
  if (!data.is_enabled) throw new Error("PayTR bağlantısı kapalı. Ayarlar → Entegrasyonlar'dan açın.");
  return { merchantId: data.merchant_id, merchantKey: decryptSecret(data.merchant_key_enc), merchantSalt: decryptSecret(data.merchant_salt_enc) };
}

const refresh = (contractId?: string) => {
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/genel-bakis");
  if (contractId) revalidatePath(`/panel/crm/contracts/${contractId}`);
};

// ---------------------------------------------------------------
// Mağaza bilgileri
// ---------------------------------------------------------------
async function savePaytrSettings__impl(formData: FormData) {
  const { admin, membership, userId } = await paytrContext();
  const merchantId = String(formData.get("merchant_id") ?? "").trim();
  const merchantKey = String(formData.get("merchant_key") ?? "").trim();
  const merchantSalt = String(formData.get("merchant_salt") ?? "").trim();
  const enabled = formData.get("is_enabled") === "on";
  if (!/^[0-9]{3,20}$/.test(merchantId)) throw new Error("Mağaza numarası (merchant_id) yalnızca rakamlardan oluşmalı.");

  const { data: existing } = await admin.from("organization_payment_providers").select("merchant_key_enc,merchant_salt_enc")
    .eq("organization_id", membership.organization_id).eq("provider", "paytr").maybeSingle();
  // Anahtar ve tuz boş bırakılırsa mevcut değerler korunur (ekranda hiç gösterilmezler).
  if (!existing && (!merchantKey || !merchantSalt)) throw new Error("İlk kurulumda Mağaza Parolası (merchant_key) ve Gizli Anahtar (merchant_salt) zorunludur.");
  if ((merchantKey && merchantKey.length > 200) || (merchantSalt && merchantSalt.length > 200)) throw new Error("Anahtar değerleri geçersiz görünüyor.");

  const { error } = await admin.from("organization_payment_providers").upsert({
    organization_id: membership.organization_id,
    provider: "paytr",
    merchant_id: merchantId,
    merchant_key_enc: merchantKey ? encryptSecret(merchantKey) : existing!.merchant_key_enc,
    merchant_salt_enc: merchantSalt ? encryptSecret(merchantSalt) : existing!.merchant_salt_enc,
    is_enabled: enabled,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id,provider" });
  if (error) throw new Error("PayTR bilgileri kaydedilemedi: " + error.message);
  revalidatePath("/panel/settings");
  refresh();
}

async function removePaytrSettings__impl() {
  const { admin, membership } = await paytrContext();
  const { error } = await admin.from("organization_payment_providers").delete()
    .eq("organization_id", membership.organization_id).eq("provider", "paytr");
  if (error) throw new Error("PayTR bağlantısı kaldırılamadı: " + error.message);
  revalidatePath("/panel/settings");
  refresh();
}

// ---------------------------------------------------------------
// Taksit ödeme bağlantısı
// ---------------------------------------------------------------
async function ownedInstallment(context: Awaited<ReturnType<typeof paytrContext>>, installmentId: string, contractId: string) {
  const { supabase, membership } = context;
  const { data: installment } = await supabase.from("payment_installments").select("id,payment_plan_id,installment_no,due_date,amount,status")
    .eq("id", installmentId).eq("organization_id", membership.organization_id).maybeSingle();
  const { data: plan } = installment
    ? await supabase.from("payment_plans").select("id").eq("id", installment.payment_plan_id).eq("organization_id", membership.organization_id).eq("contract_id", contractId).maybeSingle()
    : { data: null };
  if (!installment || !plan) throw new Error("Taksit bu sözleşmeye ait değil.");
  return installment;
}

async function closeActiveLink(admin: Admin, credentials: PaytrCredentials, installmentId: string) {
  const { data: previous } = await admin.from("payment_links").select("id,provider_link_id").eq("installment_id", installmentId).eq("status", "active").maybeSingle();
  if (!previous) return;
  try {
    await deletePaytrLink(credentials, previous.provider_link_id);
  } catch {
    // PayTR'de zaten kapanmış/süresi dolmuş olabilir; bizde yine iptal edilir.
  }
  await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", previous.id);
}

async function createPaytrPaymentLink__impl(formData: FormData) {
  const context = await paytrContext();
  const { supabase, admin, membership, userId } = context;
  const installmentId = String(formData.get("installment_id") ?? "").trim();
  const contractId = String(formData.get("contract_id") ?? "").trim();
  if (!installmentId || !contractId) throw new Error("Taksit seçilemedi.");
  const installment = await ownedInstallment(context, installmentId, contractId);
  if (installment.status === "paid") throw new Error("Bu taksit zaten ödenmiş.");
  if (!(Number(installment.amount) > 0)) throw new Error("Taksit tutarı geçersiz.");

  const credentials = await loadCredentials(admin, membership.organization_id);
  const { data: contract } = await supabase.from("crm_contracts").select("contract_no").eq("id", contractId).eq("organization_id", membership.organization_id).maybeSingle();

  // Yeni bağlantıdan önce eskisini kapat (taksit başına tek aktif bağlantı).
  await closeActiveLink(admin, credentials, installmentId);

  const id = randomUUID();
  const origin = (await headers()).get("origin") ?? "https://app.arvo-os.com";
  const expiry = paytrExpiry(installment.due_date);
  const link = await createPaytrInstallmentLink(credentials, {
    name: `${contract?.contract_no ?? "Sözleşme"} · ${installment.installment_no}. taksit`,
    amountKurus: Number(installment.amount),
    expiry,
    callbackUrl: `${origin}/api/paytr/callback`,
    callbackId: toCallbackId(id),
  });

  const { error } = await admin.from("payment_links").insert({
    id, organization_id: membership.organization_id, installment_id: installmentId, provider_link_id: link.id,
    url: link.url, amount: Number(installment.amount), expires_at: expiry, created_by: userId,
  });
  if (error) {
    try { await deletePaytrLink(credentials, link.id); } catch { /* en iyi çaba */ }
    throw new Error("PayTR bağlantısı kaydedilemedi: " + error.message);
  }
  const { error: updateError } = await supabase.from("payment_installments").update({ payment_url: link.url, payment_link_source: "paytr" })
    .eq("id", installmentId).eq("organization_id", membership.organization_id);
  if (updateError) throw new Error("Bağlantı taksite işlenemedi: " + updateError.message);
  refresh(contractId);
}

async function cancelPaytrPaymentLink__impl(formData: FormData) {
  const context = await paytrContext();
  const { supabase, admin, membership } = context;
  const installmentId = String(formData.get("installment_id") ?? "").trim();
  const contractId = String(formData.get("contract_id") ?? "").trim();
  if (!installmentId || !contractId) throw new Error("Taksit seçilemedi.");
  await ownedInstallment(context, installmentId, contractId);
  const credentials = await loadCredentials(admin, membership.organization_id);
  await closeActiveLink(admin, credentials, installmentId);
  const { error } = await supabase.from("payment_installments").update({ payment_url: null, payment_link_source: null })
    .eq("id", installmentId).eq("organization_id", membership.organization_id);
  if (error) throw new Error("Bağlantı kaldırılamadı: " + error.message);
  refresh(contractId);
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcılar (lib/panel-action.ts).
export async function savePaytrSettings(...args: Parameters<typeof savePaytrSettings__impl>) {
  return runPanelAction(() => savePaytrSettings__impl(...args), "PayTR bilgileri kaydedildi");
}
export async function removePaytrSettings(...args: Parameters<typeof removePaytrSettings__impl>) {
  return runPanelAction(() => removePaytrSettings__impl(...args), "PayTR bağlantısı kaldırıldı");
}
export async function createPaytrPaymentLink(...args: Parameters<typeof createPaytrPaymentLink__impl>) {
  return runPanelAction(() => createPaytrPaymentLink__impl(...args), "PayTR ödeme bağlantısı oluşturuldu");
}
export async function cancelPaytrPaymentLink(...args: Parameters<typeof cancelPaytrPaymentLink__impl>) {
  return runPanelAction(() => cancelPaytrPaymentLink__impl(...args), "Ödeme bağlantısı iptal edildi");
}
