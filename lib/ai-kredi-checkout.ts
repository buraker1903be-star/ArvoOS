import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret, paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { PLATFORM_HOST } from "@/lib/public-host";
import { krediPaketi } from "@/lib/ai-kredi-paketleri";
import { CheckoutError } from "@/lib/license-checkout";

/*
  AI kredisi satın alma bağlantısı.

  Lisans ödemesinden (lib/license-checkout.ts) ayrı duruyor çünkü satılan
  şey farklı: orada bir DÖNEM uzuyor, burada bir BAKİYE artıyor. Aynı
  fonksiyona bindirmek, iki ayrı kuralı tek koşula sıkıştırmak olurdu.

  Kaç kredi satıldığı sipariş kaydına yazılıyor (ai_credit_orders), ödeme
  tutarından geri hesaplanmıyor: fiyat değiştiği gün eski bağlantı yanlış
  kredi yüklerdi.
*/

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const UNAVAILABLE = "Kartla ödeme şu an kullanılamıyor. ArvoOS ile iletişime geçin.";

export async function createAiKrediCheckout(
  admin: Admin,
  input: { organizationId: string; paketKodu: string; actorId: string },
): Promise<{ url: string }> {
  const paket = krediPaketi(input.paketKodu);
  // Kod istemciden geliyor; tanınmayan kod sessizce varsayılana düşerse
  // müşteri istemediği paketi öder.
  if (!paket) throw new CheckoutError("not_found", "Geçersiz kredi paketi.");
  if (!paymentCredentialsConfigured()) throw new CheckoutError("unavailable", UNAVAILABLE);

  const { data: organization } = await admin.from("organizations")
    .select("id,name,display_name").eq("id", input.organizationId).maybeSingle();
  if (!organization) throw new CheckoutError("not_found", "Kurum bulunamadı.");

  /*
    ArvoLab lisansı kapalıyken kredi satılmıyor: kredi yüklense bile
    kullanılamaz, yani müşteriden kullanamayacağı bir şeyin parası
    alınmış olurdu.
  */
  const { data: lisans } = await admin.from("organization_product_licenses")
    .select("status").eq("organization_id", input.organizationId).eq("product", "arvolab").maybeSingle();
  if (!["active", "trialing", "past_due"].includes(lisans?.status ?? "inactive")) {
    throw new CheckoutError("fee_not_set", "ArvoLab aboneliğiniz açık olmadığı için kredi satın alınamıyor.");
  }

  const platformId = await getPlatformOrganizationId();
  if (!platformId) throw new CheckoutError("unavailable", UNAVAILABLE);
  if (platformId === input.organizationId) throw new CheckoutError("platform_self", "ArvoOS kendi kredisi için ödeme almaz.");

  const { data: provider } = await admin.from("organization_payment_providers")
    .select("merchant_id,merchant_key_enc,merchant_salt_enc,is_enabled")
    .eq("organization_id", platformId).eq("provider", "paytr").maybeSingle();
  if (!provider?.is_enabled) throw new CheckoutError("unavailable", UNAVAILABLE);
  const credentials: PaytrCredentials = {
    merchantId: provider.merchant_id,
    merchantKey: decryptSecret(provider.merchant_key_enc),
    merchantSalt: decryptSecret(provider.merchant_salt_enc),
  };

  /*
    Önceki açık kredi bağlantısı kapatılıyor. Lisans akışında da aynısı
    yapılıyor: iki açık bağlantı, müşterinin eskisini açıp yanlış tutarı
    ödemesi demek.
  */
  const { data: previous } = await admin.from("payment_links").select("id,provider_link_id")
    .eq("payer_organization_id", input.organizationId).eq("purpose", "ai_credit").eq("status", "active").maybeSingle();
  if (previous) {
    try { await deletePaytrLink(credentials, previous.provider_link_id); } catch { /* süresi dolmuş olabilir */ }
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", previous.id);
  }

  const id = randomUUID();
  const expiry = paytrExpiry(null);
  const brand = organization.display_name || organization.name;
  let link: { id: string; url: string };
  try {
    link = await createPaytrInstallmentLink(credentials, {
      name: `ArvoLab AI kredisi · ${brand} · ${paket.ad}`,
      amountKurus: paket.fiyat,
      expiry,
      // Bağlantı ArvoOS'un mağazasıyla açıldığı için bildirim adresi de
      // her zaman ArvoOS'un alan adı olmalı.
      callbackUrl: `https://${PLATFORM_HOST}/api/paytr/callback`,
      callbackId: toCallbackId(id),
    });
  } catch (error) {
    throw new CheckoutError("link_failed", `Ödeme bağlantısı açılamadı: ${error instanceof Error ? error.message : String(error)}`);
  }

  const { error } = await admin.from("payment_links").insert({
    id, organization_id: platformId, purpose: "ai_credit",
    payer_organization_id: input.organizationId, product: "arvolab",
    provider_link_id: link.id, url: link.url, amount: paket.fiyat,
    expires_at: expiry, created_by: input.actorId,
  });
  if (error) {
    try { await deletePaytrLink(credentials, link.id); } catch { /* en iyi çaba */ }
    throw new CheckoutError("link_failed", "Ödeme bağlantısı hazırlanamadı: " + error.message);
  }

  /*
    Sipariş kaydı bağlantıdan SONRA ama ödemeden önce: ödeme bildirimi
    geldiğinde kaç kredi yükleneceğini bu satır söylüyor. Yazılamazsa
    bağlantı iptal ediliyor — parası alınıp kredisi yüklenemeyen bir
    ödeme, en kötü sonuç.
  */
  const { error: siparisHatasi } = await admin.from("ai_credit_orders").insert({
    payment_link_id: id,
    organization_id: input.organizationId,
    paket_kodu: paket.kod,
    kredi: paket.kredi,
    amount: paket.fiyat,
    created_by: input.actorId,
  });
  if (siparisHatasi) {
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", id);
    try { await deletePaytrLink(credentials, link.id); } catch { /* en iyi çaba */ }
    throw new CheckoutError("link_failed", "Kredi siparişi kaydedilemedi: " + siparisHatasi.message);
  }

  return { url: link.url };
}
