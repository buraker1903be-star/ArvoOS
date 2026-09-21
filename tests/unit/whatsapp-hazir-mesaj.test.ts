import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { hazirMesajiDoldur, hazirMesajListesi, ONERILEN_HAZIR_MESAJLAR } from "@/lib/whatsapp-hazir-mesaj";

describe("hazır mesajda {ad} yer tutucusu", () => {
  test("ad varsa yerine yazılır", () => {
    assert.equal(hazirMesajiDoldur("Merhaba {ad}, hoş geldiniz.", "Burak"), "Merhaba Burak, hoş geldiniz.");
  });

  test("ad yoksa yer tutucu ve önündeki boşluk düşer", () => {
    // Eskiden düz replace düşünülmüştü; adsız numarada "Merhaba , ..." giderdi.
    assert.equal(hazirMesajiDoldur("Merhaba {ad}, hoş geldiniz.", null), "Merhaba, hoş geldiniz.");
  });

  test("boşluktan ibaret ad yok sayılır", () => {
    assert.equal(hazirMesajiDoldur("Teşekkürler {ad}.", "   "), "Teşekkürler.");
  });

  test("aynı metinde birden çok yer tutucu doldurulur", () => {
    assert.equal(hazirMesajiDoldur("{ad}, {ad} için hazır.", "Ada"), "Ada, Ada için hazır.");
  });

  test("yer tutucu yoksa metin olduğu gibi kalır", () => {
    assert.equal(hazirMesajiDoldur("Fiyat listemiz ektedir.", "Burak"), "Fiyat listemiz ektedir.");
  });

  test("önerilen metinlerin hepsi adsız da düzgün okunur", () => {
    // Öneriler kodda sabit; biri {ad}'ı kötü bir yere koyarsa burada görülür.
    for (const mesaj of ONERILEN_HAZIR_MESAJLAR) {
      const adsiz = hazirMesajiDoldur(mesaj.body, null);
      assert.ok(!adsiz.includes("{ad}"), `${mesaj.title}: yer tutucu kalmış`);
      assert.ok(!/ [,.]/.test(adsiz), `${mesaj.title}: noktalamadan önce boşluk kalmış — "${adsiz}"`);
      assert.ok(!adsiz.includes("  "), `${mesaj.title}: çift boşluk kalmış`);
    }
  });
});

describe("hazır mesaj listesi", () => {
  test("kurum kendi metnini yazdıysa aynı adlı öneri gösterilmez", () => {
    const { kendi, onerilen } = hazirMesajListesi([{ title: "Karşılama", body: "Selam." }]);
    assert.equal(kendi.length, 1);
    assert.ok(!onerilen.some((m) => m.title === "Karşılama"));
  });

  test("başlık karşılaştırması Türkçe büyük harfe takılmaz", () => {
    // "KARŞILAMA".toLowerCase() İngilizce kurala göre "karşilama" verir;
    // Türkçe kuralla "karşılama" olur ve öneri gizlenir.
    const { onerilen } = hazirMesajListesi([{ title: "KARŞILAMA", body: "Selam." }]);
    assert.ok(!onerilen.some((m) => m.title === "Karşılama"));
  });

  test("hiç kaydı olmayan kurum tüm önerileri görür", () => {
    const { onerilen } = hazirMesajListesi([]);
    assert.equal(onerilen.length, ONERILEN_HAZIR_MESAJLAR.length);
  });
});
