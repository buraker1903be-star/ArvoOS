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
    assert.equal(formuldenDeger(yanit, "clientid:oid:mdstatus:txnamount"), YANIT.hashparamsval);
  });

  test("SIRA ÖNEMLİ", () => {
    const yanit = yanitiAyristir(YANIT);
    assert.notEqual(
      formuldenDeger(yanit, "oid:clientid:mdstatus:txnamount"),
      formuldenDeger(yanit, "clientid:oid:mdstatus:txnamount"),
    );
  });

  test("TANINMAYAN alan boş geçilmiyor, null dönüyor", () => {
    /*
      Formül bankadan geliyor, yani dış veri. Bilmediğimiz bir alanı
      boş kabul etseydik imzayı kendi elimizle tutturmaya çalışırdık;
      saldırgan da formüle olmayan bir alan koyarak doğrulamayı
      zayıflatabilirdi.
    */
    assert.equal(formuldenDeger(yanitiAyristir(YANIT), "clientid:bilinmeyen"), null);
    assert.equal(formuldenDeger(yanitiAyristir(YANIT), ""), null);
  });

  test("ekstradaki alan da formülde kullanılabiliyor", () => {
    /* Banka yeni bir alan ekleyip formüle koyarsa çalışmaya devam etsin. */
    const yanit = yanitiAyristir({ ...YANIT, yenialan: "99" });
    assert.equal(formuldenDeger(yanit, "clientid:yenialan"), "3069129799");
  });
});
