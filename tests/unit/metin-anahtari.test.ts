import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { gruplamaAnahtari } from "../../lib/metin-anahtari";

describe("gruplama anahtarı", () => {
  it("büyük/küçük harf farkını siler", () => {
    assert.equal(gruplamaAnahtari("Referans"), gruplamaAnahtari("referans"));
    assert.equal(gruplamaAnahtari("REFERANS"), gruplamaAnahtari("Referans"));
  });

  it("latin I ile yazılmış markayı bölmez", () => {
    /* `"Instagram".toLocaleLowerCase("tr")` → "ınstagram" (noktasız).
       Türkçe küçültme tek başına bu ikisini AYRI gruplara
       düşürüyordu; testle yakalandı. */
    assert.equal(gruplamaAnahtari("Instagram"), gruplamaAnahtari("instagram"));
    assert.equal(gruplamaAnahtari("INSTAGRAM"), gruplamaAnahtari("instagram "));
  });

  it("İ ile yazılmış Türkçe metni bölmez", () => {
    // Varsayılan küçültme "i̇" (i + birleşen nokta) üretip ayırıyordu.
    assert.equal(gruplamaAnahtari("İNGİLİZCE ÇEVİRİ"), gruplamaAnahtari("ingilizce çeviri"));
    assert.equal(gruplamaAnahtari("İngilizce Çeviri"), gruplamaAnahtari("ingilizce çeviri"));
  });

  it("büyük harfle yazılmış Türkçe metni küçük harfliyle birleştirir", () => {
    /* "TEZ YAZIMI" Türkçe kuralla "tez yazımı", I→i katlamasıyla
       "tez yazimi" olurdu; ı/i tek harfe indiği için ikisi de aynı. */
    assert.equal(gruplamaAnahtari("TEZ YAZIMI"), gruplamaAnahtari("Tez Yazımı"));
    assert.equal(gruplamaAnahtari("tez yazimi"), gruplamaAnahtari("Tez Yazımı"));
  });

  it("boşluk farkını sadeleştirir", () => {
    assert.equal(gruplamaAnahtari("  Tez   Yazımı "), gruplamaAnahtari("Tez Yazımı"));
  });

  it("farklı kelimeleri birleştirmez", () => {
    assert.notEqual(gruplamaAnahtari("Referans"), gruplamaAnahtari("Reklam"));
    assert.notEqual(gruplamaAnahtari("Tez Yazımı"), gruplamaAnahtari("Tez Düzenleme"));
  });

  it("boş metinde boş anahtar", () => {
    assert.equal(gruplamaAnahtari("   "), "");
  });
});
