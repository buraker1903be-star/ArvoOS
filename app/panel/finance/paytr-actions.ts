"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { resolvePublicHost } from "@/lib/public-host";
import { assertModuleKeyAccess } from "@/lib/role-permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { paytrKimligi } from "@/lib/payments/kimlik";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";

// PayTR taksit ödeme bağlantısı (Finans → PAYTR Tahsilatları). Yalnızca
// Kurum Sahibi ve Yönetici.
//
// Mağaza bilgilerinin girilmesi burada DEĞİL: sağlayıcıdan bağımsız karta
// taşındı (odeme-saglayici-actions.ts), çünkü Garanti'nin alanları başka ve
// iki ayrı kayıt ekranı tutmak ikisinin ayrışması demekti.

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

const loadCredentials = (admin: Admin, organizationId: string): Promise<PaytrCredentials> =>
  paytrKimligi(admin, organizationId);

const refresh = (contractId?: string) => {
  revalidatePath("/panel/finance");
  revalidatePath("/panel/finance/genel-bakis");
  if (contractId) revalidatePath(`/panel/crm/contracts/${contractId}`);
};

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
  // Bildirim adresi isteğin geldiği alan adına göre değil, kurumun kalıcı
  // alan adına göre belirlenir: bağlantı aylarca açık kalabiliyor ve PayTR
  // mağazasının kayıtlı sitesiyle aynı alan adı olması gerekiyor.
  const host = await resolvePublicHost(supabase, membership.organization_id);
  const expiry = paytrExpiry(installment.due_date);
  const link = await createPaytrInstallmentLink(credentials, {
    name: `${contract?.contract_no ?? "Sözleşme"} · ${installment.installment_no}. taksit`,
    amountKurus: Number(installment.amount),
    expiry,
    callbackUrl: `https://${host}/api/paytr/callback`,
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
export async function createPaytrPaymentLink(...args: Parameters<typeof createPaytrPaymentLink__impl>) {
  return runPanelAction(() => createPaytrPaymentLink__impl(...args), "PayTR ödeme bağlantısı oluşturuldu");
}
export async function cancelPaytrPaymentLink(...args: Parameters<typeof cancelPaytrPaymentLink__impl>) {
  return runPanelAction(() => cancelPaytrPaymentLink__impl(...args), "Ödeme bağlantısı iptal edildi");
}
