import assert from "node:assert/strict";
import test, { describe } from "node:test";
import {
  SATIS_PARA_BIRIMLERI,
  altBirimDogrula,
  eslesmeFarki,
  odemeEslesiyorMu,
  paraBirimiCoz,
  paraBirimiMi,
  paraYaz,
  paytrParaBirimi,
  topla,
  toplamYaz,
  tutar,
} from "../../lib/para";

/*
  Para çekirdeğinin sözleşmesi. Üç kural sabitleniyor: tutar alt birimde
  kalır, farklı birimler toplanmaz, bilinmeyen birim sessizce TRY olmaz.
*/

describe("para birimi çözümü", () => {
  test("ISO kodları tanınıyor, bilinmeyen null", () => {
    assert.equal(paraBirimiCoz("TRY"), "TRY");
    assert.equal(paraBirimiCoz("usd"), "USD");
    assert.equal(paraBirimiCoz(" Usd "), "USD");
    assert.equal(paraBirimiCoz("EUR"), null, "EUR satış birimi değil");
    assert.equal(paraBirimiCoz(""), null);
    assert.equal(paraBirimiCoz(null), null);
    assert.equal(paraBirimiCoz(42), null);
  });

  test("sağlayıcının TL'si ISO'da TRY", () => {
    /* PayTR "TL" gönderiyor; veritabanına ISO kodu girsin diye çeviri
       sınırda ve AÇIK. Ters yönü de aynı yerde. */
    assert.equal(paraBirimiCoz("TL"), "TRY");
    assert.equal(paytrParaBirimi("TRY"), "TL");
    assert.equal(paytrParaBirimi("USD"), "USD");
  });

  test("tip koruyucusu satış birimleriyle sınırlı", () => {
    assert.equal(paraBirimiMi("TRY"), true);
    assert.equal(paraBirimiMi("EUR"), false);
    assert.deepEqual([...SATIS_PARA_BIRIMLERI], ["TRY", "USD"]);
  });
});

describe("yazım", () => {
  test("TL simgeyle, öteki birim koduyla", () => {
    assert.equal(paraYaz(tutar(499000, "TRY")), "₺4.990,00");
    assert.equal(paraYaz(tutar(85000, "USD")), "850,00 USD");
  });

  test("sayı ayırıcıları iki birimde de Türkçe", () => {
    /* Aynı ekranda "1,234.56" ile "1.234,56" yan yana görünürse tutar
       yanlış okunuyor. */
    assert.equal(paraYaz(tutar(123456, "USD")), "1.234,56 USD");
    assert.equal(paraYaz(tutar(123456, "TRY")), "₺1.234,56");
  });
});

describe("toplam", () => {
  test("farklı birimler ayrı toplanıyor", () => {
    const t = topla([tutar(500000, "TRY"), tutar(750000, "TRY"), tutar(85000, "USD")]);
    assert.deepEqual(t, [tutar(1250000, "TRY"), tutar(85000, "USD")]);
  });

  test("tek satırlık yazım kurum sahibinin örneklediği biçimde", () => {
    assert.equal(toplamYaz([tutar(1250000, "TRY"), tutar(85000, "USD")]), "₺12.500,00 · 850,00 USD");
  });

  test("boş liste sıfır değil '—'", () => {
    /* "0,00" yazmak "veri yok" ile "gerçekten sıfır"ı karıştırıyor. */
    assert.equal(toplamYaz([]), "—");
    assert.equal(toplamYaz([], "kayıt yok"), "kayıt yok");
  });

  test("sıra sabit: TRY, USD", () => {
    assert.deepEqual(topla([tutar(1, "USD"), tutar(2, "TRY")]).map((t) => t.paraBirimi), ["TRY", "USD"]);
  });
});

describe("ödeme eşleşmesi", () => {
  test("aynı tutar farklı birim EŞLEŞMİYOR", () => {
    const beklenen = tutar(10000, "USD");
    const gelen = tutar(10000, "TRY");
    assert.equal(odemeEslesiyorMu(beklenen, gelen), false);
    assert.match(eslesmeFarki(beklenen, gelen) ?? "", /Para birimi uyuşmuyor.*USD.*TRY/);
  });

  test("aynı birim farklı tutar: fark metni iki tutarı da yazıyor", () => {
    assert.match(eslesmeFarki(tutar(499000, "TRY"), tutar(199000, "TRY")) ?? "", /₺4\.990,00.*₺1\.990,00/);
  });

  test("birebir eşleşmede fark yok", () => {
    assert.equal(odemeEslesiyorMu(tutar(85000, "USD"), tutar(85000, "USD")), true);
    assert.equal(eslesmeFarki(tutar(85000, "USD"), tutar(85000, "USD")), null);
  });
});

describe("alt birim doğrulaması", () => {
  test("ondalık ve negatif reddediliyor", () => {
    assert.equal(altBirimDogrula(4990), 4990);
    assert.throws(() => altBirimDogrula(49.9), /tam sayı/);
    assert.throws(() => altBirimDogrula(-1), /negatif/);
    assert.throws(() => altBirimDogrula("abc"), /tam sayı/);
  });
});
