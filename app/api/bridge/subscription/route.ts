import { randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { paytrKimligi } from "@/lib/payments/kimlik";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { PLATFORM_HOST } from "@/lib/public-host";
import { isSubscriberProduct, productName } from "@/lib/products";

// Ürünler için abonelik köprüsü (ArvoLab, ileride Arc).
//
// Bireysel kullanıcının ArvoOS paneli yok: aboneliğini kendi kullandığı ürünün
// içinden yönetir. Ürün bu uca sunucudan sunucuya çağrı yapar; tarayıcıdan
// çağrılmaz. Yetki paylaşılan gizli anahtarla doğrulanır (PRODUCT_BRIDGE_SECRET),
// ikisi de aynı değeri taşır.
//
// Denetim ArvoOS'ta kalır: fiyat, deneme süresi ve askıya alma yalnızca burada
// belirlenir; ürün yalnızca "durumum ne" ve "ödeme bağlantısı ver" diyebilir.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function authorized(request: Request) {
  const secret = process.env.PRODUCT_BRIDGE_SECRET;
  const sent = request.headers.get("x-arvo-bridge-secret");
  if (!secret || !sent) return false;
  const expected = Buffer.from(secret);
  const received = Buffer.from(sent);
  // Uzunluk farkı timingSafeEqual'i patlatır; önce onu eşitle.
  return expected.length === received.length && timingSafeEqual(expected, received);
}

type SubscriberRow = {
  id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

/** Erişim kuralı tek yerde: deneme ya da aktif dönem sürüyorsa açık. */
function hasAccess(subscriber: SubscriberRow) {
  const now = Date.now();
  if (subscriber.status === "trialing") return Boolean(subscriber.trial_ends_at && new Date(subscriber.trial_ends_at).getTime() > now);
  if (subscriber.status === "active") return !subscriber.current_period_end || new Date(subscriber.current_period_end).getTime() > now;
  return false;
}

const state = (subscriber: SubscriberRow, monthlyFee: number | null) => ({
  status: subscriber.status,
  access: hasAccess(subscriber),
  trialEndsAt: subscriber.trial_ends_at,
  currentPeriodEnd: subscriber.current_period_end,
  monthlyFee,
});

export async function POST(request: Request) {
  if (!authorized(request)) return json(401, { error: "unauthorized" });

  let body: { product?: string; action?: string; userId?: string; email?: string; fullName?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const product = String(body.product ?? "").trim();
  const action = String(body.action ?? "").trim();
  const userId = String(body.userId ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isSubscriberProduct(product)) return json(400, { error: "invalid_product" });
  if (!userId || !email) return json(400, { error: "missing_user" });
  if (!["ensure", "checkout", "close"].includes(action)) return json(400, { error: "invalid_action" });

  const admin = createAdminClient();
  if (!admin) return json(503, { error: "unavailable" });

  const { data: plan } = await admin.from("product_plans").select("individual_monthly_fee,trial_days").eq("product", product).maybeSingle();
  const monthlyFee = plan?.individual_monthly_fee ? Number(plan.individual_monthly_fee) : null;

  const columns = "id,status,trial_ends_at,current_period_start,current_period_end";
  let { data: subscriber } = await admin.from("product_subscribers").select(columns)
    .eq("product", product).eq("external_user_id", userId).maybeSingle();

  if (!subscriber) {
    /*
      Kapatma isteğinde abone yoksa yapacak bir şey yok ve bu bir hata
      değil: kullanıcı deneme bile başlatmadan hesabını silmiş olabilir.
      404 dönseydi ArvoLab'ın silme cron'u takılır, hesap silinmeden kalırdı.
    */
    if (action === "close") return json(200, { closed: true, alreadyAbsent: true });
    if (action !== "ensure") return json(404, { error: "subscriber_not_found" });
    // İlk giriş: deneme süresi tanımlıysa denemeyle başlar, değilse kapalı.
    const trialDays = plan?.trial_days ?? 0;
    const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
    const { data: created, error } = await admin.from("product_subscribers").insert({
      product,
      external_user_id: userId,
      email,
      full_name: body.fullName?.trim() || null,
      status: trialDays > 0 ? "trialing" : "suspended",
      trial_ends_at: trialEndsAt,
      suspension_reason: trialDays > 0 ? null : "Abonelik başlatılmadı",
      suspended_at: trialDays > 0 ? null : new Date().toISOString(),
    }).select(columns).single();
    if (error) {
      console.error("[bridge] abone oluşturulamadı", product, error.message);
      return json(500, { error: "create_failed" });
    }
    subscriber = created;
  } else if (action === "ensure") {
    // E-posta ya da ad değişmiş olabilir; kurucunun listesi güncel kalsın.
    await admin.from("product_subscribers").update({ email, full_name: body.fullName?.trim() || null, updated_at: new Date().toISOString() })
      .eq("id", subscriber.id);
  }

  /*
    close: ArvoLab'da hesap KALICI olarak silindi.

    Satır silinmiyor — subscriber_payments ve payment_links buna cascade ile
    bağlı, silmek ödeme ve fatura kaydını da götürürdü (VUK beş yıl saklama).
    Bunun yerine durum 'canceled' oluyor, closed_at damgalanıyor ve kişisel
    alanlar anonimleşiyor: ödeme izi kimliksiz olarak kalıyor.

    E-posta NOT NULL, o yüzden boşaltılamıyor; abonenin kendi kimliğinden
    türeyen bir yer tutucu yazılıyor ki benzersiz kalsın ve bir daha gerçek
    bir adresle karışmasın.

    İşlem tekrarlanabilir: ikinci çağrı aynı sonucu verir. Cron yeniden
    denerse bir şey bozulmaz.
  */
  if (action === "close") {
    const { error } = await admin.from("product_subscribers").update({
      status: "canceled",
      closed_at: new Date().toISOString(),
      email: `silinmis+${subscriber.id}@arvo-os.com`,
      full_name: null,
      suspension_reason: "Kullanıcı hesabını sildi",
      updated_at: new Date().toISOString(),
    }).eq("id", subscriber.id);
    if (error) {
      console.error("[bridge] abone kapatılamadı", product, error.message);
      return json(500, { error: "close_failed" });
    }
    return json(200, { closed: true });
  }

  if (action === "ensure") return json(200, state(subscriber, monthlyFee));

  // --- checkout: PayTR bağlantısı üret
  if (!paymentCredentialsConfigured()) return json(503, { error: "payments_unavailable" });
  if (!monthlyFee || monthlyFee <= 0) return json(409, { error: "fee_not_set" });

  const platformId = await getPlatformOrganizationId();
  if (!platformId) return json(503, { error: "payments_unavailable" });

  let credentials: PaytrCredentials;
  try {
    credentials = await paytrKimligi(admin, platformId);
  } catch (error) {
    console.error("[abonelik] PayTR kimliği alınamadı", error instanceof Error ? error.message : error);
    return json(503, { error: "payments_unavailable" });
  }

  // Aynı abonenin önceki açık bağlantısını kapat (birey başına tek aktif).
  const { data: previous } = await admin.from("payment_links").select("id,provider_link_id")
    .eq("subscriber_id", subscriber.id).eq("product", product).eq("status", "active").maybeSingle();
  if (previous) {
    try { await deletePaytrLink(credentials, previous.provider_link_id); } catch { /* süresi dolmuş olabilir */ }
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", previous.id);
  }

  const id = randomUUID();
  const expiry = paytrExpiry(null);
  let link: { id: string; url: string };
  try {
    link = await createPaytrInstallmentLink(credentials, {
      name: `${productName(product)} · bireysel aylık abonelik`,
      amountKurus: monthlyFee,
      expiry,
      callbackUrl: `https://${PLATFORM_HOST}/api/paytr/callback`,
      callbackId: toCallbackId(id),
    });
  } catch (error) {
    console.error("[bridge] PayTR bağlantısı açılamadı", error instanceof Error ? error.message : error);
    return json(502, { error: "provider_failed" });
  }

  const { error: insertError } = await admin.from("payment_links").insert({
    id, organization_id: platformId, installment_id: null, purpose: "subscription",
    product, subscriber_id: subscriber.id, payer_organization_id: null, plan_code: null,
    provider_link_id: link.id, url: link.url, amount: monthlyFee, expires_at: expiry, created_by: null,
  });
  if (insertError) {
    try { await deletePaytrLink(credentials, link.id); } catch { /* en iyi çaba */ }
    console.error("[bridge] bağlantı kaydedilemedi", insertError.message);
    return json(500, { error: "link_not_saved" });
  }

  return json(200, { ...state(subscriber, monthlyFee), checkoutUrl: link.url });
}
