import { createHmac, randomBytes } from "node:crypto";
import type { PaytrCredentials } from "@/lib/paytr";

/*
  PayTR DİREKT API — ödeme formu (28.10.2026, kart saklama hazırlığı).

  Kaynak: PayTR Direkt API "1. Bölüm: Ödeme formundan bilgilerin alınarak
  aktarılması" ve Kart Saklama API "Yeni kart ekleme" (kurum sahibinin
  ilettiği metinler). Bugünkü kartla ödeme "Link ile Ödeme" API'siyle
  (lib/paytr.ts); kart saklama ve kayıtlı karttan çekim yalnızca Direkt
  API'de var, ikisi ayrı istemci.

  KART BİLGİSİ SUNUCUMUZA GELMEZ. Kart alanlarını taşıyan form tarayıcıdan
  DOĞRUDAN https://www.paytr.com/odeme adresine gönderilir (belgenin açık
  uyarısı: "Üye iş yerinin kendi sunucusuna POST kesinlikle
  yapılmamalıdır"). Sunucu yalnızca gizli alanları ve imzayı üretir; kart
  numarası, CVV ve son kullanma tarihi hiçbir zaman bu modülden, bir
  sunucu işleminden ya da günlükten geçmez.

  BAŞARILI SAYFASI ONAY DEĞİL. PayTR asenkron: müşteri merchant_ok_url'e
  döndüğünde ödeme henüz kesinleşmemiştir, sonuç Bildirim URL'ine gelir.
  Lisans yalnızca doğrulanmış bildirimde uzar.

  Saf modül (yalnızca node:crypto); testi tests/unit/paytr-direkt.test.ts.
*/

export const PAYTR_ODEME_ADRESI = "https://www.paytr.com/odeme";

/* Formda tarayıcının doldurduğu kart alanlarının adları. Sunucu bu adları
   ÜRETMEZ ve okumaz; yalnızca bileşen formu kurarken kullanır. */
export const KART_ALANLARI = ["cc_owner", "card_number", "expiry_month", "expiry_year", "cvv"] as const;

/** base64(HMAC_SHA256(merchant_key, mesaj)) — PayTR'nin bütün imzaları (lib/paytr.ts ile aynı). */
function imzala(merchantKey: string, mesaj: string) {
  return createHmac("sha256", merchantKey).update(mesaj, "utf8").digest("base64");
}

/*
  Tutar PayTR'ye nokta ondalıklı ve iki haneli gider ("1500.35"). İmzada
  ve formda AYNI metin kullanılmalı: imzada "150", formda "150.00" olursa
  PayTR imzayı reddeder. Kuruştan üretiliyor; kayan nokta yok.
*/
export function paytrTutari(kurus: number): string {
  if (!Number.isInteger(kurus) || kurus <= 0) throw new Error("Ödeme tutarı geçersiz.");
  return `${Math.floor(kurus / 100)}.${String(kurus % 100).padStart(2, "0")}`;
}

/* Sipariş no: alfanümerik, en fazla 64, her işlemde benzersiz. Önek ürünü
   ve işi ayırt etsin diye (bildirimde ilk bakılan alan). */
export function siparisNo(onek: string): string {
  const temiz = onek.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "ARV";
  return `${temiz}${Date.now().toString(36)}${randomBytes(8).toString("hex")}`.slice(0, 64).toUpperCase();
}

/* E-posta Türkçe karakter içermemeli (belgedeki kısıt). Böyle bir adres
   PayTR'de hatayla döner; müşteriye anlaşılır mesajı önceden verelim. */
export const paytrEpostasiUygunMu = (eposta: string) =>
  eposta.length > 0 && eposta.length <= 100 && /^[\x21-\x7e]+@[\x21-\x7e]+\.[\x21-\x7e]+$/.test(eposta);

export type SepetKalemi = { ad: string; kurus: number; adet: number };

/** Sepet: [["ad", "birim fiyat", adet], …] JSON'u (belgedeki örnek). */
export function paytrSepeti(kalemler: SepetKalemi[]): string {
  if (!kalemler.length) throw new Error("Sepet boş olamaz.");
  return JSON.stringify(kalemler.map((k) => [k.ad.slice(0, 200), paytrTutari(k.kurus), k.adet]));
}

export type OdemeFormuGirdisi = {
  kullaniciIp: string;
  siparisNo: string;
  eposta: string;
  tutarKurus: number;
  /** 0 = tek çekim. */
  taksit?: number;
  paraBirimi?: "TL" | "EUR" | "USD";
  adSoyad: string;
  adres: string;
  telefon: string;
  sepet: SepetKalemi[];
  basariliAdres: string;
  hataAdres: string;
  dil?: "tr" | "en";
  testModu?: boolean;
  /*
    Kart saklama (Kart Saklama API, "yeni kart ekleme"): müşteri onay
    kutusunu işaretlediyse store_card=1. Müşterinin daha önce kaydedilmiş
    kartı varsa utoken DE gönderilir — gönderilmezse PayTR yeni bir
    kullanıcı anahtarı üretir ve müşterinin kartları tek anahtar altında
    toplanmaz.
  */
  kartiSakla?: boolean;
  utoken?: string | null;
};

const SINIR = (deger: string, en: number, ad: string) => {
  if (!deger) throw new Error(`${ad} boş olamaz.`);
  if (deger.length > en) throw new Error(`${ad} en fazla ${en} karakter olabilir.`);
  return deger;
};

/**
 * Ödeme formunun GİZLİ alanları ve imzası. Kart alanları burada yok:
 * onları tarayıcı doldurur ve form doğrudan PayTR'ye gider.
 *
 * İmza sırası (belge): merchant_id + user_ip + merchant_oid + email +
 * payment_amount + payment_type + installment_count + currency +
 * test_mode + non_3d, sonuna merchant_salt.
 */
export function odemeFormuAlanlari(kimlik: PaytrCredentials, g: OdemeFormuGirdisi): Record<string, string> {
  if (!/^[A-Za-z0-9]{1,64}$/.test(g.siparisNo)) throw new Error("Sipariş numarası alfanümerik ve en fazla 64 karakter olmalı.");
  if (!paytrEpostasiUygunMu(g.eposta)) throw new Error("E-posta adresi Türkçe karakter içermemeli ve en fazla 100 karakter olmalı.");
  const taksit = g.taksit ?? 0;
  if (![0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].includes(taksit)) throw new Error("Taksit sayısı geçersiz.");
  if (g.utoken && !g.kartiSakla) throw new Error("Kayıtlı kullanıcı anahtarı yalnızca kart saklanırken gönderilir.");
  for (const adres of [g.basariliAdres, g.hataAdres]) {
    if (!/^https:\/\//.test(adres) || adres.length > 400) throw new Error("Dönüş adresleri tam https adresi ve en fazla 400 karakter olmalı.");
  }

  const alanlar: Record<string, string> = {
    merchant_id: kimlik.merchantId,
    user_ip: SINIR(g.kullaniciIp, 39, "Müşteri IP adresi"),
    merchant_oid: g.siparisNo,
    email: g.eposta,
    payment_amount: paytrTutari(g.tutarKurus),
    payment_type: "card",
    installment_count: String(taksit),
    currency: g.paraBirimi ?? "TL",
    test_mode: g.testModu ? "1" : "0",
    // İlk ödeme ve kart kaydı 3D Secure ile; 3D'siz çekim yalnızca kayıtlı karttan otomatik yenilemede.
    non_3d: "0",
    client_lang: g.dil ?? "tr",
    merchant_ok_url: g.basariliAdres,
    merchant_fail_url: g.hataAdres,
    user_name: SINIR(g.adSoyad.trim(), 60, "Ad soyad"),
    user_address: SINIR(g.adres.trim(), 400, "Adres"),
    user_phone: SINIR(g.telefon.trim(), 20, "Telefon"),
    user_basket: paytrSepeti(g.sepet),
    debug_on: "1",
  };
  if (g.kartiSakla) {
    alanlar.store_card = "1";
    if (g.utoken) alanlar.utoken = g.utoken;
  }
  const mesaj = alanlar.merchant_id + alanlar.user_ip + alanlar.merchant_oid + alanlar.email + alanlar.payment_amount
    + alanlar.payment_type + alanlar.installment_count + alanlar.currency + alanlar.test_mode + alanlar.non_3d;
  alanlar.paytr_token = imzala(kimlik.merchantKey, mesaj + kimlik.merchantSalt);
  return alanlar;
}
