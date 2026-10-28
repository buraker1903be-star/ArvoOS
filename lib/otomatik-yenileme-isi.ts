import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CheckoutError, lisansOdemeHazirligi, oncekiBaglantiyiKapat } from "@/lib/license-checkout";
import { productName, type ProductCode } from "@/lib/products";
import { paketAdi } from "@/lib/paket-adlari";
import { yetkisiOlanlar } from "@/lib/kisi-yetkileri";
import { PLATFORM_HOST } from "@/lib/public-host";
import { kartSuresiGectiMi, paytrEpostasiUygunMu, PAYTR_ODEME_ADRESI, siparisNo, tekrarlayanOdemeAl } from "@/lib/paytr-direkt";
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

  Kapsam: kurum lisansları (ArvoOS, ArvoLab, ArvoCal). Bireysel ArvoLab
  abonesi ödemesini ArvoLab'da yapıyor; o yol ayrı bir adımda.
*/

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

type Yenileme = {
  id: string; organization_id: string; product: string; kart_id: string; onay_ip: string; onaylayan: string | null;
  deneme_sayisi: number; son_deneme_at: string | null; hatirlatilan_donem: string | null;
  paytr_kayitli_kartlar: { utoken: string; ctoken: string; son4: string; son_kullanma_ay: string | null; son_kullanma_yil: string | null } | null;
};

export type YenilemeOzeti = { incelenen: number; hatirlatilan: number; cekilen: number; basarisiz: number; durdurulan: number; hatalar: string[] };

async function bildir(admin: Admin, organizationId: string, anahtar: string, metin: { baslik: string; metin: string }, ton: "bilgi" | "uyari" | "tehlike") {
  const { data: onceki, error } = await admin.from("notifications").select("id")
    .eq("organization_id", organizationId).eq("category", "subscription_reminder").eq("metadata->>anahtar", anahtar).limit(1);
  if (error) throw new Error(error.message);
  if (onceki?.length) return;
  const alicilar = [...await yetkisiOlanlar(admin, organizationId, "finance.lisans.yonet")];
  if (!alicilar.length) return;
  const { error: yazmaHatasi } = await admin.from("notifications").insert(alicilar.map((kullanici) => ({
    organization_id: organizationId, user_id: kullanici, audience: "organization", category: "subscription_reminder",
    title: metin.baslik, message: metin.metin, action_url: "/panel/billing", metadata: { anahtar, ton },
  })));
  if (yazmaHatasi) throw new Error(yazmaHatasi.message);
}

async function donemSonu(admin: Admin, organizationId: string, product: string): Promise<string | null> {
  if (product === "arvoos") {
    const { data, error } = await admin.from("organization_licenses").select("license_status,current_period_end").eq("organization_id", organizationId).maybeSingle();
    if (error) throw new Error(error.message);
    // Deneme süresindeki kurumdan otomatik çekim yok: ilk ödeme kart formuyla, onaylı yapılır.
    return data && ["active", "past_due"].includes(data.license_status) ? data.current_period_end : null;
  }
  const { data, error } = await admin.from("organization_product_licenses").select("status,current_period_end").eq("organization_id", organizationId).eq("product", product).maybeSingle();
  if (error) throw new Error(error.message);
  return data && ["active", "past_due"].includes(data.status) ? data.current_period_end : null;
}

async function durdur(admin: Admin, y: Yenileme, neden: "kart-suresi" | "deneme-bitti" | "cok-gecikti" | "kart-kapali" | "onay-gecersiz", bugun: string) {
  await admin.from("paytr_otomatik_yenileme").update({ aktif: false, kapatildi_at: new Date().toISOString(), kapatan: null, updated_at: new Date().toISOString() }).eq("id", y.id);
  await bildir(admin, y.organization_id, `otomatik:durdu:${y.id}:${bugun}`, yenilemeBildirimi({ tur: "durdu", urun: productName(y.product), neden }), "tehlike");
}

async function cek(admin: Admin, y: Yenileme, kart: NonNullable<Yenileme["paytr_kayitli_kartlar"]>, bugun: string): Promise<"cekildi" | "basarisiz" | "durdu"> {
  const urun = y.product as ProductCode;
  const { organization, fee, planCode, ekNot, platformId, credentials } = await lisansOdemeHazirligi(admin, y.organization_id, urun);
  const [{ data: yasal, error: yasalHatasi }, kullanici] = await Promise.all([
    admin.from("organizations").select("legal_name,legal_address,legal_district,legal_city,contact_phone,contact_email").eq("id", y.organization_id).maybeSingle(),
    y.onaylayan ? admin.auth.admin.getUserById(y.onaylayan) : Promise.resolve(null),
  ]);
  if (yasalHatasi || !yasal) throw new Error("kurum bilgileri okunamadı");
  const eposta = [kullanici?.data.user?.email, yasal.contact_email].find((e): e is string => Boolean(e) && paytrEpostasiUygunMu(e as string));
  if (!eposta) throw new Error("ödeme altyapısının kabul ettiği bir e-posta adresi yok");

  // Sayaç istekten ÖNCE (yukarıdaki gerekçe).
  const { error: sayacHatasi } = await admin.from("paytr_otomatik_yenileme")
    .update({ deneme_sayisi: y.deneme_sayisi + 1, son_deneme_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", y.id);
  if (sayacHatasi) throw new Error(sayacHatasi.message);

  await oncekiBaglantiyiKapat(admin, credentials, y.organization_id, urun);
  const merchantOid = siparisNo(urun);
  const baslik = `${productName(urun)} · ${paketAdi(planCode)} aylık lisans${ekNot} · otomatik yenileme`;
  const { data: link, error: linkHatasi } = await admin.from("payment_links").insert({
    id: randomUUID(), organization_id: platformId, installment_id: null, purpose: "subscription", provider: "paytr",
    payer_organization_id: y.organization_id, product: urun, plan_code: planCode, provider_link_id: merchantOid,
    url: PAYTR_ODEME_ADRESI, amount: fee, status: "active", created_by: y.onaylayan, note: baslik.slice(0, 200),
  }).select("id").single();
  if (linkHatasi || !link) throw new Error("ödeme kaydı açılamadı: " + (linkHatasi?.message ?? ""));
  const { error: islemHatasi } = await admin.from("paytr_kart_islemleri").insert({
    merchant_oid: merchantOid, payment_link_id: link.id, tur: "otomatik", tutar: fee, kullanici_ip: y.onay_ip,
  });
  if (islemHatasi) throw new Error("deneme kaydı açılamadı: " + islemHatasi.message);

  const adres = [yasal.legal_address, [yasal.legal_district, yasal.legal_city].filter(Boolean).join(" / ")].filter(Boolean).join(", ") || "Türkiye";
  const sonuc = await tekrarlayanOdemeAl(credentials, {
    kullaniciIp: y.onay_ip, siparisNo: merchantOid, eposta, tutarKurus: fee,
    adSoyad: (yasal.legal_name || organization.display_name || organization.name).slice(0, 60),
    adres: adres.slice(0, 400), telefon: (yasal.contact_phone ?? "").replace(/[^\d+]/g, "").slice(0, 20) || "0",
    sepet: [{ ad: baslik, kurus: fee, adet: 1 }],
    basariliAdres: `https://${PLATFORM_HOST}/panel/billing`, hataAdres: `https://${PLATFORM_HOST}/panel/billing`,
    utoken: kart.utoken, ctoken: kart.ctoken,
  });
  if (sonuc.durum !== "basarisiz") return "cekildi";

  // Başarısız istek: PayTR bildirim de gönderebilir; durum zaten "bekliyor"dan çıkarsa bildirim yok sayılır.
  await admin.from("paytr_kart_islemleri").update({ durum: "basarisiz", hata_mesaji: sonuc.mesaj, sonuc_at: new Date().toISOString() }).eq("merchant_oid", merchantOid).eq("durum", "bekliyor");
  await admin.from("payment_links").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", link.id).eq("status", "active");
  await admin.from("paytr_otomatik_yenileme").update({ son_hata: sonuc.mesaj, updated_at: new Date().toISOString() }).eq("id", y.id);
  if (!sonuc.yenidenDenenebilir && !/devam eden/i.test(sonuc.mesaj)) {
    await durdur(admin, y, "kart-kapali", bugun);
    return "durdu";
  }
  const kalan = Math.max(0, AZAMI_DENEME - (y.deneme_sayisi + 1));
  await bildir(admin, y.organization_id, `otomatik:basarisiz:${y.id}:${bugun}`, yenilemeBildirimi({ tur: "basarisiz", urun: productName(y.product), mesaj: sonuc.mesaj, kalanDeneme: kalan }), "uyari");
  return "basarisiz";
}

export async function otomatikYenilemeleriIsle(admin: Admin, bugun: string): Promise<YenilemeOzeti> {
  const ozet: YenilemeOzeti = { incelenen: 0, hatirlatilan: 0, cekilen: 0, basarisiz: 0, durdurulan: 0, hatalar: [] };
  // Bilerek SINIRSIZ: açık otomatik yenileme sayısı küçük ve biri atlanırsa o kurumun dönemi habersiz biter.
  const { data, error } = await admin.from("paytr_otomatik_yenileme")
    .select("id,organization_id,product,kart_id,onay_ip,onaylayan,deneme_sayisi,son_deneme_at,hatirlatilan_donem,paytr_kayitli_kartlar(utoken,ctoken,son4,son_kullanma_ay,son_kullanma_yil)")
    .eq("aktif", true).not("organization_id", "is", null);
  if (error) throw new Error("Otomatik yenilemeler okunamadı: " + error.message);
  const ikiGunOnce = new Date(Date.now() - 2 * 86400000).toISOString();

  for (const y of (data ?? []) as unknown as Yenileme[]) {
    ozet.incelenen += 1;
    try {
      const kart = y.paytr_kayitli_kartlar;
      if (!kart) continue;
      const [son, { count: bekleyen, error: bekleyenHatasi }] = await Promise.all([
        donemSonu(admin, y.organization_id, y.product),
        admin.from("paytr_kart_islemleri").select("merchant_oid,payment_links!inner(payer_organization_id,product)", { count: "exact", head: true })
          .eq("tur", "otomatik").eq("durum", "bekliyor").gte("created_at", ikiGunOnce)
          .eq("payment_links.payer_organization_id", y.organization_id).eq("payment_links.product", y.product),
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
        await durdur(admin, y, karar.neden, bugun);
        ozet.durdurulan += 1;
        continue;
      }
      if (karar.tur === "hatirlat") {
        let tutar: number | null = null;
        try { tutar = (await lisansOdemeHazirligi(admin, y.organization_id, y.product as ProductCode)).fee; } catch (h) { if (!(h instanceof CheckoutError)) throw h; }
        await bildir(admin, y.organization_id, `otomatik:hatirlat:${y.id}:${karar.donem}`,
          yenilemeBildirimi({ tur: "hatirlat", urun: productName(y.product), donem: karar.donem, tutar, son4: kart.son4 }), "bilgi");
        await admin.from("paytr_otomatik_yenileme").update({ hatirlatilan_donem: karar.donem, updated_at: new Date().toISOString() }).eq("id", y.id);
        ozet.hatirlatilan += 1;
        continue;
      }
      /* Onaylayan kullanıcı silinmişse (onaylayan: on delete set null) ödeme kaydı açılamaz
         (payment_links_creator_check) ve onayın sahibi de artık yok: çekim denenmez, durur. */
      if (!y.onaylayan) {
        await durdur(admin, y, "onay-gecersiz", bugun);
        ozet.durdurulan += 1;
        continue;
      }
      const sonuc = await cek(admin, y, kart, bugun);
      if (sonuc === "cekildi") ozet.cekilen += 1;
      else if (sonuc === "durdu") ozet.durdurulan += 1;
      else ozet.basarisiz += 1;
    } catch (hata) {
      ozet.hatalar.push(`${y.organization_id}/${y.product}: ${hata instanceof Error ? hata.message : String(hata)}`);
    }
  }
  return ozet;
}
