import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { PLATFORM_HOST } from "@/lib/public-host";
import { productName, type ProductCode } from "@/lib/products";

// Kurum lisansının kartla (PayTR Link) ödeme bağlantısı. İki yerden çağrılır:
// ArvoOS Ödemeler sayfası (app/panel/billing/paytr-actions.ts) ve Randevu
// paneli (app/api/bridge/randevu/checkout; salon ArvoOS'a girmeden öder).
// Tutar her zaman burada, veritabanından belirlenir:
//  - ArvoOS  → organization_licenses.monthly_fee
//  - diğeri  → organization_product_licenses.monthly_fee
// Bildirim /api/paytr/callback'e gelir; arvo_record_paytr_payment ilgili
// ürünün dönemini 1 ay uzatır, Randevu'ya köprü aktarır.
//
// Çağıran, kişinin bu kurumda ödeme yetkisi olduğunu (sahip/yönetici)
// kendisi doğrular; burası servis rolüyle çalışır.

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export class CheckoutError extends Error {
  constructor(readonly code: "unavailable" | "fee_not_set" | "platform_self" | "not_found" | "link_failed", message: string) {
    super(message);
  }
}

const planNames: Record<string, string> = { starter: "Başlangıç", professional: "Profesyonel", enterprise: "Kurumsal" };
const UNAVAILABLE = "Kartla ödeme şu an kullanılamıyor. Havale ile ödeyebilirsiniz.";

export async function createLicenseCheckout(admin: Admin, input: { organizationId: string; product: ProductCode; actorId: string }): Promise<{ url: string }> {
  const { organizationId, product, actorId } = input;
  if (!paymentCredentialsConfigured()) throw new CheckoutError("unavailable", UNAVAILABLE);

  const { data: organization } = await admin.from("organizations").select("id,name,display_name,plan_code").eq("id", organizationId).maybeSingle();
  if (!organization) throw new CheckoutError("not_found", "Kurum bulunamadı.");

  let fee = 0;
  let planCode = organization.plan_code as string;
  if (product === "arvoos") {
    const { data: license } = await admin.from("organization_licenses").select("plan_code,monthly_fee").eq("organization_id", organizationId).maybeSingle();
    fee = Number(license?.monthly_fee ?? 0);
    planCode = license?.plan_code ?? planCode;
  } else {
    const [{ data: productLicense }, { data: license }] = await Promise.all([
      admin.from("organization_product_licenses").select("plan_code,monthly_fee").eq("organization_id", organizationId).eq("product", product).maybeSingle(),
      admin.from("organization_licenses").select("plan_code").eq("organization_id", organizationId).maybeSingle(),
    ]);
    fee = Number(productLicense?.monthly_fee ?? 0);
    // payment_links.plan_code zorunlu: ürün paketi girilmediyse kurumun paketi kullanılır.
    planCode = productLicense?.plan_code ?? license?.plan_code ?? planCode;
  }
  if (!(fee > 0)) throw new CheckoutError("fee_not_set", `${productName(product)} için aylık ücret henüz belirlenmedi. ArvoOS ile iletişime geçin.`);

  const platformId = await getPlatformOrganizationId();
  if (!platformId) throw new CheckoutError("unavailable", UNAVAILABLE);
  if (platformId === organizationId) throw new CheckoutError("platform_self", "ArvoOS kendi lisansı için ödeme almaz.");

  const { data: provider } = await admin.from("organization_payment_providers")
    .select("merchant_id,merchant_key_enc,merchant_salt_enc,is_enabled")
    .eq("organization_id", platformId).eq("provider", "paytr").maybeSingle();
  if (!provider?.is_enabled) throw new CheckoutError("unavailable", UNAVAILABLE);
  const credentials: PaytrCredentials = { merchantId: provider.merchant_id, merchantKey: decryptSecret(provider.merchant_key_enc), merchantSalt: decryptSecret(provider.merchant_salt_enc) };

  // Aynı ürün için önceki açık bağlantıyı kapat; diğer ürünlerinki açık kalır.
  const { data: previous } = await admin.from("payment_links").select("id,provider_link_id")
    .eq("payer_organization_id", organizationId).eq("purpose", "subscription").eq("product", product).eq("status", "active").maybeSingle();
  if (previous) {
    try { await deletePaytrLink(credentials, previous.provider_link_id); } catch { /* süresi dolmuş olabilir */ }
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", previous.id);
  }

  const id = randomUUID();
  // Bağlantı ArvoOS'un mağazasıyla açıldığı için bildirim adresi de her
  // zaman ArvoOS'un alan adı olmalı; ödeyen kurumun alan adı değil.
  const expiry = paytrExpiry(null);
  const brand = organization.display_name || organization.name;
  let link: { id: string; url: string };
  try {
    link = await createPaytrInstallmentLink(credentials, {
      name: `${productName(product)} · ${brand} · ${planNames[planCode] ?? planCode} aylık lisans`,
      amountKurus: fee,
      expiry,
      callbackUrl: `https://${PLATFORM_HOST}/api/paytr/callback`,
      callbackId: toCallbackId(id),
    });
  } catch (error) {
    throw new CheckoutError("link_failed", `Ödeme bağlantısı açılamadı: ${error instanceof Error ? error.message : String(error)}`);
  }
  const { error } = await admin.from("payment_links").insert({
    id, organization_id: platformId, installment_id: null, purpose: "subscription",
    payer_organization_id: organizationId, product, plan_code: planCode,
    provider_link_id: link.id, url: link.url, amount: fee, expires_at: expiry, created_by: actorId,
  });
  if (error) {
    try { await deletePaytrLink(credentials, link.id); } catch { /* en iyi çaba */ }
    throw new CheckoutError("link_failed", "Ödeme bağlantısı hazırlanamadı: " + error.message);
  }
  return { url: link.url };
}
