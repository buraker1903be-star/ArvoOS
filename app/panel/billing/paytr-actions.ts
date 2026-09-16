"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { runPanelAction } from "@/lib/panel-action";
import { getPanelContext } from "@/lib/panel-context";
import { PLATFORM_HOST } from "@/lib/public-host";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";
import { getPlatformOrganizationId } from "@/lib/paytr-status";

// Müşteri kurumun ArvoOS aboneliğini kartla (PayTR Link) ödemesi.
// Tutar sunucuda belirlenir: kurucunun Platform → Lisans'ta girdiği aylık
// ücret (organization_licenses.monthly_fee). Bağlantı ArvoOS'un kendi PayTR
// mağazasıyla açılır; ödeme bildirimi /api/paytr/callback'e gelir ve
// arvo_record_paytr_payment lisansı mevcut dönem sonuna 1 ay ekleyerek uzatır.

const planNames: Record<string, string> = { starter: "Başlangıç", professional: "Profesyonel", enterprise: "Kurumsal" };

async function payLicenseWithCard__impl() {
  const { supabase, organization, membership, userId } = await getPanelContext();
  if (!["owner", "admin"].includes(membership.role)) throw new Error("Lisans ödemesini yalnızca Kurum Sahibi veya Yönetici yapabilir.");
  const admin = createAdminClient();
  if (!admin || !paymentCredentialsConfigured()) throw new Error("Kartla ödeme şu an kullanılamıyor. Havale ile ödeyebilirsiniz.");

  const { data: license } = await supabase.from("organization_licenses").select("plan_code,monthly_fee").eq("organization_id", organization.id).maybeSingle();
  const fee = Number(license?.monthly_fee ?? 0);
  if (!license || !(fee > 0)) throw new Error("Aylık ücretiniz henüz belirlenmedi. ArvoOS ile iletişime geçin.");

  const platformId = await getPlatformOrganizationId();
  if (!platformId) throw new Error("Kartla ödeme şu an kullanılamıyor. Havale ile ödeyebilirsiniz.");
  if (platformId === organization.id) throw new Error("ArvoOS kendi lisansı için ödeme almaz.");

  const { data: provider } = await admin.from("organization_payment_providers")
    .select("merchant_id,merchant_key_enc,merchant_salt_enc,is_enabled")
    .eq("organization_id", platformId).eq("provider", "paytr").maybeSingle();
  if (!provider?.is_enabled) throw new Error("Kartla ödeme şu an kullanılamıyor. Havale ile ödeyebilirsiniz.");
  const credentials: PaytrCredentials = { merchantId: provider.merchant_id, merchantKey: decryptSecret(provider.merchant_key_enc), merchantSalt: decryptSecret(provider.merchant_salt_enc) };

  // Önceki açık abonelik bağlantısını kapat (kurum başına tek aktif bağlantı).
  const { data: previous } = await admin.from("payment_links").select("id,provider_link_id")
    .eq("payer_organization_id", organization.id).eq("purpose", "subscription").eq("status", "active").maybeSingle();
  if (previous) {
    try { await deletePaytrLink(credentials, previous.provider_link_id); } catch { /* süresi dolmuş olabilir */ }
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", previous.id);
  }

  const id = randomUUID();
  // Bağlantı ArvoOS'un mağazasıyla açıldığı için bildirim adresi de her
  // zaman ArvoOS'un alan adı olmalı; ödeyen kurumun alan adı değil.
  const expiry = paytrExpiry(null);
  const brand = organization.display_name || organization.name;
  const link = await createPaytrInstallmentLink(credentials, {
    name: `ArvoOS · ${brand} · ${planNames[license.plan_code] ?? license.plan_code} aylık lisans`,
    amountKurus: fee,
    expiry,
    callbackUrl: `https://${PLATFORM_HOST}/api/paytr/callback`,
    callbackId: toCallbackId(id),
  });
  const { error } = await admin.from("payment_links").insert({
    id, organization_id: platformId, installment_id: null, purpose: "subscription",
    payer_organization_id: organization.id, plan_code: license.plan_code,
    provider_link_id: link.id, url: link.url, amount: fee, expires_at: expiry, created_by: userId,
  });
  if (error) {
    try { await deletePaytrLink(credentials, link.id); } catch { /* en iyi çaba */ }
    throw new Error("Ödeme bağlantısı hazırlanamadı: " + error.message);
  }
  // Güvenli PayTR ödeme sayfasına
  redirect(link.url);
}

// Hata mesajlarını kullanıcıya ulaştıran sarmalayıcı (lib/panel-action.ts).
export async function payLicenseWithCard() {
  return runPanelAction(() => payLicenseWithCard__impl());
}
