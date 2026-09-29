import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DOGRULAMA_ALANLARI,
  YANIT_ALAN_ADLARI,
  eksikDogrulamaAlanlari,
  formuldenDeger,
  formuluCoz,
  yanitiAyristir,
} from "@/lib/payments/garanti/yanit";

/*
  Banka ödeme sonucunu successurl'e POST ediyor. Bu yanıt DIŞ VERİ:
  adresi bilen herkes benzerini gönderebilir. Modül henüz doğrulama
  yapmıyor (hash tarifi elimizde yok) ama yapacağı işin zemini burada
  sabitleniyor — özellikle "eksik alanı boş kabul etme" kuralı, çünkü
  onu gevşetmek doğrulamayı hiç yapmamakla aynı kapıya çıkar.
*/

const YANIT = {
  mdstatus: "1",
  oid: "ef43ef579b97484d9f67d445e4b15b93",
  orderid: "ef43ef579b97484d9f67d445e4b15b93",
  response: "Approved",
  procreturncode: "00",
  txnamount: "10000",
  txncurrencycode: "949",
  terminalid: "30691297",
  hash: "ABC123",
  hashparams: "clientid:oid:mdstatus:txnamount",
  /* clientid + oid + mdstatus + txnamount, sırayla. */
  hashparamsval: "30691297ef43ef579b97484d9f67d445e4b15b93110000",
  clientid: "30691297",
};

describe("yanıt ayrıştırma", () => {
  test("belgedeki alanların hepsi tanınıyor", () => {
    assert.ok(YANIT_ALAN_ADLARI.includes("hashparamsval"));
    assert.ok(YANIT_ALAN_ADLARI.includes("mdstatus"));
    assert.equal(YANIT_ALAN_ADLARI.length, 32, "belgedeki tablo 32 alan");
  });

  test("tanınmayan alan ATILMIYOR, ekstraya konuyor", () => {
    /*
      Banka bir alan eklerse sessizce kaybolmasın: hash formülü
      (hashparams) o alanı sayıyor olabilir ve eksik alan doğrulamayı
      sebebi görünmeden düşürür.
    */
    const yanit = yanitiAyristir({ ...YANIT, yenialan: "42" });
    assert.equal(yanit.ekstra.yenialan, "42");
    assert.equal(yanit.mdstatus, "1");
  });

  test("URLSearchParams gövdesi de kabul ediliyor", () => {
    const yanit = yanitiAyristir(new URLSearchParams({ mdstatus: "1", oid: "x" }));
    assert.equal(yanit.mdstatus, "1");
    assert.equal(yanit.oid, "x");
  });

  test("metin olmayan değer metne çevriliyor", () => {
    assert.equal(yanitiAyristir({ mdstatus: 1 }).mdstatus, "1");
  });
});

describe("doğrulama alanları", () => {
  test("üçlü tam ise eksik yok", () => {
    assert.deepEqual(eksikDogrulamaAlanlari(yanitiAyristir(YANIT)), []);
  });

  test("biri bile eksikse ya da BOŞSA yakalanıyor", () => {
    /* Doğrulanamayan yanıt "ödendi" sayılamaz; eksikliği sessizce
       geçmek, doğrulamayı hiç yapmamakla aynı. */
    for (const alan of DOGRULAMA_ALANLARI) {
      const kopya: Record<string, string> = { ...YANIT };
      delete kopya[alan];
      assert.deepEqual(eksikDogrulamaAlanlari(yanitiAyristir(kopya)), [alan]);
      assert.deepEqual(eksikDogrulamaAlanlari(yanitiAyristir({ ...YANIT, [alan]: "   " })), [alan]);
    }
  });
});

describe("hash formülü", () => {
  test("iki nokta ile ayrılıyor, boşluklar atılıyor", () => {
    assert.deepEqual(formuluCoz("clientid:oid: mdstatus :txnamount"), ["clientid", "oid", "mdstatus", "txnamount"]);
    assert.deepEqual(formuluCoz("clientid::oid"), ["clientid", "oid"]);
    assert.deepEqual(formuluCoz(""), []);
  });

  test("formüldeki alanlar sırayla birleştiriliyor", () => {
    const yanit = yanitiAyristir(YANIT);
    assert.equal(formuldenDeger(yanit, "clientid:oid:mdstatus:txnamount").deger, YANIT.hashparamsval);
  });

  test("SIRA ÖNEMLİ", () => {
    const yanit = yanitiAyristir(YANIT);
    assert.notEqual(
      formuldenDeger(yanit, "oid:clientid:mdstatus:txnamount").deger,
      formuldenDeger(yanit, "clientid:oid:mdstatus:txnamount").deger,
    );
  });

  test("EKSİK ALAN BOŞ SAYILIYOR — ve hangisi olduğu bildiriliyor", () => {
    /*
      Önce "tanınmayan alan varsa null dön" diye yazmıştım ve bunu
      güvenlik özelliği sanmıştım; yanlıştı. Bankanın örnek kodu eksik
      alanı açıkça "" kabul ediyor ve formülün kendisi bazı işlemlerde
      boş kalan alanlar içeriyor (cavv, eci, md, rnd). Bankadan katı
      davranmak meşru yanıtları reddederdi.

      Katılık zaten gereksiz: özet mağaza anahtarıyla bitiyor, yani
      kapı hash'in kendisi. Eksik adlar günlük için dönüyor.
    */
    const sonuc = formuldenDeger(yanitiAyristir(YANIT), "clientid:bilinmeyen:oid");
    assert.equal(sonuc.deger, `${YANIT.clientid}${YANIT.oid}`);
    assert.deepEqual(sonuc.eksikAlanlar, ["bilinmeyen"]);
  });

  test("boş formül boş değer veriyor", () => {
    assert.deepEqual(formuldenDeger(yanitiAyristir(YANIT), ""), { deger: "", eksikAlanlar: [] });
  });

  test("ekstradaki alan da formülde kullanılabiliyor", () => {
    /* Banka yeni bir alan ekleyip formüle koyarsa çalışmaya devam etsin. */
    const yanit = yanitiAyristir({ ...YANIT, yenialan: "99" });
    assert.equal(formuldenDeger(yanit, "clientid:yenialan").deger, "3069129799");
  });

  test("sondaki iki nokta zararsız", () => {
    /* Bankanın örnek formülü iki noktayla bitiyor. */
    assert.equal(
      formuldenDeger(yanitiAyristir(YANIT), "clientid:oid:").deger,
      formuldenDeger(yanitiAyristir(YANIT), "clientid:oid").deger,
    );
  });
});
