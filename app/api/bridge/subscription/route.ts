import { randomUUID, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { paytrKimligi } from "@/lib/payments/kimlik";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { PLATFORM_HOST } from "@/lib/public-host";
import { isSubscriberProduct, productName } from "@/lib/products";
import { bireyselListeFiyatiKurus } from "@/lib/paket-ucreti";
import { yayimlananFiyatlar } from "@/lib/site/fiyat-oku";
import { kurumLisansiAcik } from "@/lib/kurum-lisansi-erisim";
import { KREDI_PAKETLERI } from "@/lib/ai-kredi-paketleri";
import { createBireyselKrediCheckout } from "@/lib/ai-kredi-checkout";
import { CheckoutError } from "@/lib/license-checkout";
import { aboneFaturalamasi, BOS_FATURALAMA, kurumFaturalamasi } from "@/lib/faturalama-koprusu";

// Ürünler için abonelik köprüsü (ArvoLab, ileride ArvoARC).
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
  /** Kuruma geçmiş abone: erişim kurumun lisansından (lib/kurum-lisansi-erisim). */
  kurum_id: string | null;
};

/** Erişim kuralı tek yerde: deneme ya da aktif dönem sürüyorsa açık. */
function hasAccess(subscriber: SubscriberRow) {
  const now = Date.now();
  if (subscriber.status === "trialing") return Boolean(subscriber.trial_ends_at && new Date(subscriber.trial_ends_at).getTime() > now);
  if (subscriber.status === "active") return !subscriber.current_period_end || new Date(subscriber.current_period_end).getTime() > now;
  return false;
}

const state = (subscriber: SubscriberRow, monthlyFee: number | null, product: string) => ({
  status: subscriber.status,
  access: hasAccess(subscriber),
  trialEndsAt: subscriber.trial_ends_at,
  currentPeriodEnd: subscriber.current_period_end,
  monthlyFee,
  /*
    AI kredi paketleri (26.10.2026): yalnızca ArvoLab'ın bireysel abonesine.
    Liste ArvoLab'a kopyalanmıyor, buradan gidiyor: fiyat değiştiği gün iki
    taraf ayrı fiyat göstermesin (ArvoLab lib/kredi-paketleri.ts).
  */
  ...(product === "arvolab" ? { creditPackages: KREDI_PAKETLERI } : {}),
});

export async function POST(request: Request) {
  if (!authorized(request)) return json(401, { error: "unauthorized" });

  let body: { product?: string; action?: string; userId?: string; email?: string; fullName?: string; paket?: string; organizationId?: string };
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

  /*
    org_billing (26.10.2026): kurumun bu üründeki ödemeleri ve faturaları,
    ArvoLab'daki kurum yöneticisine. Abone kaydına dokunmuyor (kurum abone
    değil). Yetki ArvoLab'da: çağıran kullanıcının o kurumun yöneticisi
    olduğunu ArvoLab doğruluyor; burası paylaşılan anahtarla korunuyor.
  */
  if (action === "org_billing") {
    const organizationId = String(body.organizationId ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(organizationId)) return json(400, { error: "missing_organization" });
    const yonetici = createAdminClient();
    if (!yonetici) return json(503, { error: "unavailable" });
    try {
      return json(200, await kurumFaturalamasi(yonetici, organizationId, product));
    } catch (error) {
      console.error("[bridge] kurum faturalaması okunamadı", error instanceof Error ? error.message : error);
      return json(503, { error: "unavailable" });
    }
  }

  if (!userId || !email) return json(400, { error: "missing_user" });
  if (!["ensure", "checkout", "close", "credit_checkout", "billing"].includes(action)) return json(400, { error: "invalid_action" });
  // Kredi yalnızca ArvoLab'da harcanıyor; başka ürüne satmak anlamsız.
  if (action === "credit_checkout" && product !== "arvolab") return json(400, { error: "invalid_action" });

  const admin = createAdminClient();
  if (!admin) return json(503, { error: "unavailable" });

  const [{ data: plan }, fiyatlar] = await Promise.all([
    admin.from("product_plans").select("individual_monthly_fee,trial_days").eq("product", product).maybeSingle(),
    yayimlananFiyatlar(),
  ]);
  /* Listede karşılığı olan ürünün (ArvoLab → Araştırmacı) fiyatı
     YAYIMLANMIŞ listeden; öteki ürün product_plans'tan. Teklif usulüne
     çevrilmiş basamak (null) kartla satılmaz. */
  const listeFiyati = bireyselListeFiyatiKurus(product, fiyatlar);
  const monthlyFee = listeFiyati !== undefined
    ? (listeFiyati && listeFiyati > 0 ? listeFiyati : null)
    : plan?.individual_monthly_fee ? Number(plan.individual_monthly_fee) : null;

  const columns = "id,status,trial_ends_at,current_period_start,current_period_end,kurum_id";
  let { data: subscriber } = await admin.from("product_subscribers").select(columns)
    .eq("product", product).eq("external_user_id", userId).maybeSingle();

  if (!subscriber) {
    /*
      Kapatma isteğinde abone yoksa yapacak bir şey yok ve bu bir hata
      değil: kullanıcı deneme bile başlatmadan hesabını silmiş olabilir.
      404 dönseydi ArvoLab'ın silme cron'u takılır, hesap silinmeden kalırdı.
    */
    if (action === "close") return json(200, { closed: true, alreadyAbsent: true });
    // Faturalama okuması abone yaratmaz: kaydı yoksa ödemesi de yok.
    if (action === "billing") return json(200, BOS_FATURALAMA);
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

  /*
    Kuruma geçmiş abone (14.10.2026): kişi kurum anlaşmasıyla gelen
    lisansı kullanıyor. Erişim kurumun bu üründeki lisansıyla açılıp
    kapanıyor; kendi aboneliğinin dönem sonu artık bir şey ifade etmiyor
    ve ödeme planı gösterilmiyor (monthlyFee null → ArvoLab plan
    sunmuyor). Kendi adına ödeme bağlantısı da üretilmez: kurum zaten
    ödüyor, kişinin ikinci kez ödemesi çift tahsilat olurdu.
  */
  /*
    billing: abonenin kendi kart ödemeleri ve faturaları. Kuruma geçmiş
    abonenin de geçmiş ödemeleri kendisinin; gösteriliyor.
  */
  if (action === "billing") {
    try {
      return json(200, await aboneFaturalamasi(admin, subscriber.id));
    } catch (error) {
      console.error("[bridge] abone faturalaması okunamadı", error instanceof Error ? error.message : error);
      return json(503, { error: "unavailable" });
    }
  }

  if (subscriber.kurum_id) {
    // Kurumun kredisini de kurum yöneticisi alır: kişinin ödemesi çift tahsilat olurdu.
    if (action === "checkout" || action === "credit_checkout") return json(409, { error: "organization_license" });
    const { data: lisans, error: lisansHatasi } = await admin.from("organization_product_licenses")
      .select("status,trial_ends_at,current_period_end")
      .eq("organization_id", subscriber.kurum_id).eq("product", product).maybeSingle();
    /* Okunamayan lisans "lisans yok" demek değil: 5xx dönüyoruz, ArvoLab
       bunu geçici arıza sayıp kimseyi engellemiyor (lib/access.ts). */
    if (lisansHatasi) {
      console.error("[bridge] kurum lisansı okunamadı", product, lisansHatasi.message);
      return json(503, { error: "unavailable" });
    }
    return json(200, {
      status: lisans?.status ?? "inactive",
      access: kurumLisansiAcik(lisans),
      trialEndsAt: lisans?.status === "trialing" ? lisans.trial_ends_at : null,
      currentPeriodEnd: lisans?.current_period_end ?? null,
      monthlyFee: null,
      organization: true,
    });
  }

  if (action === "ensure") return json(200, state(subscriber, monthlyFee, product));

  // --- credit_checkout: AI kredi paketi için PayTR bağlantısı (bireysel abone)
  if (action === "credit_checkout") {
    try {
      const { url } = await createBireyselKrediCheckout(admin, {
        subscriberId: subscriber.id,
        paketKodu: String(body.paket ?? "").trim(),
        erisimAcik: hasAccess(subscriber),
      });
      return json(200, { ...state(subscriber, monthlyFee, product), checkoutUrl: url });
    } catch (error) {
      if (error instanceof CheckoutError) {
        const status = error.code === "not_found" ? 400 : error.code === "fee_not_set" ? 409 : error.code === "link_failed" ? 502 : 503;
        console.error("[bridge] kredi bağlantısı açılamadı", error.code, error.message);
        return json(status, { error: error.code });
      }
      console.error("[bridge] kredi bağlantısı açılamadı", error instanceof Error ? error.message : error);
      return json(500, { error: "credit_checkout_failed" });
    }
  }

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

  return json(200, { ...state(subscriber, monthlyFee, product), checkoutUrl: link.url });
}
