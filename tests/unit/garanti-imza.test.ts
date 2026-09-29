import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, test } from "node:test";
import {
  ISLEM_TIPLERI,
  PARA_BIRIMLERI,
  Iso88599Hatasi,
  TRY_KODU,
  dokuzHane,
  hashData,
  hashedPassword,
  iso88599,
  sha1,
  sha512,
} from "@/lib/payments/garanti/imza";

/*
  Tarif bankanın Developer Portal belgesindeki C# örneğinden alındı.
  Testler üç ayrı şeyi tutuyor:

    1. Özet fonksiyonlarının kendisi (yayımlanmış vektörlerle),
    2. ISO-8859-9 kodlaması (bayt tablosuyla),
    3. BİRLEŞTİRME SIRASI — burada bir kayma, her ödemenin "imza
       hatalı" ile düşmesi ve hatanın banka kaynaklıymış gibi
       görünmesi demek.
*/

const TERMINAL = "30691297";
const SIFRE = "123qweASD";
const STORE_KEY = "12345678";

describe("özet fonksiyonları", () => {
  test("SHA1 ve SHA512 yayımlanmış vektörleri veriyor", () => {
    assert.equal(sha1("abc"), "A9993E364706816ABA3E25717850C26C9CD0D89D");
    assert.equal(
      sha512("abc"),
      "DDAF35A193617ABACC417349AE20413112E6FA4E89A97EA20A9EEEE64B55D39A"
      + "2192992A274FC1A836BA3C23A3FEEBBD454D4423643CE80E2A9AC94FA54CA49F",
    );
  });

  test("çıktı BÜYÜK harf hex", () => {
    /* Belgedeki gövde ToUpper() ile bitiyor; küçük harf imzayı bozar. */
    for (const deger of [sha1("x"), sha512("x")]) {
      assert.match(deger, /^[0-9A-F]+$/);
    }
  });
});

describe("ISO-8859-9 kodlaması", () => {
  test("Türkçe harfler Latin-5 baytlarına gidiyor", () => {
    assert.deepEqual([...iso88599("ĞİŞğış")], [0xd0, 0xdd, 0xde, 0xf0, 0xfd, 0xfe]);
  });

  test("ASCII değişmiyor", () => {
    assert.deepEqual([...iso88599("A0-_.")], [...Buffer.from("A0-_.", "ascii")]);
  });

  test("UTF-8 İLE AYNI DEĞİL — fark tam da burada", () => {
    /*
      Şifre ya da StoreKey'de bir "ş" geçtiğinde UTF-8 iki bayt,
      Latin-5 tek bayt üretir ve imza tutmaz. "Sadeleştirip" utf8'e
      dönen biri olursa bu test kırılsın.
    */
    assert.notDeepEqual([...iso88599("şifre")], [...Buffer.from("şifre", "utf8")]);
    assert.equal(iso88599("şifre").length, 5);
    assert.equal(Buffer.from("şifre", "utf8").length, 6);
  });

  test("kodlanamayan karakter SESSİZCE geçmiyor", () => {
    /* "?" koysaydık imza bozulur, banka yalnızca "imza hatalı" derdi. */
    assert.throws(() => iso88599("fiyat: 100₺"), Iso88599Hatasi);
    assert.throws(() => iso88599("emoji 🙂"), Iso88599Hatasi);
  });
});

describe("hashedPassword", () => {
  test('belgedeki gövde: SHA1(şifre + "0" + terminal)', () => {
    assert.equal(hashedPassword(SIFRE, TERMINAL), sha1(`${SIFRE}0${TERMINAL}`));
  });

  test("terminal DOKUZ HANEYE tamamlanıyor", () => {
    /*
      Bankanın belgesi düz bir "0" ekliyor, GOSAS.VirtualPos
      IsRequireZero(id, 9) ile dokuza dolduruyor. Sekiz hanede ikisi
      aynı; iki kaynak da orada birleştiği için riski olmayan tarafı
      seçtik. Ayrım yedi hanede ortaya çıkıyor ve burada sabitleniyor.
    */
    assert.equal(dokuzHane(TERMINAL), "030691297");
    assert.equal(hashedPassword(SIFRE, TERMINAL), sha1(`${SIFRE}030691297`));
    assert.equal(hashedPassword(SIFRE, "3069129"), sha1(`${SIFRE}003069129`));
    assert.equal(hashedPassword(SIFRE, "306912970"), sha1(`${SIFRE}306912970`));
  });

  test("dokuz haneden uzun ya da rakam olmayan terminal reddediliyor", () => {
    /* Doldurma kuralı dokuz hane varsayıyor; daha uzunu imzayı
       sessizce bozardı. */
    for (const kotu of ["3069129701", "3069129A", ""]) {
      assert.throws(() => hashedPassword(SIFRE, kotu), /dokuz haneli/);
    }
  });

  test("boş şifre reddediliyor", () => {
    assert.throws(() => hashedPassword("", TERMINAL), /boş olamaz/);
  });
});

const GIRDI = {
  terminalId: TERMINAL,
  orderId: "ef43ef579b97484d9f67d445e4b15b93",
  amount: 10000,
  currencyCode: TRY_KODU,
  successUrl: "https://akademikmerkez.com/odeme/tamam",
  errorUrl: "https://akademikmerkez.com/odeme/hata",
  type: "sales",
  installmentMetni: "0",
  storeKey: STORE_KEY,
  provizyonSifresi: SIFRE,
};

describe("para birimleri", () => {
  test("kodlar ISO 4217 ile aynı", () => {
    assert.deepEqual(PARA_BIRIMLERI, { TRY: 949, USD: 840, EUR: 978 });
    assert.equal(TRY_KODU, 949);
  });

  test("tanınmayan kod reddediliyor", () => {
    /*
      Kod hem forma (txncurrencycode) hem imzaya giriyor; 94 yazan biri
      geçerli GÖRÜNEN bir imza üretir ve banka reddeder.
    */
    assert.throws(
      () => hashData({ ...GIRDI, currencyCode: 94 as never }),
      /Tanınmayan para birimi/,
    );
  });
});

describe("işlem tipleri", () => {
  test("bankanın beklediği dizgeler birebir", () => {
    /*
      Tip hem forma (txntype) hem imzaya giriyor. "sale" yazan biri
      geçerli GÖRÜNEN bir imza üretir, banka reddeder ve hata "imza
      hatalı" olarak döner — bir harf yüzünden günler gider. Derleyici
      yakalasın diye liste kapalı; değerler GOSAS'ın enum'undan.
    */
    assert.deepEqual([...ISLEM_TIPLERI], [
      "sales", "preauth", "postauth", "void", "partialvoid",
      "refund", "orderinq", "orderhistoryinq", "recurringvoid",
    ]);
    assert.ok(ISLEM_TIPLERI.every((tip) => /^[a-z]+$/.test(tip)), "hepsi küçük harf, boşluksuz");
  });
});

describe("hashData", () => {
  test("BİRLEŞTİRME SIRASI belgedeki gövdeyle birebir", () => {
    /*
      Sıra burada elle yeniden yazılıyor: uygulamadaki sıra değişirse
      test kırılır. Kendine referans değil — beklenen dizge belgeden.
    */
    const beklenen = sha512(
      GIRDI.terminalId
      + GIRDI.orderId
      + "10000"
      + "949"
      + GIRDI.successUrl
      + GIRDI.errorUrl
      + "sales"
      + "0"
      + GIRDI.storeKey
      + sha1(`${SIFRE}0${TERMINAL}`),
    );
    assert.equal(hashData(GIRDI), beklenen);
  });

  test("her alan imzayı DEĞİŞTİRİYOR", () => {
    /*
      Bir alan yanlışlıkla birleştirmeden düşerse imza yine üretilir ve
      kusur ancak bankada görünür. Her alanın gerçekten girdiğini tek
      tek sınıyoruz.
    */
    const temel = hashData(GIRDI);
      const degisiklikler: Partial<typeof GIRDI>[] = [
      { orderId: "baska-siparis" },
      { amount: 10001 },
      { currencyCode: PARA_BIRIMLERI.USD },
      { successUrl: "https://akademikmerkez.com/odeme/tamam2" },
      { errorUrl: "https://akademikmerkez.com/odeme/hata2" },
      { type: "preauth" as const },
      { installmentMetni: "3" },
      { storeKey: "87654321" },
      { provizyonSifresi: "baska" },
      { terminalId: "30691298" },
    ];
    for (const degisiklik of degisiklikler) {
      const [alan] = Object.keys(degisiklik);
      assert.notEqual(hashData({ ...GIRDI, ...degisiklik }), temel, `${alan} imzaya girmiyor`);
    }
  });

  test("aynı girdi hep aynı imzayı veriyor", () => {
    assert.equal(hashData(GIRDI), hashData({ ...GIRDI }));
  });

  test("tutar KURUŞ tamsayısı olmalı", () => {
    /* 100,00 TL → 10000. Ondalık gönderen biri sessizce 1/100 tahsil ederdi. */
    for (const kotu of [100.5, 0, -1, Number.NaN]) {
      assert.throws(() => hashData({ ...GIRDI, amount: kotu }), /kuruş/);
    }
  });

  test('taksit METİN: "0" ile boş dizge AYNI İMZA DEĞİL', () => {
    /*
      Tek çekimde "0" mı boş dizge mi gittiği belgeler arasında
      çelişiyor (bankanın 3D örneği int, GOSAS'ın XML yolu boş dizge).
      İkisi farklı imza üretiyor; bu yüzden metin tek yerden geçiyor ve
      forma yazılanla imzaya girenin aynı olması garanti altında.
    */
    assert.notEqual(hashData({ ...GIRDI, installmentMetni: "" }), hashData(GIRDI));
    assert.notEqual(hashData({ ...GIRDI, installmentMetni: "1" }), hashData(GIRDI));
    assert.throws(() => hashData({ ...GIRDI, installmentMetni: "-1" }), /Taksit/);
    assert.throws(() => hashData({ ...GIRDI, installmentMetni: "iki" }), /Taksit/);
  });

  test("eksik StoreKey ve orderId reddediliyor", () => {
    assert.throws(() => hashData({ ...GIRDI, storeKey: "" }), /StoreKey/);
    assert.throws(() => hashData({ ...GIRDI, orderId: "" }), /orderId/);
  });

  test("Türkçe karakterli şifre Latin-5 üzerinden hesaplanıyor", () => {
    /* Bankada şifre kullanıcı seçimi; "ş" geçtiğinde UTF-8 imzayı bozardı. */
    const turkce = { ...GIRDI, provizyonSifresi: "şifreĞ1" };
    const beklenenSifre = createHash("sha1").update(iso88599(`şifreĞ10${TERMINAL}`)).digest("hex").toUpperCase();
    assert.equal(hashedPassword("şifreĞ1", TERMINAL), beklenenSifre);
    assert.notEqual(hashData(turkce), hashData(GIRDI));
  });
});
