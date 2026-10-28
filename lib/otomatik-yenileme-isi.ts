import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutError, lisansOdemeHazirligi, oncekiBaglantiyiKapat } from "@/lib/license-checkout";
import { productName, type ProductCode } from "@/lib/products";
import { paketAdi } from "@/lib/paket-adlari";
import { yetkisiOlanlar } from "@/lib/kisi-yetkileri";
import { PLATFORM_HOST } from "@/lib/public-host";
import { PRODUCT_APPS } from "@/lib/site/routes";
import { arvolabClient } from "@/lib/arvolab";
import { bireyselAylikUcret } from "@/lib/bireysel-ucret";
import { platformKimligi } from "@/lib/paytr-kart-akisi";
import { getPlatformOrganizationId } from "@/lib/paytr-status";
import { kartSuresiGectiMi, paytrEpostasiUygunMu, PAYTR_ODEME_ADRESI, siparisNo, tekrarlayanOdemeAl } from "@/lib/paytr-direkt";
import type { PaytrCredentials } from "@/lib/paytr";
import { AZAMI_DENEME, turkiyeGunu, yenilemeBildirimi, yenilemeKarari } from "@/lib/otomatik-yenileme";

/*
  OTOMATİK YENİLEME İŞİ (28.10.2026). Zamanlanmış iş her sabah çağırır
  (app/api/cron/otomatik-yenileme). Karar saf modülde
  (lib/otomatik-yenileme.ts); burası okur, çeker ve bildirir.

  Lisans yine yalnızca PayTR BİLDİRİMİYLE uzar (lib/paytr-kart-akisi):
  buradaki istek yanıtı "başarılı" dese de dönem bildirimle uzuyor —
  ikisini ayrı yollardan uzatmak aynı ödemeyi iki kez saymaktır.

  Deneme sayacı PayTR'ye istek gitmeden ÖNCE artırılıyor: istek ile kayıt
  arasında iş düşerse ertesi tur "bu gün denendi" görür ve aynı gün
  ikinci kez çekim denemez. Fazla saymak, çift çekmekten iyidir.

  İki tür ödeyen: kurum (ArvoOS, ArvoLab, ArvoCal lisansı; bildirimi
  ArvoOS panelinde, lisans yöneticilerine) ve bireysel ArvoLab abonesi
  (bildirimi ArvoLab'daki kendi bildirimlerine; ArvoOS'ta hesabı yok).
*/

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

type Yenileme = {
  id: string; organization_id: string | null; subscriber_id: string | null; product: string; kart_id: string; onay_ip: string; onaylayan: string | null;
  deneme_sayisi: number; son_deneme_at: string | null; hatirlatilan_donem: string | null;
  paytr_kayitli_kartlar: { utoken: string; ctoken: string; son4: string; son_kullanma_ay: string | null; son_kullanma_yil: string | null } | null;
};

type Abone = { id: string; email: string; full_name: string | null; external_user_id: string; status: string; current_period_end: string | null; kurum_id: string | null };

export type YenilemeOzeti = { incelenen: number; hatirlatilan: number; cekilen: number; basarisiz: number; durdurulan: number; hatalar: string[] };

type Durma = "kart-suresi" | "deneme-bitti" | "cok-gecikti" | "kart-kapali" | "onay-gecersiz";

/* Kuruma: ArvoOS panelinde lisans yöneticilerine, yineleme anahtarlı. Aboneye: ArvoLab'daki kendi bildirimine. */
async function bildir(admin: Admin, y: Yenileme, abone: Abone | null, anahtar: string, metin: { baslik: string; metin: string }, ton: "bilgi" | "uyari" | "tehlike") {
  if (y.organization_id) {
    const { data: onceki, error } = await admin.from("notifications").select("id")
      .eq("organization_id", y.organization_id).eq("category", "subscription_reminder").eq("metadata->>anahtar", anahtar).limit(1);
    if (error) throw new Error(error.message);
    if (onceki?.length) return;
    const alicilar = [...await yetkisiOlanlar(admin, y.organization_id, "finance.lisans.yonet")];
    if (!alicilar.length) return;
    const { error: yazmaHatasi } = await admin.from("notifications").insert(alicilar.map((kullanici) => ({
      organization_id: y.organization_id, user_id: kullanici, audience: "organization", category: "subscription_reminder",
      title: metin.baslik, message: metin.metin, action_url: "/panel/billing", metadata: { anahtar, ton },
    })));
    if (yazmaHatasi) throw new Error(yazmaHatasi.message);
    return;
  }
  if (!abone) return;
  /* ArvoLab bildirimi: tür 'billing' (ArvoLab migration'ı). Yineleme denetimi
     burada değil, takvimde: hatırlatma dönem başına bir kez (hatirlatilan_donem),
     deneme günde bir kez (son_deneme_at). Köprü kapalıysa bildirim yazılamaz;
     günlüğe düşer, çekim kararını etkilemez. */
  const lab = arvolabClient();
  if (!lab) { console.warn("[otomatik-yenileme] ArvoLab köprüsü kapalı; abone bildirimi yazılamadı", anahtar); return; }
  const { error } = await lab.from("notifications").insert({
    user_id: abone.external_user_id, kind: "billing", title: metin.baslik.slice(0, 200), body: metin.metin.slice(0, 500), link: "/dashboard/abonelik",
  });
  if (error) console.error("[otomatik-yenileme] ArvoLab bildirimi yazılamadı", anahtar, error.message);
}

async function aboneOku(admin: Admin, id: string): Promise<Abone | null> {
  const { data, error } = await admin.from("product_subscribers").select("id,email,full_name,external_user_id,status,current_period_end,kurum_id").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Abone | null) ?? null;
}

async function donemSonu(admin: Admin, y: Yenileme, abone: Abone | null): Promise<string | null> {
  if (abone) return abone.status === "active" && !abone.kurum_id ? abone.current_period_end : null;
  if (!y.organization_id) return null;
  if (y.product === "arvoos") {
    const { data, error } = await admin.from("organization_licenses").select("license_status,current_period_end").eq("organization_id", y.organization_id).maybeSingle();
    if (error) throw new Error(error.message);
    // Deneme süresindeki kurumdan otomatik çekim yok: ilk ödeme kart formuyla, onaylı yapılır.
    return data && ["active", "past_due"].includes(data.license_status) ? data.current_period_end : null;
  }
  const { data, error } = await admin.from("organization_product_licenses").select("status,current_period_end").eq("organization_id", y.organization_id).eq("product", y.product).maybeSingle();
  if (error) throw new Error(error.message);
  return data && ["active", "past_due"].includes(data.status) ? data.current_period_end : null;
}

async function durdur(admin: Admin, y: Yenileme, abone: Abone | null, neden: Durma, bugun: string) {
  await admin.from("paytr_otomatik_yenileme").update({ aktif: false, kapatildi_at: new Date().toISOString(), kapatan: null, updated_at: new Date().toISOString() }).eq("id", y.id);
  await bildir(admin, y, abone, `otomatik:durdu:${y.id}:${bugun}`, yenilemeBildirimi({ tur: "durdu", urun: productName(y.product), neden }), "tehlike");
}

/* Çekim için gereken her şey: tutar, plan, PayTR kimliği, PayTR'ye giden müşteri bilgileri. */
type CekimHazirligi = {
  fee: number; baslik: string; planCode: string | null; platformId: string; credentials: PaytrCredentials;
  eposta: string; adSoyad: string; adres: string; telefon: string; donus: string;
};

async function cekimHazirligi(admin: Admin, y: Yenileme, abone: Abone | null): Promise<CekimHazirligi> {
  if (abone) {
    const { aylik } = await bireyselAylikUcret(admin, y.product);
    if (!aylik) throw new CheckoutError("fee_not_set", "bireysel ücret belirlenmedi");
    if (!paytrEpostasiUygunMu(abone.email)) throw new Error("abonenin e-postası ödeme altyapısına uygun değil");
    const [credentials, platformId] = await Promise.all([platformKimligi(admin), getPlatformOrganizationId()]);
    if (!platformId) throw new CheckoutError("unavailable", "platform kurumu yok");
    return {
      fee: aylik, baslik: `${productName(y.product)} · bireysel aylık abonelik · otomatik yenileme`, planCode: null, platformId, credentials,
      eposta: abone.email, adSoyad: (abone.full_name || abone.email.split("@")[0]).slice(0, 60), adres: "Türkiye", telefon: "0",
      donus: `${PRODUCT_APPS.arvolab.url}/dashboard/abonelik`,
    };
  }
  const urun = y.product as ProductCode;
  const { organization, fee, planCode, ekNot, platformId, credentials } = await lisansOdemeHazirligi(admin, y.organization_id!, urun);
  const [{ data: yasal, error: yasalHatasi }, kullanici] = await Promise.all([
    admin.from("organizations").select("legal_name,legal_address,legal_district,legal_city,contact_phone,contact_email").eq("id", y.organization_id!).maybeSingle(),
    y.onaylayan ? admin.auth.admin.getUserById(y.onaylayan) : Promise.resolve(null),
  ]);
  if (yasalHatasi || !yasal) throw new Error("kurum bilgileri okunamadı");
  const eposta = [kullanici?.data.user?.email, yasal.contact_email].find((e): e is string => Boolean(e) && paytrEpostasiUygunMu(e as string));
  if (!eposta) throw new Error("ödeme altyapısının kabul ettiği bir e-posta adresi yok");
  const adres = [yasal.legal_address, [yasal.legal_district, yasal.legal_city].filter(Boolean).join(" / ")].filter(Boolean).join(", ") || "Türkiye";
  return {
    fee, baslik: `${productName(urun)} · ${paketAdi(planCode)} aylık lisans${ekNot} · otomatik yenileme`, planCode, platformId, credentials,
    eposta, adSoyad: (yasal.legal_name || organization.display_name || organization.name).slice(0, 60),
    adres: adres.slice(0, 400), telefon: (yasal.contact_phone ?? "").replace(/[^\d+]/g, "").slice(0, 20) || "0",
    donus: `https://${PLATFORM_HOST}/panel/billing`,
  };
}

async function cek(admin: Admin, y: Yenileme, abone: Abone | null, kart: NonNullable<Yenileme["paytr_kayitli_kartlar"]>, bugun: string): Promise<"cekildi" | "basarisiz" | "durdu"> {
  const h = await cekimHazirligi(admin, y, abone);

  // Sayaç istekten ÖNCE (yukarıdaki gerekçe).
  const { error: sayacHatasi } = await admin.from("paytr_otomatik_yenileme")
    .update({ deneme_sayisi: y.deneme_sayisi + 1, son_deneme_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", y.id);
  if (sayacHatasi) throw new Error(sayacHatasi.message);

  // Ödeyen başına tek açık abonelik ödemesi (payment_links tekillik dizinleri).
  if (y.organization_id) await oncekiBaglantiyiKapat(admin, h.credentials, y.organization_id, y.product as ProductCode);
  else if (abone) await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("subscriber_id", abone.id).eq("product", y.product).eq("purpose", "subscription").eq("status", "active");

  const merchantOid = siparisNo(y.product);
  const { data: link, error: linkHatasi } = await admin.from("payment_links").insert({
    id: randomUUID(), organization_id: h.platformId, installment_id: null, purpose: "subscription", provider: "paytr",
    payer_organization_id: y.organization_id, subscriber_id: abone?.id ?? null, product: y.product, plan_code: h.planCode,
    provider_link_id: merchantOid, url: PAYTR_ODEME_ADRESI, amount: h.fee, status: "active",
    created_by: y.organization_id ? y.onaylayan : null, note: h.baslik.slice(0, 200),
  }).select("id").single();
  if (linkHatasi || !link) throw new Error("ödeme kaydı açılamadı: " + (linkHatasi?.message ?? ""));
  const { error: islemHatasi } = await admin.from("paytr_kart_islemleri").insert({
    merchant_oid: merchantOid, payment_link_id: link.id, tur: "otomatik", tutar: h.fee, kullanici_ip: y.onay_ip,
  });
  if (islemHatasi) throw new Error("deneme kaydı açılamadı: " + islemHatasi.message);

  const sonuc = await tekrarlayanOdemeAl(h.credentials, {
    kullaniciIp: y.onay_ip, siparisNo: merchantOid, eposta: h.eposta, tutarKurus: h.fee,
    adSoyad: h.adSoyad, adres: h.adres, telefon: h.telefon,
    sepet: [{ ad: h.baslik, kurus: h.fee, adet: 1 }],
    basariliAdres: h.donus, hataAdres: h.donus,
    utoken: kart.utoken, ctoken: kart.ctoken,
  });
  if (sonuc.durum !== "basarisiz") return "cekildi";

  // Başarısız istek: PayTR bildirim de gönderebilir; durum "bekliyor"dan çıktığı için bildirim yok sayılır.
  await admin.from("paytr_kart_islemleri").update({ durum: "basarisiz", hata_mesaji: sonuc.mesaj, sonuc_at: new Date().toISOString() }).eq("merchant_oid", merchantOid).eq("durum", "bekliyor");
  await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", link.id).eq("status", "active");
  await admin.from("paytr_otomatik_yenileme").update({ son_hata: sonuc.mesaj, updated_at: new Date().toISOString() }).eq("id", y.id);
  if (!sonuc.yenidenDenenebilir && !/devam eden/i.test(sonuc.mesaj)) {
    await durdur(admin, y, abone, "kart-kapali", bugun);
    return "durdu";
  }
  const kalan = Math.max(0, AZAMI_DENEME - (y.deneme_sayisi + 1));
  await bildir(admin, y, abone, `otomatik:basarisiz:${y.id}:${bugun}`, yenilemeBildirimi({ tur: "basarisiz", urun: productName(y.product), mesaj: sonuc.mesaj, kalanDeneme: kalan }), "uyari");
  return "basarisiz";
}

export async function otomatikYenilemeleriIsle(admin: Admin, bugun: string): Promise<YenilemeOzeti> {
  const ozet: YenilemeOzeti = { incelenen: 0, hatirlatilan: 0, cekilen: 0, basarisiz: 0, durdurulan: 0, hatalar: [] };
  // Bilerek SINIRSIZ: açık otomatik yenileme sayısı küçük ve biri atlanırsa o ödeyenin dönemi habersiz biter.
  const { data, error } = await admin.from("paytr_otomatik_yenileme")
    .select("id,organization_id,subscriber_id,product,kart_id,onay_ip,onaylayan,deneme_sayisi,son_deneme_at,hatirlatilan_donem,paytr_kayitli_kartlar(utoken,ctoken,son4,son_kullanma_ay,son_kullanma_yil)")
    .eq("aktif", true);
  if (error) throw new Error("Otomatik yenilemeler okunamadı: " + error.message);
  const ikiGunOnce = new Date(Date.now() - 2 * 86400000).toISOString();

  for (const y of (data ?? []) as unknown as Yenileme[]) {
    ozet.incelenen += 1;
    try {
      const kart = y.paytr_kayitli_kartlar;
      if (!kart) continue;
      const abone = y.subscriber_id ? await aboneOku(admin, y.subscriber_id) : null;
      if (y.subscriber_id && (!abone || abone.kurum_id || abone.status === "canceled")) {
        /* Kuruma geçen ya da hesabını silen abone: kendi adına çekim artık çift
           tahsilat ya da sahipsiz çekim olur. Bildirim gitmeden kapanır. */
        await admin.from("paytr_otomatik_yenileme").update({ aktif: false, kapatildi_at: new Date().toISOString(), kapatan: null, updated_at: new Date().toISOString() }).eq("id", y.id);
        ozet.durdurulan += 1;
        continue;
      }
      const [alan, deger] = y.organization_id ? ["payment_links.payer_organization_id", y.organization_id] : ["payment_links.subscriber_id", y.subscriber_id!];
      const [son, { count: bekleyen, error: bekleyenHatasi }] = await Promise.all([
        donemSonu(admin, y, abone),
        admin.from("paytr_kart_islemleri").select("merchant_oid,payment_links!inner(payer_organization_id,subscriber_id,product)", { count: "exact", head: true })
          .eq("tur", "otomatik").eq("durum", "bekliyor").gte("created_at", ikiGunOnce)
          .eq(alan, deger).eq("payment_links.product", y.product),
      ]);
      if (bekleyenHatasi) throw new Error(bekleyenHatasi.message);
      const karar = yenilemeKarari({
        donemSonu: son, bugun, denemeSayisi: y.deneme_sayisi,
        sonDenemeGunu: y.son_deneme_at ? turkiyeGunu(y.son_deneme_at) : null,
        hatirlatilanDonem: y.hatirlatilan_donem,
        kartSuresiGecti: kartSuresiGectiMi({ ay: kart.son_kullanma_ay ?? "", yil: kart.son_kullanma_yil ?? "" }, bugun),
        bekleyenCekim: (bekleyen ?? 0) > 0,
      });
      if (karar.tur === "bekle") continue;
      if (karar.tur === "durdur") {
        await durdur(admin, y, abone, karar.neden, bugun);
        ozet.durdurulan += 1;
        continue;
      }
      if (karar.tur === "hatirlat") {
        let tutar: number | null = null;
        try { tutar = (await cekimHazirligi(admin, y, abone)).fee; } catch (h) { if (!(h instanceof CheckoutError)) throw h; }
        await bildir(admin, y, abone, `otomatik:hatirlat:${y.id}:${karar.donem}`,
          yenilemeBildirimi({ tur: "hatirlat", urun: productName(y.product), donem: karar.donem, tutar, son4: kart.son4 }), "bilgi");
        await admin.from("paytr_otomatik_yenileme").update({ hatirlatilan_donem: karar.donem, updated_at: new Date().toISOString() }).eq("id", y.id);
        ozet.hatirlatilan += 1;
        continue;
      }
      /* Onaylayan kullanıcı silinmişse (onaylayan: on delete set null) kurumun ödeme kaydı açılamaz
         (payment_links_creator_check) ve onayın sahibi de artık yok: çekim denenmez, durur.
         Bireysel abonede onaylayan zaten boş (ArvoOS'ta hesabı yok); kanıt an + IP + metin. */
      if (y.organization_id && !y.onaylayan) {
        await durdur(admin, y, abone, "onay-gecersiz", bugun);
        ozet.durdurulan += 1;
        continue;
      }
      const sonuc = await cek(admin, y, abone, kart, bugun);
      if (sonuc === "cekildi") ozet.cekilen += 1;
      else if (sonuc === "durdu") ozet.durdurulan += 1;
      else ozet.basarisiz += 1;
    } catch (hata) {
      ozet.hatalar.push(`${y.organization_id ?? y.subscriber_id}/${y.product}: ${hata instanceof Error ? hata.message : String(hata)}`);
    }
  }
  return ozet;
}
