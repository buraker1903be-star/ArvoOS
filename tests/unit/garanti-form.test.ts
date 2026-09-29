import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, test } from "node:test";
import { API_SURUMU, TEST_UCU, kartliPesinSatisFormu, pesinSatisFormu, siparisNumarasi } from "@/lib/payments/garanti/form";
import { TRY_KODU, hashData } from "@/lib/payments/garanti/imza";
import { YANIT_ALAN_ADLARI } from "@/lib/payments/garanti/yanit";

const GIRDI = {
  kip: "TEST" as const,
  terminalId: "30691297",
  terminalMerchantId: "7000679",
  terminalProvUserId: "PROVAUT",
  terminalUserId: "GARANTI",
  provizyonSifresi: "123qweASD",
  storeKey: "12345678",
  orderId: "ef43ef579b97484d9f67d445e4b15b93",
  tutarKurus: 10000,
  successUrl: "https://akademikmerkez.com/odeme/tamam",
  errorUrl: "https://akademikmerkez.com/odeme/hata",
  companyName: "Akademik Merkez",
};

describe("3D peşin satış formu", () => {
  test("alan adları bankanın yanıt tablosuyla tutuyor", () => {
    /*
      Yanıt tablosu bu alanları "işlem yapılırken gönderilen …" diye
      tarif ediyor; istekte başka bir adla gönderirsek banka sessizce
      reddeder. Adları uydurmadığımızın kanıtı bu test.
    */
    const { alanlar } = pesinSatisFormu({ ...GIRDI, musteriEposta: "a@b.com", musteriIp: "1.2.3.4", kartSahibiAdi: "Ada", refreshTime: 5 });
    const tanimsiz = Object.keys(alanlar).filter((ad) => !(YANIT_ALAN_ADLARI as string[]).includes(ad));
    assert.deepEqual(tanimsiz, [], "yanıt tablosunda karşılığı olmayan alan");
  });

  test("zorunlu alanlar yerinde", () => {
    const { alanlar, ucAdresi } = pesinSatisFormu(GIRDI);
    assert.equal(ucAdresi, TEST_UCU);
    assert.equal(alanlar.mode, "TEST");
    assert.equal(alanlar.apiversion, API_SURUMU);
    assert.equal(alanlar.secure3dsecuritylevel, "3D_PAY");
    assert.equal(alanlar.txntype, "sales");
    assert.equal(alanlar.txnamount, "10000");
    assert.equal(alanlar.txncurrencycode, String(TRY_KODU));
    assert.equal(alanlar.txninstallmentcount, "0");
    assert.equal(alanlar.lang, "tr");
  });

  test("İMZA, FORMDAKİ DEĞERLERİN AYNISINDAN üretiliyor", () => {
    /*
      En sinsi kusur: taksit ya da tutar formda bir, imzada başka
      hesaplanırsa banka "imza hatalı" der ve sebebi görünmez. İkisi de
      tek yerden üretiliyor; test bunu dışarıdan doğruluyor.
    */
    const { alanlar } = pesinSatisFormu({ ...GIRDI, taksit: 3 });
    assert.equal(alanlar.txninstallmentcount, "3");
    assert.equal(alanlar.secure3dhash, hashData({
      terminalId: GIRDI.terminalId,
      orderId: GIRDI.orderId,
      amount: 10000,
      currencyCode: TRY_KODU,
      successUrl: GIRDI.successUrl,
      errorUrl: GIRDI.errorUrl,
      type: "sales",
      installmentMetni: "3",
      storeKey: GIRDI.storeKey,
      provizyonSifresi: GIRDI.provizyonSifresi,
    }));
  });

  test("taksit değişince imza da değişiyor", () => {
    const a = pesinSatisFormu(GIRDI).alanlar.secure3dhash;
    const b = pesinSatisFormu({ ...GIRDI, taksit: 6 }).alanlar.secure3dhash;
    assert.notEqual(a, b);
  });

  test("tek çekimde boş dizge seçeneği FORMA VE İMZAYA birlikte gidiyor", () => {
    /*
      Bankanın 3D örneği tek çekimde "0", GOSAS'ın XML yolu boş dizge
      kullanıyor; hangisinin 3D formunda geçerli olduğu belgeden
      anlaşılmıyor. Seçenek tek bir yerden geçiyor ki form bir şey,
      imza başka bir şey taşımasın — asıl kusur o olurdu.
    */
    const { alanlar } = pesinSatisFormu({ ...GIRDI, tekCekimBosGitsin: true });
    assert.equal(alanlar.txninstallmentcount, "");
    assert.equal(alanlar.secure3dhash, hashData({
      terminalId: GIRDI.terminalId, orderId: GIRDI.orderId, amount: 10000,
      currencyCode: TRY_KODU, successUrl: GIRDI.successUrl, errorUrl: GIRDI.errorUrl,
      type: "sales", installmentMetni: "", storeKey: GIRDI.storeKey,
      provizyonSifresi: GIRDI.provizyonSifresi,
    }));
    /* Taksitli işlemde seçenek etkisiz. */
    assert.equal(pesinSatisFormu({ ...GIRDI, taksit: 3, tekCekimBosGitsin: true }).alanlar.txninstallmentcount, "3");
  });

  test("VARSAYILAN YOLDA kart alanı yok", () => {
    /*
      Kart taşıyan yol ayrı bir ada sahip (kartliPesinSatisFormu):
      PCI kapsamına girmek bilinçli bir karar olsun ve "PAN nereden
      geçiyor" sorusu tek bir grep'e insin.
    */
    const { alanlar } = pesinSatisFormu(GIRDI);
    for (const ad of ["cardnumber", "cardcvv2", "cardexpiredatemonth", "cardexpiredateyear"]) {
      assert.equal(alanlar[ad], undefined, ad);
    }
  });

  test("boş isteğe bağlı alan hiç konmuyor", () => {
    const { alanlar } = pesinSatisFormu({ ...GIRDI, musteriEposta: "   ", kartSahibiAdi: "" });
    assert.ok(!("customeremailaddress" in alanlar));
    assert.ok(!("cardholdername" in alanlar));
  });

  test("ÜRETİM kipinde adres tahmin edilmiyor", () => {
    /*
      Belgeden üretim ucunu okuyamadım. Tahmin etmek, canlıda yanlış
      bir sunucuya ödeme göndermeye çalışmak olurdu.
    */
    assert.throws(() => pesinSatisFormu({ ...GIRDI, kip: "PROD" }), /açıkça verilmeli/);
    const { ucAdresi } = pesinSatisFormu({ ...GIRDI, kip: "PROD", uretimUcu: "https://ornek/gt3dengine" });
    assert.equal(ucAdresi, "https://ornek/gt3dengine");
  });

  test("boş zorunlu alan yakalanıyor", () => {
    for (const alan of ["terminalMerchantId", "terminalProvUserId", "terminalUserId", "companyName", "successUrl", "errorUrl"] as const) {
      assert.throws(() => pesinSatisFormu({ ...GIRDI, [alan]: "  " }), new RegExp(alan));
    }
  });

  test("sipariş numarası belgedeki biçimde ve her denemede yeni", () => {
    /* Banka aynı orderid'yi ikinci kez kabul etmiyor: 3D'den düşen bir
       ödemenin tekrarı eski numarayla gönderilemez. */
    const a = siparisNumarasi(randomUUID());
    const b = siparisNumarasi(randomUUID());
    assert.match(a, /^[0-9a-f]{32}$/);
    assert.notEqual(a, b);
  });
});

const KART = { numara: "4242424242424242", ay: 3, yil: 2027, cvv: "123" };

describe("kart taşıyan form", () => {
  test("alan adları GOSAS'ın [FormElement] öznitelikleriyle aynı", () => {
    const { alanlar } = kartliPesinSatisFormu(GIRDI, KART);
    assert.equal(alanlar.cardnumber, "4242424242424242");
    assert.equal(alanlar.cardcvv2, "123");
    assert.equal(alanlar.cardexpiredatemonth, "03");
    assert.equal(alanlar.cardexpiredateyear, "27");
  });

  test("son kullanma tarihi İKİ AYRI ALAN, tek MMYY değil", () => {
    const { alanlar } = kartliPesinSatisFormu(GIRDI, KART);
    assert.ok(!("cardexpiredate" in alanlar));
    assert.equal(alanlar.cardexpiredatemonth.length, 2);
    assert.equal(alanlar.cardexpiredateyear.length, 2);
  });

  test("iki haneli yıl da kabul ediliyor", () => {
    assert.equal(kartliPesinSatisFormu(GIRDI, { ...KART, yil: 27 }).alanlar.cardexpiredateyear, "27");
  });

  test("kart numarasındaki boşluklar atılıyor", () => {
    assert.equal(kartliPesinSatisFormu(GIRDI, { ...KART, numara: "4242 4242 4242 4242" }).alanlar.cardnumber, "4242424242424242");
  });

  test("imza kart bilgisinden ETKİLENMİYOR", () => {
    /* Hash formülünde kart yok; kartlı ve kartsız form aynı imzayı
       taşımalı, yoksa biri yanlış hesaplanıyor demektir. */
    assert.equal(kartliPesinSatisFormu(GIRDI, KART).alanlar.secure3dhash, pesinSatisFormu(GIRDI).alanlar.secure3dhash);
  });

  test("bozuk kart reddediliyor ve DEĞER hata mesajına sızmıyor", () => {
    /*
      Kart numarasını istisna mesajına koymak, onu günlüklere, hata
      izleyicisine ve destek ekranlarına taşımak demek.
    */
    const kotular = [
      { ...KART, numara: "4242" },
      { ...KART, numara: "4242424242424242424242" },
      { ...KART, ay: 0 },
      { ...KART, ay: 13 },
      { ...KART, cvv: "12" },
      { ...KART, cvv: "abcd" },
    ];
    for (const kart of kotular) {
      assert.throws(() => kartliPesinSatisFormu(GIRDI, kart), (hata: Error) => {
        assert.ok(!hata.message.includes(kart.numara), "kart numarası mesaja sızmış");
        assert.ok(!hata.message.includes(kart.cvv), "CVV mesaja sızmış");
        return true;
      });
    }
  });
});
