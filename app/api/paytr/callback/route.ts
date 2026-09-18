import { createAdminClient } from "@/lib/supabase/admin";
import { syncArvolabLicense } from "@/lib/arvolab";
import { syncArcTenantQuietly } from "@/lib/arc-bridge";
import { decryptSecret } from "@/lib/payment-credentials";
import { deletePaytrLink, fromCallbackId, verifyPaytrCallback, type PaytrCredentials } from "@/lib/paytr";

// PayTR "Link ile Ödeme" bildirimi (herkese açık, giriş yok).
//
// PayTR yalnızca başarılı ödemeleri, bağlantı oluşturulurken verilen
// callback_link'e POST eder (dev.paytr.com/link-api/linkle-api-callback).
// Güvenlik tamamen hash doğrulamasına dayanır: kurumun şifreli mağaza
// anahtarlarıyla hesaplanan HMAC eşleşmezse istek işlenmez.
// Yanıt yalnızca düz "OK" olmalı; OK dönmezsek PayTR yeniden dener. Aynı
// ödeme birden fazla bildirilebilir: arvo_record_paytr_payment
// (provider, merchant_oid) tekilliğiyle yalnızca ilkini işler.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const text = (status: number, body: string) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
const OK = () => text(200, "OK");
const kurus = (value: string) => (/^\d{1,15}$/.test(value) ? Number(value) : null);

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return text(400, "invalid request");
  }
  const field = (name: string) => String(form.get(name) ?? "").trim();
  const fields = {
    callback_id: field("callback_id"),
    merchant_oid: field("merchant_oid"),
    status: field("status"),
    total_amount: field("total_amount"),
    hash: field("hash"),
  };
  const linkId = fromCallbackId(fields.callback_id);
  if (!linkId || !fields.merchant_oid || !fields.hash) return text(400, "invalid request");

  const admin = createAdminClient();
  if (!admin) return text(503, "service unavailable"); // PayTR sonra yeniden dener

  const { data: link } = await admin.from("payment_links").select("id,organization_id,provider_link_id,purpose,product,payer_organization_id").eq("id", linkId).maybeSingle();
  if (!link) {
    // Bizim oluşturmadığımız (ya da silinmiş) bir bağlantı: yeniden denemesin.
    console.warn("[paytr] bilinmeyen bağlantı bildirimi", fields.callback_id);
    return OK();
  }

  const { data: provider } = await admin
    .from("organization_payment_providers")
    .select("merchant_id,merchant_key_enc,merchant_salt_enc")
    .eq("organization_id", link.organization_id)
    .eq("provider", "paytr")
    .maybeSingle();
  if (!provider) return text(503, "provider not configured");

  let credentials: PaytrCredentials;
  try {
    credentials = { merchantId: provider.merchant_id, merchantKey: decryptSecret(provider.merchant_key_enc), merchantSalt: decryptSecret(provider.merchant_salt_enc) };
  } catch (error) {
    console.error("[paytr] mağaza anahtarları çözülemedi", error instanceof Error ? error.message : error);
    return text(503, "credentials unavailable");
  }

  if (field("merchant_id") && field("merchant_id") !== credentials.merchantId) return text(400, "merchant mismatch");
  if (!verifyPaytrCallback(credentials, fields)) return text(400, "PAYTR notification failed: bad hash");
  if (fields.status !== "success") return OK(); // Link API yalnızca başarılı ödeme bildirir

  const totalAmount = kurus(fields.total_amount);
  /*
    İmza yalnızca total_amount'ı kapsıyor (callback_id + merchant_oid + salt +
    status + total_amount); payment_amount imzasız geliyor. Kayda esas tutarı
    imzalanmış değerle sınırlıyoruz: taksit farkı yüzünden payment_amount
    total_amount'tan küçük olabilir, büyük olması beklenmez. Böylece imzasız
    bir alan cari alacağını ya da abonelik kontrolünü şişiremez.
  */
  const reported = kurus(field("payment_amount")) ?? totalAmount;
  const paymentAmount = totalAmount === null ? reported : Math.min(reported ?? totalAmount, totalAmount);
  const { data: result, error } = await admin.rpc("arvo_record_paytr_payment", {
    p_payment_link_id: link.id,
    p_merchant_oid: fields.merchant_oid,
    p_total_amount: totalAmount,
    p_payment_amount: paymentAmount,
    p_currency: field("currency") || "TL",
    p_test_mode: field("test_mode") === "1",
    p_payload: {
      payment_type: field("payment_type") || null,
      currency: field("currency") || null,
      test_mode: field("test_mode") || null,
      total_amount: fields.total_amount,
      payment_amount: field("payment_amount") || null,
    },
  });
  if (error) {
    console.error("[paytr] ödeme kaydedilemedi", error.message);
    return text(500, "record failed"); // OK dönmüyoruz: PayTR yeniden dener
  }

  // Ödenen bağlantıyı PayTR'de de kapat (tek kullanımlık; en iyi çaba).
  if (result === "recorded") {
    try {
      await deletePaytrLink(credentials, link.provider_link_id);
    } catch (closeError) {
      console.warn("[paytr] ödenen bağlantı kapatılamadı", closeError instanceof Error ? closeError.message : closeError);
    }
    // ArvoLab ayrı veritabanında: uzayan lisansı oraya yansıt. Başarısız olsa
    // bile PayTR'ye OK dönüyoruz; ödeme kaydedildi, tekrar bildirim yeni bir
    // şey yazmaz. Kurucu Platform → Lisans'tan kaydederek elle tetikleyebilir.
    if (link.purpose === "subscription" && link.product === "arvolab" && link.payer_organization_id) {
      const synced = await syncArvolabLicense(link.payer_organization_id);
      if (synced !== "synced") console.error("[paytr] ArvoLab lisansı yansıtılamadı", link.payer_organization_id, synced);
    }
    // ARC lisansı uzadıysa kademe hemen açılsın; 10 dakikayı beklemesin.
    if (link.purpose === "subscription" && link.product === "arc" && link.payer_organization_id) {
      await syncArcTenantQuietly(link.payer_organization_id);
    }
  }
  return OK();
}
