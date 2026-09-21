// WhatsApp numarası bağlanırken Meta'ya sorulan doğrulama: hangi girdi
// ağa çıkmadan reddedilir, hangi Meta hatası kurumun anlayacağı cümleye
// çevrilir. Hatayı ham göstermek ekranda "OAuthException 190" bırakıyordu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyWhatsappNumber, whatsappErrorMessage, whatsappInputError, GRAPH_VERSION } from "../../lib/whatsapp-cloud";

const TOKEN = "x".repeat(60);

test("biçim hatası ağa çıkmadan yakalanır", () => {
  assert.match(whatsappInputError("abc", "123456", TOKEN)!, /Numara kimliği/);
  assert.match(whatsappInputError("123456", "abc", TOKEN)!, /WhatsApp Business hesap kimliği/);
  assert.match(whatsappInputError("123456", "123456", "kisa")!, /Erişim anahtarı eksik/);
  assert.equal(whatsappInputError("106540352242922", "102290129340398", TOKEN), null);
});

test("Meta hata kodları Türkçe karşılığını alır", () => {
  assert.match(whatsappErrorMessage({ code: 190 }, 401), /anahtarı geçersiz/);
  assert.match(whatsappErrorMessage({ code: 200 }, 403), /yetkisi yok/);
  assert.match(whatsappErrorMessage({ code: 100 }, 400), /Numara kimliği/);
  assert.match(whatsappErrorMessage({ code: 4 }, 429), /sınırlıyor/);
  // Bilinmeyen kod: Meta'nın kendi cümlesi gösterilir, kaybolmaz.
  assert.match(whatsappErrorMessage({ code: 999, message: "Something broke" }, 400), /Something broke/);
  assert.match(whatsappErrorMessage(undefined, 500), /HTTP 500/);
});

/** Sahte fetch: çağrıyı kaydeder, verilen yanıtı döner. */
function sahteGetir(yanit: { ok: boolean; durum?: number; govde: unknown }) {
  const cagrilar: { adres: string; secenek: RequestInit }[] = [];
  const getir = (async (adres: string | URL, secenek?: RequestInit) => {
    cagrilar.push({ adres: String(adres), secenek: secenek ?? {} });
    return { ok: yanit.ok, status: yanit.durum ?? (yanit.ok ? 200 : 400), json: async () => yanit.govde } as Response;
  }) as unknown as typeof fetch;
  return { getir, cagrilar };
}

test("doğrulama numarayı ve işletme adını döndürür", async () => {
  const { getir, cagrilar } = sahteGetir({ ok: true, govde: { id: "106540352242922", display_phone_number: "+90 507 437 05 07", verified_name: "AkademikMerkez" } });
  const sonuc = await verifyWhatsappNumber("106540352242922", TOKEN, getir);
  assert.equal(sonuc.ok, true);
  assert.equal(sonuc.ok && sonuc.number.verifiedName, "AkademikMerkez");
  assert.equal(cagrilar[0].adres, `https://graph.facebook.com/${GRAPH_VERSION}/106540352242922?fields=display_phone_number,verified_name`);
  assert.equal((cagrilar[0].secenek.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
});

test("Meta reddederse bağlantı kurulmaz ve sebep taşınır", async () => {
  const { getir } = sahteGetir({ ok: false, durum: 401, govde: { error: { code: 190, message: "Invalid OAuth access token" } } });
  const sonuc = await verifyWhatsappNumber("106540352242922", TOKEN, getir);
  assert.equal(sonuc.ok, false);
  assert.match(sonuc.ok ? "" : sonuc.error, /anahtarı geçersiz/);
});

test("200 dönse de hata gövdesi varsa başarısız sayılır", async () => {
  const { getir } = sahteGetir({ ok: true, govde: { error: { code: 100, message: "Unsupported get request" } } });
  const sonuc = await verifyWhatsappNumber("1", TOKEN, getir);
  assert.equal(sonuc.ok, false);
});

test("ağ hatası yutulur, kullanıcıya sebep gösterilir", async () => {
  const getir = (async () => { throw new Error("bağlanılamadı"); }) as unknown as typeof fetch;
  const sonuc = await verifyWhatsappNumber("1", TOKEN, getir);
  assert.equal(sonuc.ok, false);
  assert.match(sonuc.ok ? "" : sonuc.error, /ulaşılamadı: bağlanılamadı/);
});
