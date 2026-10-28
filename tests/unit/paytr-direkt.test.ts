import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { KART_ALANLARI, odemeFormuAlanlari, paytrEpostasiUygunMu, paytrSepeti, paytrTutari, siparisNo } from "@/lib/paytr-direkt";

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
