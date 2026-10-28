import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { paketAdi } from "@/lib/paket-adlari";
import { paymentCredentialsConfigured } from "@/lib/payment-credentials";
import { paytrKimligi } from "@/lib/payments/kimlik";
import { createPaytrInstallmentLink, deletePaytrLink, paytrExpiry, toCallbackId, type PaytrCredentials } from "@/lib/paytr";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { PLATFORM_HOST } from "@/lib/public-host";
import { productName, type ProductCode } from "@/lib/products";
import { donemTutari } from "@/lib/abonelik-tutari";
import { PAYTR_LINK_TABANI } from "@/lib/odeme-baglantisi";

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

const UNAVAILABLE = "Kartla ödeme şu an kullanılamıyor. Havale ile ödeyebilirsiniz.";

/*
  ÖDEME HAZIRLIĞI — tutar, paket ve ArvoOS mağazasının anahtarları
  (28.10.2026'da ayrıldı). Ödeme bağlantısı da kartla ödeme sayfası da
  (lib/paytr-kart-akisi) buradan okur: iki ayrı hesap, düğmede bir
  rakam, karttan başka rakam çekmenin en kolay yolu olurdu.
*/
export type LisansOdemeHazirligi = {
  organization: { id: string; name: string; display_name: string | null; plan_code: string };
  fee: number; planCode: string; ekNot: string; platformId: string; credentials: PaytrCredentials;
};

export async function lisansOdemeHazirligi(admin: Admin, organizationId: string, product: ProductCode): Promise<LisansOdemeHazirligi> {
  if (!paymentCredentialsConfigured()) throw new CheckoutError("unavailable", UNAVAILABLE);

  const { data: organization } = await admin.from("organizations").select("id,name,display_name,plan_code").eq("id", organizationId).maybeSingle();
  if (!organization) throw new CheckoutError("not_found", "Kurum bulunamadı.");

  let fee = 0;
  let planCode = organization.plan_code as string;
  /* Bağlantının adında görünen ek: "… + 2 ek kullanıcı". Müşteri ödeme
     sayfasında neden paket fiyatından fazlasını ödediğini görmeli. */
  let ekNot = "";
  if (product === "arvoos") {
    /*
      EK KULLANICI (13.10.2026). Paket fiyatına, dahil kullanıcı sayısını
      aşan her koltuk için aylık bedel ekleniyor — fiyat listesinde
      yayımlanmış kalem buydu ve bugüne kadar hiçbir yerde hesaba
      girmiyordu.

      Sayım tam burada, bağlantı açılırken yapılıyor: kurum dönem içinde
      kullanıcı ekler/çıkarır, dondurulmuş bir sayı bir sonraki ödemede
      yanlış tutar demek olurdu. Yalnızca ArvoOS'ta; öteki ürünlerin
      koltuk kavramı yok (Randevu şube, ARC mağaza üzerinden fiyatlanıyor).
    */
    const [{ data: license }, { count: aktifKullanici }] = await Promise.all([
      admin.from("organization_licenses").select("plan_code,monthly_fee,user_limit,extra_user_fee").eq("organization_id", organizationId).maybeSingle(),
      admin.from("organization_memberships").select("user_id", { count: "exact", head: true })
        .eq("organization_id", organizationId).eq("is_active", true),
    ]);
    // Hesap lib/abonelik-tutari'nda: hatırlatma ve havale onayı aynı tutarı görsün.
    const { tutar, ekKoltuk } = donemTutari({
      urun: "arvoos", aylikUcret: license?.monthly_fee, aktifKullanici: aktifKullanici ?? 0,
      kullaniciLimiti: license?.user_limit ?? null, ekKullaniciUcreti: license?.extra_user_fee ?? 0,
    });
    fee = tutar;
    if (ekKoltuk > 0) ekNot = ` + ${ekKoltuk} ek kullanıcı`;
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

  let credentials: PaytrCredentials;
  try {
    credentials = await paytrKimligi(admin, platformId);
  } catch (error) {
    // Bağlı değil, kapalı ya da anahtar eksik: kullanıcıya hepsi aynı kapı.
    console.error("[lisans] PayTR kimliği alınamadı", error instanceof Error ? error.message : error);
    throw new CheckoutError("unavailable", UNAVAILABLE);
  }

  return { organization: organization as LisansOdemeHazirligi["organization"], fee, planCode, ekNot, platformId, credentials };
}

/*
  Aynı ürün için önceki açık ödemeyi kapatır; diğer ürünlerinki açık kalır.
  Veritabanı kurum + ürün başına TEK açık abonelik ödemesine izin veriyor
  (payment_links_one_active_subscription). Kartla ödeme sayfasının
  kayıtları da aynı tabloda: PayTR'de bağlantısı olmayan bir kayıt
  (sağlayıcı kimliği sipariş no) silinmeye çalışılmaz, yalnızca kapatılır.
*/
export async function oncekiBaglantiyiKapat(admin: Admin, credentials: PaytrCredentials, organizationId: string, product: ProductCode) {
  const { data: previous, error } = await admin.from("payment_links").select("id,provider_link_id,url")
    .eq("payer_organization_id", organizationId).eq("purpose", "subscription").eq("product", product).eq("status", "active").maybeSingle();
  // Engelin sorgusu hata yutmaz: okunamazsa yeni kayıt tekillik kısıtına çarpar, nedeni burada yazsın.
  if (error) throw new CheckoutError("link_failed", "Önceki ödeme okunamadı: " + error.message);
  if (!previous) return;
  if (String(previous.url).startsWith(PAYTR_LINK_TABANI)) {
    try { await deletePaytrLink(credentials, previous.provider_link_id); } catch { /* süresi dolmuş olabilir */ }
  }
  await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", previous.id);
}

export async function createLicenseCheckout(admin: Admin, input: { organizationId: string; product: ProductCode; actorId: string }): Promise<{ url: string }> {
  const { organizationId, product, actorId } = input;
  const { organization, fee, planCode, ekNot, platformId, credentials } = await lisansOdemeHazirligi(admin, organizationId, product);

  await oncekiBaglantiyiKapat(admin, credentials, organizationId, product);

  const id = randomUUID();
  // Bağlantı ArvoOS'un mağazasıyla açıldığı için bildirim adresi de her
  // zaman ArvoOS'un alan adı olmalı; ödeyen kurumun alan adı değil.
  const expiry = paytrExpiry(null);
  const brand = organization.display_name || organization.name;
  let link: { id: string; url: string };
  try {
    link = await createPaytrInstallmentLink(credentials, {
      name: `${productName(product)} · ${brand} · ${paketAdi(planCode)} aylık lisans${ekNot}`,
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
