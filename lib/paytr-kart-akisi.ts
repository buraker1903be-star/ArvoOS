import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutError, lisansOdemeHazirligi, oncekiBaglantiyiKapat } from "@/lib/license-checkout";
import { paytrKimligi } from "@/lib/payments/kimlik";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { PLATFORM_HOST } from "@/lib/public-host";
import { productName, type ProductCode } from "@/lib/products";
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

/* Kabul edilen metnin kendisi kayda giriyor: ileride metin değişirse eski
   onayın neye verildiği yine okunabilsin. Sürüm öneki o yüzden var. */
export const OTOMATIK_YENILEME_ONAY_METNI =
  "v1 · Kartımın kaydedilmesini ve aboneliğimin her dönem sonunda bu karttan otomatik yenilenmesini kabul ediyorum. " +
  "Her çekimden en az 3 gün önce e-postayla bilgilendirileceğimi, otomatik yenilemeyi ve kayıtlı kartı Ödeme ve Lisans " +
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

export async function kurumUtokeni(admin: Admin, organizationId: string): Promise<string | null> {
  const { data, error } = await admin.from("paytr_kayitli_kartlar").select("utoken").eq("organization_id", organizationId).limit(1).maybeSingle();
  if (error) throw new Error("Kayıtlı kart okunamadı: " + error.message);
  return data?.utoken ?? null;
}

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
export async function kartOnayiniKaydet(admin: Admin, input: {
  merchantOid: string; organizationId: string; actorId: string; ip: string; otomatikYenileme: boolean;
}): Promise<void> {
  const { data: islem, error } = await admin.from("paytr_kart_islemleri")
    .select("merchant_oid,durum,payment_link_id,payment_links!inner(payer_organization_id)")
    .eq("merchant_oid", input.merchantOid).maybeSingle();
  if (error) throw new Error("Ödeme okunamadı: " + error.message);
  const sahip = (islem?.payment_links as unknown as { payer_organization_id: string | null } | null)?.payer_organization_id;
  if (!islem || sahip !== input.organizationId) throw new Error("Ödeme bulunamadı.");
  if (islem.durum !== "bekliyor") throw new Error("Bu ödeme artık beklemede değil; sayfayı yenileyin.");
  const { error: yazmaHatasi } = await admin.from("paytr_kart_islemleri").update(input.otomatikYenileme
    ? { kart_sakla: true, otomatik_onay: true, onay_at: new Date().toISOString(), onay_ip: input.ip, onay_metni: OTOMATIK_YENILEME_ONAY_METNI, onaylayan: input.actorId }
    : { kart_sakla: false, otomatik_onay: false, onay_at: null, onay_ip: null, onay_metni: null, onaylayan: null })
    .eq("merchant_oid", input.merchantOid).eq("durum", "bekliyor");
  if (yazmaHatasi) throw new Error("Onay kaydedilemedi: " + yazmaHatasi.message);
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
  if (sonuc !== "recorded" && sonuc !== "duplicate" && sonuc !== "test") {
    console.error("[paytr-direkt] ödeme işlenmedi", b.merchant_oid, sonuc);
  }

  // Kart saklama: para çoktan kaydedildi; buradaki bir hata bildirimi düşürmez, yalnızca günlüğe gider.
  const utoken = alan("utoken");
  if (islem.kart_sakla && utoken && link.payer_organization_id) {
    try {
      await kartlariEsitle(admin, kimlik, {
        organizationId: link.payer_organization_id, product: link.product, utoken,
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
  organizationId: string; product: string; utoken: string;
  onay: { at: string; ip: string; metin: string; kim: string | null } | null;
}) {
  const liste = await kayitliKartlar(kimlik, input.utoken);
  if ("hata" in liste) throw new Error(liste.hata);
  if (!liste.kartlar.length) return;
  const { data: mevcut, error } = await admin.from("paytr_kayitli_kartlar").select("id,ctoken").eq("organization_id", input.organizationId);
  if (error) throw new Error(error.message);
  const bilinen = new Set(((mevcut ?? []) as { ctoken: string }[]).map((k) => k.ctoken));
  const yeniler = liste.kartlar.filter((k) => !bilinen.has(k.ctoken));
  let yeniKartId: string | null = null;
  for (const k of yeniler) {
    const { data, error: ekleHatasi } = await admin.from("paytr_kayitli_kartlar").insert({
      organization_id: input.organizationId, utoken: input.utoken, ctoken: k.ctoken, son4: k.son4,
      banka: k.banka, program: k.program, kart_turu: k.tur, sema: k.sema, son_kullanma_ay: k.ay, son_kullanma_yil: k.yil,
    }).select("id").single();
    if (ekleHatasi) throw new Error(ekleHatasi.message);
    yeniKartId ??= data.id;
  }
  if (!input.onay || !yeniKartId) return;
  const satir = {
    organization_id: input.organizationId, product: input.product, kart_id: yeniKartId, aktif: true,
    onay_at: input.onay.at, onay_ip: input.onay.ip, onay_metni: input.onay.metin, onaylayan: input.onay.kim,
    kapatildi_at: null, kapatan: null, deneme_sayisi: 0, son_hata: null, updated_at: new Date().toISOString(),
  };
  const { data: var_, error: okumaHatasi } = await admin.from("paytr_otomatik_yenileme").select("id")
    .eq("organization_id", input.organizationId).eq("product", input.product).maybeSingle();
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
