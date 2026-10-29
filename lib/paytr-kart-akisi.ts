import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutError, lisansOdemeHazirligi, oncekiBaglantiyiKapat } from "@/lib/license-checkout";
import { paytrKimligi } from "@/lib/payments/kimlik";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { PLATFORM_HOST } from "@/lib/public-host";
import { productName, type ProductCode } from "@/lib/products";
import { PRODUCT_APPS } from "@/lib/site/routes";
import { PAYTR_LINK_TABANI } from "@/lib/odeme-baglantisi";
import { deletePaytrLink } from "@/lib/paytr";
import { paketAdi } from "@/lib/paket-adlari";
import type { PaytrCredentials } from "@/lib/paytr";
import {
  basarisizlikAciklamasi, direktBildirimDogruMu, kayitliKartlar, odemeFormuAlanlari, PAYTR_ODEME_ADRESI, siparisNo,
} from "@/lib/paytr-direkt";

/*
  KARTLA ÖDEME VE KART SAKLAMA AKIŞI (28.10.2026). PayTR ile konuşan saf
  parçalar lib/paytr-direkt.ts'te; burası veritabanını bağlıyor.

  "use server" DEĞİL: buradaki her işlev servis rolüyle çalışıyor ve
  yetkiyi ÇAĞIRAN doğruluyor (kurumun lisans yönetme yetkisi). Dışarıdan
  çağrılabilir bir uca dönüşmemeli (AGENTS.md, lib/payments/kimlik.ts).

  Lisans yalnızca PayTR bildirimiyle uzar ve uzatmayı mevcut
  arvo_record_paytr_payment yapar: her kartla ödeme bir payment_links
  satırı açıyor (sağlayıcı kimliği = sipariş no), yani bağlantıyla
  ödemeyle AYNI kurallar, aynı tekrar engeli (sağlayıcı + sipariş no).

  ÖZELLİK BAYRAĞI: PayTR mağazada Direkt API, Kart Saklama ve Non3D
  yetkilerini açana kadar kapalı (PAYTR_KART_SAKLAMA=acik). Kapalıyken
  ekranda düğme yok ve sayfa 404; bildirim adresi ise her zaman çalışır —
  açılıp kapatılan bir bayrak yolda kalan ödemenin bildirimini düşürmesin.
*/

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

export const kartSaklamaAcik = () => process.env.PAYTR_KART_SAKLAMA === "acik";

/*
  OTOMATİK YENİLEME KAPALI (29.10.2026, kurum sahibinin kararı).
  Kayıtlı karttan otomatik çekim 3D Secure'suz (non_3d=1) gidiyor; müşteri
  "bu çekim bana ait değil" diye itiraz ederse 3D'nin sağladığı sorumluluk
  devri olmadığı için kayıp üye işyerinde kalıyor. Bu yüzden her ödeme
  müşterinin bankasında SMS ile onayladığı 3D'li ödeme olarak alınır.
  Kapalıyken: kart formlarında kart kaydetme/otomatik yenileme kutusu
  görünmez, sunucu onayı hep "hayır" yazar (tarayıcıdan gelen bir "evet"
  de dâhil), zamanlanmış iş çekim yapmaz, köprü ArvoLab'a seçeneği
  göndermez. Kod silinmedi: yeniden açmak için bu değeri değiştirmek ve
  Mesafeli Satış Sözleşmesi'ne otomatik yenileme maddelerini geri koymak
  gerekir (app/(site)/_content/legal.ts).
*/
export const otomatikYenilemeAcik = () => false;

/* Kabul edilen metnin kendisi kayda giriyor: ileride metin değişirse eski
   onayın neye verildiği yine okunabilsin. Sürüm öneki o yüzden var. */
export const OTOMATIK_YENILEME_ONAY_METNI =
  "v1 · Kartımın kaydedilmesini ve aboneliğimin her dönem sonunda bu karttan otomatik yenilenmesini kabul ediyorum. " +
  "Her çekimden en az 3 gün önce bildirimle bilgilendirileceğimi, otomatik yenilemeyi ve kayıtlı kartı hesabımın ödeme " +
  "ekranından istediğim zaman kapatabileceğimi biliyorum.";

const DONUS = `https://${PLATFORM_HOST}/api/paytr/kart-donus`;

export type KartFormu = {
  merchantOid: string;
  tutar: number;
  baslik: string;
  alanlar: Record<string, string>;
  /** Kurumun daha önce kaydettiği kart varsa PayTR'deki müşteri anahtarı; yeni kart aynı anahtarın altına girer. */
  utoken: string | null;
  varsayilan: { adres: string; telefon: string };
};

export const kurumUtokeni = (admin: Admin, organizationId: string) => odeyenUtokeni(admin, { organizationId });

/**
 * Kurumun bir ürün lisansı için kartla ödemeyi AÇAR: tutarı hesaplar,
 * önceki açık ödemeyi kapatır, ödeme kaydını ve denemeyi yazar, sipariş
 * numarasını döndürür. Sunucu işleminden çağrılır, sayfadan DEĞİL:
 * sayfa çizimi kayıt açsaydı her yenileme ve önceden yükleme yeni bir
 * ödeme kaydı üretirdi.
 */
export async function kurumKartOdemesiAc(admin: Admin, input: {
  organizationId: string; product: ProductCode; actorId: string; ip: string;
}): Promise<string> {
  const { organization, fee, planCode, ekNot, platformId, credentials } = await lisansOdemeHazirligi(admin, input.organizationId, input.product);
  await oncekiBaglantiyiKapat(admin, credentials, input.organizationId, input.product);
  const merchantOid = siparisNo(input.product);
  const baslik = `${productName(input.product)} · ${paketAdi(planCode)} aylık lisans${ekNot} · ${organization.display_name || organization.name}`;

  // payment_links.id'nin veritabanında varsayılanı yok (bağlantı ödemesi de kimliği kendisi üretiyor).
  const { data: link, error: linkHatasi } = await admin.from("payment_links").insert({
    id: randomUUID(), organization_id: platformId, installment_id: null, purpose: "subscription", provider: "paytr",
    payer_organization_id: input.organizationId, product: input.product, plan_code: planCode,
    provider_link_id: merchantOid, url: PAYTR_ODEME_ADRESI, amount: fee, status: "active",
    created_by: input.actorId, note: baslik.slice(0, 200),
  }).select("id").single();
  if (linkHatasi || !link) throw new CheckoutError("link_failed", "Ödeme hazırlanamadı: " + (linkHatasi?.message ?? "kayıt açılmadı"));

  const { error: islemHatasi } = await admin.from("paytr_kart_islemleri").insert({
    merchant_oid: merchantOid, payment_link_id: link.id, tur: "ilk", tutar: fee, kullanici_ip: input.ip,
  });
  if (islemHatasi) {
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", link.id);
    throw new CheckoutError("link_failed", "Ödeme hazırlanamadı: " + islemHatasi.message);
  }
  return merchantOid;
}

/**
 * Açılmış kartla ödemenin formunu kurar (sayfa çağırır). Kayıt bu
 * kuruma ait ve beklemede olmalı; değilse null (sayfa 404). Tutar ve
 * başlık kayıttan okunur, yeniden hesaplanmaz: düğmede görülen rakam
 * karttan çekilen rakamdır.
 */
export async function kurumKartFormu(admin: Admin, input: {
  merchantOid: string; organizationId: string; actorEmail: string; actorName: string | null;
}): Promise<(KartFormu & { urun: string }) | null> {
  if (!/^[A-Z0-9]{1,64}$/.test(input.merchantOid)) return null;
  const { data: islem, error } = await admin.from("paytr_kart_islemleri")
    .select("merchant_oid,durum,tutar,kullanici_ip,payment_links!inner(organization_id,payer_organization_id,product,note,status)")
    .eq("merchant_oid", input.merchantOid).maybeSingle();
  if (error) throw new Error("Ödeme okunamadı: " + error.message);
  const link = islem?.payment_links as unknown as { organization_id: string; payer_organization_id: string | null; product: string; note: string | null; status: string } | undefined;
  if (!islem || !link || link.payer_organization_id !== input.organizationId || islem.durum !== "bekliyor" || link.status !== "active") return null;

  const [{ data: yasal, error: yasalHatasi }, utoken, kimlik] = await Promise.all([
    admin.from("organizations").select("name,display_name,legal_name,legal_address,legal_district,legal_city,contact_phone").eq("id", input.organizationId).maybeSingle(),
    kurumUtokeni(admin, input.organizationId),
    paytrKimligi(admin, link.organization_id),
  ]);
  if (yasalHatasi || !yasal) throw new Error("Kurum bilgileri okunamadı.");
  const adres = [yasal.legal_address, [yasal.legal_district, yasal.legal_city].filter(Boolean).join(" / ")].filter(Boolean).join(", ") || "Türkiye";
  const telefon = (yasal.contact_phone ?? "").replace(/[^\d+]/g, "").slice(0, 20);
  const baslik = link.note || productName(link.product);
  const alanlar = odemeFormuAlanlari(kimlik, {
    kullaniciIp: islem.kullanici_ip,
    siparisNo: islem.merchant_oid,
    eposta: input.actorEmail,
    tutarKurus: Number(islem.tutar),
    adSoyad: (input.actorName || yasal.legal_name || yasal.display_name || yasal.name).slice(0, 60),
    adres: adres.slice(0, 400),
    // Telefon ve adres imzaya girmiyor; formda müşteri düzeltebilir. Boş gitmesin diye yer tutucu.
    telefon: telefon || "0",
    sepet: [{ ad: baslik, kurus: Number(islem.tutar), adet: 1 }],
    basariliAdres: `${DONUS}?sonuc=tamam`,
    hataAdres: `${DONUS}?sonuc=hata`,
  });
  return { merchantOid: islem.merchant_oid, tutar: Number(islem.tutar), baslik, alanlar, utoken, varsayilan: { adres, telefon }, urun: link.product };
}

/**
 * Kart saklama ve otomatik yenileme onayını kaydeder; form PayTR'ye
 * gönderilmeden HEMEN ÖNCE çağrılır. store_card imzaya girmediği için
 * formdaki kutu tarayıcıda değiştirilebilir: onayın kanıtı burada,
 * sunucuda (an, IP, metin, kim). Bildirimde kart geldiği hâlde onay
 * kaydı yoksa otomatik yenileme AÇILMAZ.
 */
/* Ödeyen: kurum (ArvoOS paneli) ya da bireysel abone (ArvoLab köprüsü). */
export type Odeyen = { organizationId: string } | { subscriberId: string };

export async function kartOnayiniKaydet(admin: Admin, input: {
  merchantOid: string; odeyen: Odeyen; actorId: string | null; ip: string; otomatikYenileme: boolean;
}): Promise<void> {
  const { data: islem, error } = await admin.from("paytr_kart_islemleri")
    .select("merchant_oid,durum,payment_link_id,payment_links!inner(payer_organization_id,subscriber_id)")
    .eq("merchant_oid", input.merchantOid).maybeSingle();
  if (error) throw new Error("Ödeme okunamadı: " + error.message);
  const link = islem?.payment_links as unknown as { payer_organization_id: string | null; subscriber_id: string | null } | null;
  const bizim = "organizationId" in input.odeyen ? link?.payer_organization_id === input.odeyen.organizationId : link?.subscriber_id === input.odeyen.subscriberId;
  if (!islem || !bizim) throw new Error("Ödeme bulunamadı.");
  if (islem.durum !== "bekliyor") throw new Error("Bu ödeme artık beklemede değil; sayfayı yenileyin.");
  // Bireysel abonenin ArvoOS'ta kullanıcı hesabı yok: onaylayan boş, kanıt an + IP + metin.
  const { error: yazmaHatasi } = await admin.from("paytr_kart_islemleri").update(input.otomatikYenileme && otomatikYenilemeAcik()
    ? { kart_sakla: true, otomatik_onay: true, onay_at: new Date().toISOString(), onay_ip: input.ip, onay_metni: OTOMATIK_YENILEME_ONAY_METNI, onaylayan: input.actorId }
    : { kart_sakla: false, otomatik_onay: false, onay_at: null, onay_ip: null, onay_metni: null, onaylayan: null })
    .eq("merchant_oid", input.merchantOid).eq("durum", "bekliyor");
  if (yazmaHatasi) throw new Error("Onay kaydedilemedi: " + yazmaHatasi.message);
}

/* Ödeyenin satırlarını süzen alan adı ve değeri (kart, yenileme tabloları). */
export const odeyenSuzgeci = (o: Odeyen): [string, string] =>
  "organizationId" in o ? ["organization_id", o.organizationId] : ["subscriber_id", o.subscriberId];

export async function odeyenUtokeni(admin: Admin, o: Odeyen): Promise<string | null> {
  const [alan, deger] = odeyenSuzgeci(o);
  const { data, error } = await admin.from("paytr_kayitli_kartlar").select("utoken").eq(alan, deger).limit(1).maybeSingle();
  if (error) throw new Error("Kayıtlı kart okunamadı: " + error.message);
  return data?.utoken ?? null;
}

/**
 * Bireysel abonenin kartla ödemesini açar ve formu döndürür (ArvoLab
 * köprüsü çağırır: sunucudan sunucuya, sayfa çiziminden değil). Tutarı
 * köprü hesaplıyor (bireysel liste fiyatı); dönüş adresleri ArvoLab'da.
 */
export async function aboneKartOdemesiAc(admin: Admin, input: {
  subscriberId: string; product: string; fee: number; ip: string; email: string; adSoyad: string | null;
}): Promise<{ merchantOid: string; tutar: number; baslik: string; alanlar: Record<string, string>; utoken: string | null }> {
  const platformId = await getPlatformOrganizationId();
  if (!platformId) throw new CheckoutError("unavailable", "Kartla ödeme şu an kullanılamıyor.");
  const kimlik = await paytrKimligi(admin, platformId);
  // Abone başına tek açık abonelik ödemesi (payment_links_one_active_subscriber).
  const { data: onceki, error: oncekiHatasi } = await admin.from("payment_links").select("id,provider_link_id,url")
    .eq("subscriber_id", input.subscriberId).eq("product", input.product).eq("purpose", "subscription").eq("status", "active").maybeSingle();
  if (oncekiHatasi) throw new CheckoutError("link_failed", "Önceki ödeme okunamadı: " + oncekiHatasi.message);
  if (onceki) {
    if (String(onceki.url).startsWith(PAYTR_LINK_TABANI)) { try { await deletePaytrLink(kimlik, onceki.provider_link_id); } catch { /* süresi dolmuş olabilir */ } }
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", onceki.id);
  }
  const merchantOid = siparisNo(input.product);
  const baslik = `${productName(input.product)} · bireysel aylık abonelik`;
  const { data: link, error: linkHatasi } = await admin.from("payment_links").insert({
    id: randomUUID(), organization_id: platformId, installment_id: null, purpose: "subscription", provider: "paytr",
    product: input.product, subscriber_id: input.subscriberId, payer_organization_id: null, plan_code: null,
    provider_link_id: merchantOid, url: PAYTR_ODEME_ADRESI, amount: input.fee, status: "active", created_by: null, note: baslik,
  }).select("id").single();
  if (linkHatasi || !link) throw new CheckoutError("link_failed", "Ödeme hazırlanamadı: " + (linkHatasi?.message ?? ""));
  const { error: islemHatasi } = await admin.from("paytr_kart_islemleri").insert({
    merchant_oid: merchantOid, payment_link_id: link.id, tur: "ilk", tutar: input.fee, kullanici_ip: input.ip,
  });
  if (islemHatasi) {
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", link.id);
    throw new CheckoutError("link_failed", "Ödeme hazırlanamadı: " + islemHatasi.message);
  }
  const donus = `${PRODUCT_APPS.arvolab.url}/api/odeme-donus`;
  const alanlar = odemeFormuAlanlari(kimlik, {
    kullaniciIp: input.ip, siparisNo: merchantOid, eposta: input.email, tutarKurus: input.fee,
    adSoyad: (input.adSoyad || input.email.split("@")[0]).slice(0, 60),
    // Bireysel abonenin adresi ve telefonu bizde yok; formda kendisi yazar (imzaya girmiyorlar).
    adres: "Türkiye", telefon: "0",
    sepet: [{ ad: baslik, kurus: input.fee, adet: 1 }],
    basariliAdres: `${donus}?sonuc=tamam`, hataAdres: `${donus}?sonuc=hata`,
  });
  return { merchantOid, tutar: input.fee, baslik, alanlar, utoken: await odeyenUtokeni(admin, { subscriberId: input.subscriberId }) };
}

const kurusOku = (v: string) => (/^\d{1,15}$/.test(v) ? Number(v) : null);

export type BildirimSonucu = "ok" | "gecersiz" | "yeniden-dene";

/**
 * PayTR Direkt API bildirimi. Dönüş "ok" → düz "OK"; "gecersiz" → 400
 * (imza ya da içerik bozuk, PayTR yeniden denemesin diye yine yanıt
 * veriliyor); "yeniden-dene" → 503 (geçici: veritabanı ya da anahtar
 * okunamadı, PayTR sonra yeniden gönderir).
 */
export async function direktBildirimiIsle(admin: Admin, alan: (ad: string) => string): Promise<BildirimSonucu> {
  const b = { merchant_oid: alan("merchant_oid"), status: alan("status"), total_amount: alan("total_amount"), hash: alan("hash") };
  if (!b.merchant_oid || !b.hash) return "gecersiz";

  const { data: islem, error } = await admin.from("paytr_kart_islemleri")
    .select("merchant_oid,payment_link_id,tur,durum,kart_sakla,otomatik_onay,onay_at,onay_ip,onay_metni,onaylayan,payment_links!inner(organization_id,payer_organization_id,subscriber_id,product)")
    .eq("merchant_oid", b.merchant_oid).maybeSingle();
  if (error) return "yeniden-dene";
  // Bizim açmadığımız bir sipariş: yeniden denemesin, ama hiçbir şey yapılmaz.
  if (!islem) {
    console.warn("[paytr-direkt] bilinmeyen sipariş bildirimi", b.merchant_oid);
    return "ok";
  }
  const link = islem.payment_links as unknown as { organization_id: string; payer_organization_id: string | null; subscriber_id: string | null; product: string };

  let kimlik: PaytrCredentials;
  try {
    // Kapalı sağlayıcıda da çözülür: para çoktan hareket etti (gerekçe kimlik.ts).
    kimlik = await paytrKimligi(admin, link.organization_id, { acikOlmali: false });
  } catch (hata) {
    console.error("[paytr-direkt] mağaza anahtarları çözülemedi", hata instanceof Error ? hata.message : hata);
    return "yeniden-dene";
  }
  if (!direktBildirimDogruMu(kimlik, b)) return "gecersiz";
  // Tekrarlanan bildirim: yalnızca ilki işlenir.
  if (islem.durum !== "bekliyor") return "ok";

  if (b.status === "failed") {
    const { metin, bizim } = basarisizlikAciklamasi(alan("failed_reason_code"), alan("failed_reason_msg"));
    if (bizim) console.error("[paytr-direkt] entegrasyon hatası", b.merchant_oid, alan("failed_reason_code"), alan("failed_reason_msg"));
    await admin.from("paytr_kart_islemleri").update({ durum: "basarisiz", hata_kodu: alan("failed_reason_code") || null, hata_mesaji: metin, sonuc_at: new Date().toISOString() })
      .eq("merchant_oid", b.merchant_oid).eq("durum", "bekliyor");
    await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", islem.payment_link_id).eq("status", "active");
    const kimin = link.payer_organization_id ? ["organization_id", link.payer_organization_id] : link.subscriber_id ? ["subscriber_id", link.subscriber_id] : null;
    if (islem.tur === "otomatik" && kimin) {
      await admin.from("paytr_otomatik_yenileme").update({ son_hata: metin, updated_at: new Date().toISOString() })
        .eq(kimin[0], kimin[1]).eq("product", link.product);
    }
    return "ok";
  }

  const toplam = kurusOku(b.total_amount);
  // payment_amount imzasız; kayda esas tutar imzalı toplamla sınırlı (bağlantı bildirimindeki kuralın aynısı).
  const bildirilen = kurusOku(alan("payment_amount")) ?? toplam;
  const tutar = toplam === null ? bildirilen : Math.min(bildirilen ?? toplam, toplam);
  const { data: sonuc, error: kayitHatasi } = await admin.rpc("arvo_record_paytr_payment", {
    p_payment_link_id: islem.payment_link_id,
    p_merchant_oid: b.merchant_oid,
    p_total_amount: toplam,
    p_payment_amount: tutar,
    p_currency: alan("currency") || "TL",
    p_test_mode: alan("test_mode") === "1",
    p_payload: { kaynak: "direkt", tur: islem.tur, installment_count: alan("installment_count"), payment_type: alan("payment_type") },
  });
  if (kayitHatasi) {
    console.error("[paytr-direkt] ödeme kaydedilemedi", b.merchant_oid, kayitHatasi.message);
    return "yeniden-dene";
  }
  await admin.from("paytr_kart_islemleri").update({ durum: "basarili", sonuc_at: new Date().toISOString() })
    .eq("merchant_oid", b.merchant_oid).eq("durum", "bekliyor");
  // Başarılı otomatik çekim deneme sayacını sıfırlar: bir sonraki dönem üç hakla başlar.
  const yenilemeSahibi = link.payer_organization_id ? ["organization_id", link.payer_organization_id] : link.subscriber_id ? ["subscriber_id", link.subscriber_id] : null;
  if (islem.tur === "otomatik" && yenilemeSahibi) {
    await admin.from("paytr_otomatik_yenileme").update({ deneme_sayisi: 0, son_hata: null, updated_at: new Date().toISOString() })
      .eq(yenilemeSahibi[0], yenilemeSahibi[1]).eq("product", link.product);
  }
  if (sonuc !== "recorded" && sonuc !== "duplicate" && sonuc !== "test") {
    console.error("[paytr-direkt] ödeme işlenmedi", b.merchant_oid, sonuc);
  }

  // Kart saklama: para çoktan kaydedildi; buradaki bir hata bildirimi düşürmez, yalnızca günlüğe gider.
  const utoken = alan("utoken");
  const odeyen: Odeyen | null = link.payer_organization_id ? { organizationId: link.payer_organization_id } : link.subscriber_id ? { subscriberId: link.subscriber_id } : null;
  if (islem.kart_sakla && utoken && odeyen) {
    try {
      await kartlariEsitle(admin, kimlik, {
        odeyen, product: link.product, utoken,
        onay: islem.otomatik_onay && islem.onay_at && islem.onay_ip && islem.onay_metni
          ? { at: islem.onay_at, ip: islem.onay_ip, metin: islem.onay_metni, kim: islem.onaylayan }
          : null,
      });
    } catch (hata) {
      console.error("[paytr-direkt] kart kaydedilemedi", b.merchant_oid, hata instanceof Error ? hata.message : hata);
    }
  }
  return "ok";
}

/*
  Bildirimde gelen utoken İMZASIZ: kartlar ondan değil, imzalı CAPI LIST
  yanıtından kaydediliyor. Bizim mağazamıza ait olmayan bir anahtar boş
  liste döndürür ve hiçbir şey yazılmaz. Yeni kart = listede olup bizde
  olmayan ctoken; otomatik yenileme o karta bağlanır.
*/
async function kartlariEsitle(admin: Admin, kimlik: PaytrCredentials, input: {
  odeyen: Odeyen; product: string; utoken: string;
  onay: { at: string; ip: string; metin: string; kim: string | null } | null;
}) {
  const liste = await kayitliKartlar(kimlik, input.utoken);
  if ("hata" in liste) throw new Error(liste.hata);
  if (!liste.kartlar.length) return;
  const [alan, deger] = odeyenSuzgeci(input.odeyen);
  const sahip: Record<string, string> = { [alan]: deger };
  const { data: mevcut, error } = await admin.from("paytr_kayitli_kartlar").select("id,ctoken").eq(alan, deger);
  if (error) throw new Error(error.message);
  const bilinen = new Set(((mevcut ?? []) as { ctoken: string }[]).map((k) => k.ctoken));
  const yeniler = liste.kartlar.filter((k) => !bilinen.has(k.ctoken));
  let yeniKartId: string | null = null;
  for (const k of yeniler) {
    const { data, error: ekleHatasi } = await admin.from("paytr_kayitli_kartlar").insert({
      ...sahip, utoken: input.utoken, ctoken: k.ctoken, son4: k.son4,
      banka: k.banka, program: k.program, kart_turu: k.tur, sema: k.sema, son_kullanma_ay: k.ay, son_kullanma_yil: k.yil,
    }).select("id").single();
    if (ekleHatasi) throw new Error(ekleHatasi.message);
    yeniKartId ??= data.id;
  }
  if (!input.onay || !yeniKartId) return;
  const satir = {
    ...sahip, product: input.product, kart_id: yeniKartId, aktif: true,
    onay_at: input.onay.at, onay_ip: input.onay.ip, onay_metni: input.onay.metin, onaylayan: input.onay.kim,
    kapatildi_at: null, kapatan: null, deneme_sayisi: 0, son_hata: null, updated_at: new Date().toISOString(),
  };
  const { data: var_, error: okumaHatasi } = await admin.from("paytr_otomatik_yenileme").select("id")
    .eq(alan, deger).eq("product", input.product).maybeSingle();
  if (okumaHatasi) throw new Error(okumaHatasi.message);
  const { error: yazmaHatasi } = var_
    ? await admin.from("paytr_otomatik_yenileme").update(satir).eq("id", var_.id)
    : await admin.from("paytr_otomatik_yenileme").insert(satir);
  if (yazmaHatasi) throw new Error(yazmaHatasi.message);
}

/** Platformun (ArvoOS) PayTR kimliği; kart yönetimi işlemleri için. */
export async function platformKimligi(admin: Admin): Promise<PaytrCredentials> {
  const platformId = await getPlatformOrganizationId();
  if (!platformId) throw new CheckoutError("unavailable", "Kartla ödeme şu an kullanılamıyor.");
  return paytrKimligi(admin, platformId, { acikOlmali: false });
}
