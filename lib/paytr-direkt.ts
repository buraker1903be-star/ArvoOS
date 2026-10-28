import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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

/*
  BİLDİRİM URL (Direkt API "2. Bölüm"). PayTR her işlemin sonucunu
  mağaza panelinde tanımlı TEK adrese POST eder; yanıt yalnızca düz
  "OK" olmalı, yoksa PayTR yeniden dener ve işlem panelde "Devam
  Ediyor" kalır. Aynı işlem birden çok kez bildirilebilir: yalnızca ilki
  işlenir, tekrarlar merchant_oid ile tanınır.

  hash = base64(HMAC_SHA256(merchant_key, merchant_oid + merchant_salt +
  status + total_amount)). Belge formülü örnek koda bırakıyor; bu sıra
  Link API bildiriminin (lib/paytr.ts) callback_id'siz hâli. Test
  ödemesi panelde "Başarılı" görünene kadar formül doğrulanmış SAYILMAZ:
  yanlışsa bildirim reddedilir (sessiz kabul değil, sessiz ret).
*/
export type DirektBildirim = {
  merchant_oid: string;
  status: string;
  total_amount: string;
  hash: string;
};

export function direktBildirimDogruMu(kimlik: PaytrCredentials, b: DirektBildirim): boolean {
  if (!b.merchant_oid || !b.hash || (b.status !== "success" && b.status !== "failed")) return false;
  const beklenen = Buffer.from(imzala(kimlik.merchantKey, b.merchant_oid + kimlik.merchantSalt + b.status + b.total_amount));
  const gelen = Buffer.from(b.hash);
  return beklenen.length === gelen.length && timingSafeEqual(beklenen, gelen);
}

/*
  Başarısızlık kodlarının müşteriye/kurucuya söylenecek karşılığı (belgedeki
  tablo). 0'da PayTR'nin kendi mesajı (ör. "limit yetersiz") kullanılır;
  99 entegrasyon hatası — müşteriye değil bize ait, ayrıca günlüğe düşmeli.
*/
export function basarisizlikAciklamasi(kod: string, mesaj: string): { metin: string; bizim: boolean } {
  switch (kod) {
    case "1": case "2": return { metin: "Kart doğrulaması (SMS şifresi) tamamlanmadı.", bizim: false };
    case "3": case "11": return { metin: "Ödeme güvenlik kontrolünden geçmedi.", bizim: false };
    case "6": return { metin: "Ödeme tamamlanmadan sayfadan çıkıldı.", bizim: false };
    case "8": return { metin: "Bu karta taksit yapılamıyor.", bizim: false };
    case "9": return { metin: "Bu kartla işlem yetkisi bulunmuyor.", bizim: false };
    case "10": return { metin: "Bu işlemde 3D Secure gerekiyor.", bizim: true };
    case "99": return { metin: "Ödeme altyapısında teknik bir hata oluştu.", bizim: true };
    default: return { metin: mesaj.trim().slice(0, 300) || "Ödeme onaylanmadı.", bizim: false };
  }
}

/*
  KAYITLI KARTTAN ÖDEME (Kart Saklama API, "Kayıtlı karttan ödeme alma").
  İmza ilk ödemeyle AYNI formül; istekte ek olarak müşterinin utoken'ı,
  seçilen kartın ctoken'ı ve require_cvv gider. require_cvv CAPI LIST'ten
  gelir: 1 ise müşteriden CVV istenir — o durumda form yine tarayıcıdan
  doğrudan PayTR'ye gönderilmeli (CVV bir kart bilgisidir, sunucumuza
  gelmez). Kart numarası bu istekte hiç yok.
*/
export type KayitliKartGirdisi = Omit<OdemeFormuGirdisi, "kartiSakla" | "utoken"> & {
  utoken: string;
  ctoken: string;
  /** CAPI LIST'in kart için döndürdüğü değer. */
  cvvGerekli: boolean;
};

export function kayitliKartAlanlari(kimlik: PaytrCredentials, g: KayitliKartGirdisi): Record<string, string> {
  if (!g.utoken || !g.ctoken) throw new Error("Kayıtlı kart bilgisi eksik.");
  // Temel alanlar kart saklamasız kurulur: kayıtlı karttan ödemede store_card gitmez.
  const { paytr_token: _eski, ...temel } = odemeFormuAlanlari(kimlik, { ...g, kartiSakla: false, utoken: null });
  void _eski;
  const alanlar: Record<string, string> = { ...temel, utoken: g.utoken, ctoken: g.ctoken, require_cvv: g.cvvGerekli ? "1" : "0" };
  const mesaj = alanlar.merchant_id + alanlar.user_ip + alanlar.merchant_oid + alanlar.email + alanlar.payment_amount
    + alanlar.payment_type + alanlar.installment_count + alanlar.currency + alanlar.test_mode + alanlar.non_3d;
  alanlar.paytr_token = imzala(kimlik.merchantKey, mesaj + kimlik.merchantSalt);
  return alanlar;
}

/*
  KAYITLI KART LİSTESİ VE SİLME (Kart Saklama API, CAPI LIST / CAPI DELETE).

  İmzalar:
   - LIST:   base64(HMAC_SHA256(merchant_key, utoken + merchant_salt))
   - DELETE: base64(HMAC_SHA256(merchant_key, ctoken + utoken + merchant_salt))
  Belge sırayı örnek koda bırakıyor. LIST'te tek değişken olduğu için
  sıra belli; DELETE'teki sıra PayTR'nin örnek kodlarından bilinen sıra
  ve test mağazasında "paytr_token geçersiz" dönmediği görülene kadar
  doğrulanmış sayılmaz. Yanlış imza sessiz kabul üretmez: PayTR
  status=error döndürür ve kart silinmeden kalır, kullanıcıya hata yazılır.

  Sunucudan sunucuya istek: utoken ve ctoken birer sır gibi davranır
  (karttan çekim yapmaya yarar), tarayıcıya gönderilmez.
*/
export const CAPI_LIST_ADRESI = "https://www.paytr.com/odeme/capi/list";
export const CAPI_SIL_ADRESI = "https://www.paytr.com/odeme/capi/delete";

export type KayitliKart = {
  ctoken: string;
  son4: string;
  cvvGerekli: boolean;
  ay: string;
  yil: string;
  banka: string | null;
  adSoyad: string | null;
  program: string | null;
  tur: "credit" | "debit" | null;
  sirketKarti: boolean;
  sema: string | null;
};

export const capiListeImzasi = (kimlik: PaytrCredentials, utoken: string) => imzala(kimlik.merchantKey, utoken + kimlik.merchantSalt);
export const capiSilImzasi = (kimlik: PaytrCredentials, utoken: string, ctoken: string) =>
  imzala(kimlik.merchantKey, ctoken + utoken + kimlik.merchantSalt);

const metin = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/*
  LIST yanıtı: kart dizisi; eşleşme yoksa BOŞ JSON; hatada status=error.
  "Boş" ile "hata" ayrı tutuluyor: okunamayan listeyi "kayıtlı kartınız
  yok" diye göstermek, kartı olan müşteriye yeni kart girdirmek olurdu.
*/
export function kartListesiniCoz(yanit: unknown): { kartlar: KayitliKart[] } | { hata: string } {
  if (yanit && typeof yanit === "object" && !Array.isArray(yanit)) {
    const o = yanit as Record<string, unknown>;
    if (o.status === "error") return { hata: metin(o.err_msg) ?? "Kayıtlı kartlar okunamadı." };
  }
  const dizi = Array.isArray(yanit) ? yanit : yanit && typeof yanit === "object" ? Object.values(yanit as object) : [];
  const kartlar: KayitliKart[] = [];
  for (const k of dizi) {
    if (!k || typeof k !== "object") continue;
    const r = k as Record<string, unknown>;
    const ctoken = metin(r.ctoken);
    const son4 = metin(r.last_4);
    if (!ctoken || !son4) continue;
    kartlar.push({
      ctoken,
      son4,
      cvvGerekli: String(r.require_cvv ?? "") === "1",
      ay: metin(r.month) ?? "",
      yil: metin(r.year) ?? "",
      banka: metin(r.c_bank),
      adSoyad: metin(r.c_name),
      program: metin(r.c_brand),
      tur: r.c_type === "credit" || r.c_type === "debit" ? r.c_type : null,
      sirketKarti: r.businessCard === "y",
      sema: metin(r.schema),
    });
  }
  return { kartlar };
}

/* Kartın son kullanma ayı geçti mi (Türkiye günüyle; kart ayın son günü
   biter). Süresi geçmiş karttan otomatik çekim denenmez. */
export function kartSuresiGectiMi(kart: Pick<KayitliKart, "ay" | "yil">, bugun: string): boolean {
  const ay = Number(kart.ay);
  const yil = 2000 + Number(kart.yil.slice(-2));
  if (!Number.isInteger(ay) || ay < 1 || ay > 12 || !Number.isInteger(yil)) return false;
  const [by, bm] = bugun.split("-").map(Number);
  return by > yil || (by === yil && bm > ay);
}

async function formPost(adres: string, alanlar: Record<string, string>): Promise<unknown> {
  const yanit = await fetch(adres, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(alanlar).toString(),
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const govde = await yanit.text();
  if (!govde.trim()) return {};
  try {
    return JSON.parse(govde);
  } catch {
    throw new Error(`PayTR beklenmeyen yanıt verdi (HTTP ${yanit.status}).`);
  }
}

export async function kayitliKartlar(kimlik: PaytrCredentials, utoken: string) {
  return kartListesiniCoz(await formPost(CAPI_LIST_ADRESI, {
    merchant_id: kimlik.merchantId, utoken, paytr_token: capiListeImzasi(kimlik, utoken),
  }));
}

export async function kayitliKartiSil(kimlik: PaytrCredentials, utoken: string, ctoken: string): Promise<void> {
  const yanit = (await formPost(CAPI_SIL_ADRESI, {
    merchant_id: kimlik.merchantId, utoken, ctoken, paytr_token: capiSilImzasi(kimlik, utoken, ctoken),
  })) as Record<string, unknown>;
  if (yanit.status !== "success") throw new Error(`Kart silinemedi: ${metin(yanit.err_msg) ?? "bilinmeyen hata"}`);
}

/*
  KAYITLI KARTTAN TEKRARLAYAN ÖDEME (Kart Saklama API, "Recurring payment").

  Sunucudan sunucuya, formsuz: non_3d=1 ve recurring_payment=1. Müşteriden
  hiçbir şey istenmez; bu yüzden YALNIZCA müşterinin açıkça onay verdiği
  otomatik yenilemede çağrılır (onay kaydı veritabanında). Mağazada Non3D
  yetkisi açık olmalı.

  Yanıt hemen JSON döner; kesin sonuç yine Bildirim URL'ine gelir ve
  lisans YALNIZCA bildirimle uzar. Buradaki yanıt yalnızca "yeniden
  denemeli mi" kararı için:
   - success / wait_callback → bildirimi bekle
   - failed + try_again=true → aynı kart sonra yeniden denenebilir
     ("devam eden işleminiz var")
   - failed + try_again=false → bu karttan bir daha DENENMEZ (belgenin
     örneği: "Kart banka tarafından kapatılmış"); müşteriye kart
     güncelleme bildirimi gider.

  user_ip: otomatik çekimde müşteri o an bizde değil; onayın verildiği
  andaki IP gönderilir (onay kaydında saklı).
*/
export type TekrarlayanGirdi = Omit<KayitliKartGirdisi, "cvvGerekli" | "taksit">;
export type TekrarlayanSonuc =
  | { durum: "basarili" | "bildirim-bekleniyor" }
  | { durum: "basarisiz"; mesaj: string; yenidenDenenebilir: boolean };

export function tekrarlayanOdemeAlanlari(kimlik: PaytrCredentials, g: TekrarlayanGirdi): Record<string, string> {
  const { paytr_token: _eski, ...alanlar } = kayitliKartAlanlari(kimlik, { ...g, cvvGerekli: false });
  void _eski;
  delete alanlar.require_cvv;
  alanlar.non_3d = "1";
  alanlar.recurring_payment = "1";
  const mesaj = alanlar.merchant_id + alanlar.user_ip + alanlar.merchant_oid + alanlar.email + alanlar.payment_amount
    + alanlar.payment_type + alanlar.installment_count + alanlar.currency + alanlar.test_mode + alanlar.non_3d;
  alanlar.paytr_token = imzala(kimlik.merchantKey, mesaj + kimlik.merchantSalt);
  return alanlar;
}

export function tekrarlayanYanitiniCoz(yanit: unknown): TekrarlayanSonuc {
  const o = (yanit && typeof yanit === "object" ? yanit : {}) as Record<string, unknown>;
  if (o.status === "success") return { durum: "basarili" };
  if (o.status === "wait_callback") return { durum: "bildirim-bekleniyor" };
  // try_again yalnızca açıkça true ise: belirsiz bir hatada kapalı karttan tekrar tekrar çekim denemek bankada kötü iz bırakır.
  const yeniden = o.try_again === true || o.try_again === "true";
  return { durum: "basarisiz", mesaj: metin(o.msg) ?? metin(o.reason) ?? metin(o.err_msg) ?? "Ödeme alınamadı.", yenidenDenenebilir: yeniden };
}

export async function tekrarlayanOdemeAl(kimlik: PaytrCredentials, g: TekrarlayanGirdi): Promise<TekrarlayanSonuc> {
  return tekrarlayanYanitiniCoz(await formPost(PAYTR_ODEME_ADRESI, tekrarlayanOdemeAlanlari(kimlik, g)));
}
