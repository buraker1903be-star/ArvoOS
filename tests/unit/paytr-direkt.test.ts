import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { basarisizlikAciklamasi, tekrarlayanOdemeAlanlari, tekrarlayanYanitiniCoz, capiListeImzasi, capiSilImzasi, direktBildirimDogruMu, kartListesiniCoz, kartSuresiGectiMi, KART_ALANLARI, kayitliKartAlanlari, odemeFormuAlanlari, paytrEpostasiUygunMu, paytrSepeti, paytrTutari, siparisNo } from "@/lib/paytr-direkt";

/* PayTR Direkt API ödeme formu: imza sırası, tutar biçimi, kart saklama alanları. */

const KIMLIK = { merchantId: "123456", merchantKey: "anahtar", merchantSalt: "tuz" };
const GIRDI = {
  kullaniciIp: "85.105.1.2",
  siparisNo: "ARVOOS1",
  eposta: "ali@ornek.com",
  tutarKurus: 239000,
  adSoyad: "Ali Veli",
  adres: "Yakuplu Mah. İstanbul",
  telefon: "05555555555",
  sepet: [{ ad: "ArvoOS Başlangıç (1 ay)", kurus: 239000, adet: 1 }],
  basariliAdres: "https://app.arvo-os.com/panel/billing?odeme=tamam",
  hataAdres: "https://app.arvo-os.com/panel/billing?odeme=hata",
};

describe("PayTR Direkt API ödeme formu", () => {
  test("tutar nokta ondalıklı ve iki haneli; kayan nokta yok", () => {
    assert.equal(paytrTutari(239000), "2390.00");
    assert.equal(paytrTutari(10099), "100.99");
    assert.equal(paytrTutari(5), "0.05");
    assert.throws(() => paytrTutari(0));
    assert.throws(() => paytrTutari(10.5));
  });

  test("imza belgedeki sırayla, sonuna salt eklenerek üretilir", () => {
    const a = odemeFormuAlanlari(KIMLIK, GIRDI);
    const mesaj = "123456" + "85.105.1.2" + "ARVOOS1" + "ali@ornek.com" + "2390.00" + "card" + "0" + "TL" + "0" + "0" + "tuz";
    assert.equal(a.paytr_token, createHmac("sha256", "anahtar").update(mesaj).digest("base64"));
    assert.equal(a.payment_amount, "2390.00", "imzadaki tutar formdakiyle aynı metin olmalı");
    assert.equal(a.non_3d, "0", "ilk ödeme 3D Secure ile");
  });

  test("kart alanları sunucunun ürettiği alanlarda YOK", () => {
    const a = odemeFormuAlanlari(KIMLIK, GIRDI);
    for (const alan of KART_ALANLARI) assert.equal(alan in a, false, `${alan} sunucudan üretilmemeli`);
  });

  test("kart saklama: ilk kartta yalnızca store_card, sonrakinde utoken da", () => {
    assert.equal("store_card" in odemeFormuAlanlari(KIMLIK, GIRDI), false);
    const ilk = odemeFormuAlanlari(KIMLIK, { ...GIRDI, kartiSakla: true });
    assert.equal(ilk.store_card, "1");
    assert.equal("utoken" in ilk, false);
    const ikinci = odemeFormuAlanlari(KIMLIK, { ...GIRDI, kartiSakla: true, utoken: "UT123" });
    assert.equal(ikinci.utoken, "UT123");
    assert.throws(() => odemeFormuAlanlari(KIMLIK, { ...GIRDI, utoken: "UT123" }), /kart saklanırken/);
  });

  test("kısıtlar: e-posta, sipariş no, taksit, dönüş adresi", () => {
    assert.equal(paytrEpostasiUygunMu("şule@ornek.com"), false);
    assert.equal(paytrEpostasiUygunMu("sule@ornek.com"), true);
    assert.throws(() => odemeFormuAlanlari(KIMLIK, { ...GIRDI, eposta: "çağrı@x.co" }), /Türkçe/);
    assert.throws(() => odemeFormuAlanlari(KIMLIK, { ...GIRDI, siparisNo: "ARV-1" }), /alfanümerik/);
    assert.throws(() => odemeFormuAlanlari(KIMLIK, { ...GIRDI, taksit: 1 }), /Taksit/);
    assert.throws(() => odemeFormuAlanlari(KIMLIK, { ...GIRDI, basariliAdres: "http://x.co" }), /https/);
  });

  test("sipariş no alfanümerik, en fazla 64, benzersiz", () => {
    const a = siparisNo("arvoos-lisans");
    assert.match(a, /^[A-Z0-9]{1,64}$/);
    assert.notEqual(a, siparisNo("arvoos-lisans"));
  });

  test("sepet belgedeki biçimde", () => {
    assert.equal(paytrSepeti([{ ad: "X", kurus: 5000, adet: 1 }]), JSON.stringify([["X", "50.00", 1]]));
  });
});

describe("Direkt API bildirimi", () => {
  const imza = (oid: string, durum: string, tutar: string) =>
    createHmac("sha256", "anahtar").update(oid + "tuz" + durum + tutar).digest("base64");

  test("doğru hash kabul edilir; tutar, durum ya da sipariş no değişirse reddedilir", () => {
    const b = { merchant_oid: "ARV1", status: "success", total_amount: "239000", hash: imza("ARV1", "success", "239000") };
    assert.equal(direktBildirimDogruMu(KIMLIK, b), true);
    assert.equal(direktBildirimDogruMu(KIMLIK, { ...b, total_amount: "1" }), false);
    assert.equal(direktBildirimDogruMu(KIMLIK, { ...b, status: "failed" }), false);
    assert.equal(direktBildirimDogruMu(KIMLIK, { ...b, merchant_oid: "ARV2" }), false);
    assert.equal(direktBildirimDogruMu({ ...KIMLIK, merchantSalt: "baska" }, b), false);
  });

  test("tanınmayan durum ya da boş hash reddedilir", () => {
    assert.equal(direktBildirimDogruMu(KIMLIK, { merchant_oid: "ARV1", status: "x", total_amount: "0", hash: imza("ARV1", "x", "0") }), false);
    assert.equal(direktBildirimDogruMu(KIMLIK, { merchant_oid: "ARV1", status: "failed", total_amount: "0", hash: "" }), false);
  });

  test("başarısızlık kodları anlaşılır metne; 10 ve 99 bizim hatamız", () => {
    assert.equal(basarisizlikAciklamasi("0", "Kartın limiti yetersiz").metin, "Kartın limiti yetersiz");
    assert.equal(basarisizlikAciklamasi("99", "").bizim, true);
    assert.equal(basarisizlikAciklamasi("10", "").bizim, true);
    assert.equal(basarisizlikAciklamasi("6", "").bizim, false);
  });
});

describe("Kayıtlı karttan ödeme", () => {
  const G = { ...GIRDI, utoken: "UT1", ctoken: "CT1", cvvGerekli: true };

  test("utoken, ctoken ve require_cvv gider; kart numarası ve store_card gitmez; imza aynı formül", () => {
    const a = kayitliKartAlanlari(KIMLIK, G);
    assert.deepEqual([a.utoken, a.ctoken, a.require_cvv], ["UT1", "CT1", "1"]);
    assert.equal("store_card" in a, false);
    for (const alan of KART_ALANLARI) assert.equal(alan in a, false);
    assert.equal(a.paytr_token, odemeFormuAlanlari(KIMLIK, GIRDI).paytr_token, "imza alanları ilk ödemeyle aynı");
    assert.equal(kayitliKartAlanlari(KIMLIK, { ...G, cvvGerekli: false }).require_cvv, "0");
  });

  test("anahtar eksikse istek kurulmaz", () => {
    assert.throws(() => kayitliKartAlanlari(KIMLIK, { ...G, ctoken: "" }), /eksik/);
  });
});

describe("Kayıtlı kart listesi ve silme", () => {
  test("imzalar: liste utoken+salt, silme ctoken+utoken+salt", () => {
    assert.equal(capiListeImzasi(KIMLIK, "UT1"), createHmac("sha256", "anahtar").update("UT1tuz").digest("base64"));
    assert.equal(capiSilImzasi(KIMLIK, "UT1", "CT1"), createHmac("sha256", "anahtar").update("CT1UT1tuz").digest("base64"));
  });

  test("liste yanıtı: kartlar, boş ve hata birbirinden ayrı", () => {
    const r = kartListesiniCoz([{ ctoken: "CT1", last_4: "4358", require_cvv: "1", month: "12", year: "30", c_bank: "Yapı Kredi", c_brand: "world", c_type: "credit", businessCard: "n", schema: "VISA" }]);
    assert.ok("kartlar" in r);
    if ("kartlar" in r) {
      assert.equal(r.kartlar.length, 1);
      assert.deepEqual([r.kartlar[0].son4, r.kartlar[0].cvvGerekli, r.kartlar[0].tur, r.kartlar[0].sirketKarti], ["4358", true, "credit", false]);
    }
    assert.deepEqual(kartListesiniCoz({}), { kartlar: [] });
    assert.deepEqual(kartListesiniCoz({ status: "error", err_msg: "Bağlantı hatası" }), { hata: "Bağlantı hatası" });
    // ctoken'ı olmayan bozuk satır atlanır.
    assert.deepEqual(kartListesiniCoz([{ last_4: "1111" }]), { kartlar: [] });
  });

  test("kartın süresi ayın sonunda biter", () => {
    assert.equal(kartSuresiGectiMi({ ay: "10", yil: "26" }, "2026-10-31"), false);
    assert.equal(kartSuresiGectiMi({ ay: "10", yil: "26" }, "2026-11-01"), true);
    assert.equal(kartSuresiGectiMi({ ay: "12", yil: "30" }, "2026-10-28"), false);
  });
});

describe("Kayıtlı karttan tekrarlayan ödeme", () => {
  const G = { ...GIRDI, utoken: "UT1", ctoken: "CT1" };

  test("non_3d=1 ve recurring_payment=1; imzada non_3d 1 olarak yer alır", () => {
    const a = tekrarlayanOdemeAlanlari(KIMLIK, G);
    assert.deepEqual([a.non_3d, a.recurring_payment, a.utoken, a.ctoken], ["1", "1", "UT1", "CT1"]);
    assert.equal("require_cvv" in a, false);
    for (const alan of KART_ALANLARI) assert.equal(alan in a, false);
    const mesaj = "123456" + "85.105.1.2" + "ARVOOS1" + "ali@ornek.com" + "2390.00" + "card" + "0" + "TL" + "0" + "1" + "tuz";
    assert.equal(a.paytr_token, createHmac("sha256", "anahtar").update(mesaj).digest("base64"));
  });

  test("yanıt: başarılı, bildirim bekleniyor, yeniden denenebilir ve kapalı kart ayrı", () => {
    assert.deepEqual(tekrarlayanYanitiniCoz({ status: "success" }), { durum: "basarili" });
    assert.deepEqual(tekrarlayanYanitiniCoz({ status: "wait_callback" }), { durum: "bildirim-bekleniyor" });
    assert.deepEqual(tekrarlayanYanitiniCoz({ status: "failed", msg: "Devam eden işlem", try_again: true }), { durum: "basarisiz", mesaj: "Devam eden işlem", yenidenDenenebilir: true });
    assert.deepEqual(tekrarlayanYanitiniCoz({ status: "failed", msg: "Kart banka tarafından kapatılmış", try_again: false }), { durum: "basarisiz", mesaj: "Kart banka tarafından kapatılmış", yenidenDenenebilir: false });
    // Belirsiz yanıtta yeniden deneme yok.
    assert.equal((tekrarlayanYanitiniCoz({}) as { yenidenDenenebilir: boolean }).yenidenDenenebilir, false);
  });
});
