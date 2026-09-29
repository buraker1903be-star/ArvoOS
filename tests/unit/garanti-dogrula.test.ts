import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bankadanMiGeldi, odemeSonucu } from "@/lib/payments/garanti/dogrula";
import { sha512 } from "@/lib/payments/garanti/imza";
import { formuldenDeger, yanitiAyristir } from "@/lib/payments/garanti/yanit";

/*
  Bu yanıt DIŞ VERİ: successurl adresini bilen herkes benzerini
  gönderebilir. Doğrulamadan kabul etmek bedava sipariş dağıtmak demek.
  Testler saldırıyı tek tek deniyor.
*/

const STORE_KEY = "12345678";
const ORDER_ID = "ef43ef579b97484d9f67d445e4b15b93";
/* Bankanın örneğindeki formül; sonundaki iki nokta belgede de var. */
const FORMUL = "clientid:oid:authcode:procreturncode:response:mdstatus:cavv:eci:md:rnd:";

/** Bankanın yaptığını yapar: formüldeki değerler + 3D anahtarı → SHA512. */
function imzala(alanlar: Record<string, string>): Record<string, string> {
  const yanit = yanitiAyristir(alanlar);
  const { deger } = formuldenDeger(yanit, alanlar.hashparams);
  return { ...alanlar, hash: sha512(deger + STORE_KEY) };
}

const TEMEL: Record<string, string> = {
  clientid: "30691297",
  oid: ORDER_ID,
  authcode: "123456",
  procreturncode: "00",
  response: "Approved",
  mdstatus: "1",
  cavv: "AAABBBBB",
  eci: "02",
  md: "444444...0001",
  rnd: "rastgele",
  txnamount: "10000",
  hashparams: FORMUL,
  hashparamsval: "SALDIRGANIN GÖNDERDİĞİ DEĞER",
};

const GECERLI = imzala(TEMEL);
const BEKLENEN = { storeKey: STORE_KEY, orderId: ORDER_ID, tutarKurus: 10000 };

describe("bankadan mı geldi", () => {
  test("geçerli yanıt kabul ediliyor", () => {
    assert.deepEqual(bankadanMiGeldi(yanitiAyristir(GECERLI), STORE_KEY), { gecerli: true, eksikAlanlar: [] });
  });

  test("HASHPARAMSVAL'A GÜVENİLMİYOR", () => {
    /*
      Bankanın ayrıca uyardığı nokta: "hashparams değeri dönen
      değerlerden hesaplanmalı, hashparamsval kullanılmamalıdır."
      hashparamsval de saldırganın gönderdiği bir alan; ona güvenmek
      kilidin anahtarını kapının üstünde bırakmaktı. Burada saçma bir
      hashparamsval duruyor ve doğrulamayı hiç etkilemiyor.
    */
    const bozuk = { ...GECERLI, hashparamsval: "bambaşka bir şey" };
    assert.equal(bankadanMiGeldi(yanitiAyristir(bozuk), STORE_KEY).gecerli, true);
  });

  test("TEK BİR ALAN oynatılınca reddediliyor", () => {
    for (const alan of ["clientid", "oid", "authcode", "procreturncode", "response", "mdstatus", "cavv", "eci", "md", "rnd"]) {
      const bozuk = yanitiAyristir({ ...GECERLI, [alan]: "oynanmis" });
      assert.equal(bankadanMiGeldi(bozuk, STORE_KEY).gecerli, false, alan);
    }
  });

  test("anahtarı bilmeyen saldırgan geçerli hash üretemiyor", () => {
    const sahte = yanitiAyristir({ ...TEMEL, hash: sha512("her ne olursa" + "yanlisanahtar") });
    assert.equal(bankadanMiGeldi(sahte, STORE_KEY).gecerli, false);
  });

  test("yanlış mağaza anahtarıyla doğrulanmıyor", () => {
    assert.equal(bankadanMiGeldi(yanitiAyristir(GECERLI), "87654321").gecerli, false);
  });

  test("hash, hashparams ve anahtar eksikse sebebi söyleniyor", () => {
    const yok = (alan: string) => {
      const kopya: Record<string, string> = { ...GECERLI };
      delete kopya[alan];
      return bankadanMiGeldi(yanitiAyristir(kopya), STORE_KEY);
    };
    assert.match((yok("hash") as { sebep: string }).sebep, /hash yok/);
    assert.match((yok("hashparams") as { sebep: string }).sebep, /hashparams yok/);
    assert.match((bankadanMiGeldi(yanitiAyristir(GECERLI), " ") as { sebep: string }).sebep, /StoreKey/);
  });

  test("küçük harfli hash de kabul ediliyor", () => {
    const kucuk = { ...GECERLI, hash: GECERLI.hash.toLowerCase() };
    assert.equal(bankadanMiGeldi(yanitiAyristir(kucuk), STORE_KEY).gecerli, true);
  });

  test("formülde olup yanıtta olmayan alan boş sayılıyor ve bildiriliyor", () => {
    /*
      Bankanın kendi kodu eksik alanı "" kabul ediyor; katı davranmak
      meşru yanıtları reddederdi. Yine de hangi alanın gelmediği
      günlüğe düşsün diye dönüyor.
    */
    const alanlar = imzala({ ...TEMEL, hashparams: "clientid:oid:gelmeyenalan" });
    const sonuc = bankadanMiGeldi(yanitiAyristir(alanlar), STORE_KEY);
    assert.equal(sonuc.gecerli, true);
    assert.deepEqual(sonuc.eksikAlanlar, ["gelmeyenalan"]);
  });
});

describe("ödeme sonucu", () => {
  test("hepsi tutunca ödendi", () => {
    assert.deepEqual(odemeSonucu(yanitiAyristir(GECERLI), BEKLENEN), {
      durum: "odendi", orderId: ORDER_ID, tutarKurus: 10000,
    });
  });

  test("BAŞKA BİR İŞLEMİN geçerli yanıtı bu siparişe yapıştırılamıyor", () => {
    const baska = imzala({ ...TEMEL, oid: "bambaska-siparis" });
    const sonuc = odemeSonucu(yanitiAyristir(baska), BEKLENEN);
    assert.equal(sonuc.durum, "reddedildi");
  });

  test("provizyon 00 değilse ödendi sayılmıyor", () => {
    /* Banka: dönüş yalnızca 00 için kontrol edilir; diğerinde para
       hareket etmediği için kabul edilecek bir şey yok. */
    const red = imzala({ ...TEMEL, procreturncode: "99", mderrormessage: "Yetersiz bakiye" });
    const sonuc = odemeSonucu(yanitiAyristir(red), BEKLENEN);
    assert.equal(sonuc.durum, "basarisiz");
    assert.equal((sonuc as { kod: string }).kod, "99");
    assert.match((sonuc as { sebep: string }).sebep, /Yetersiz bakiye/);
  });

  test("hash tutmuyorsa 00 bile olsa reddediliyor", () => {
    const sahte = { ...TEMEL, hash: "A".repeat(128) };
    assert.equal(odemeSonucu(yanitiAyristir(sahte), BEKLENEN).durum, "reddedildi");
  });

  test("TUTAR OYNANMIŞSA reddediliyor", () => {
    /*
      Bankanın ayrıca önerdiği kontrol: dönen tutar ile bizim
      kaydımızdaki tutar karşılaştırılmalı. Tutar hash formülünde
      olmayabilir, o yüzden ayrı bakılıyor.
    */
    const ucuz = imzala({ ...TEMEL, txnamount: "1" });
    const sonuc = odemeSonucu(yanitiAyristir(ucuz), BEKLENEN);
    assert.equal(sonuc.durum, "reddedildi");
    assert.match((sonuc as { sebep: string }).sebep, /Tutar/);
  });

  test("tutar alanı hiç yoksa da reddediliyor", () => {
    const alanlar = { ...TEMEL };
    delete alanlar.txnamount;
    assert.equal(odemeSonucu(yanitiAyristir(imzala(alanlar)), BEKLENEN).durum, "reddedildi");
  });

  test("orderid alanı oid yerine geçebiliyor", () => {
    const alanlar = { ...TEMEL, orderid: ORDER_ID };
    delete alanlar.oid;
    assert.equal(odemeSonucu(yanitiAyristir(imzala(alanlar)), BEKLENEN).durum, "odendi");
  });
});
