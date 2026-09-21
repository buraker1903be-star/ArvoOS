import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { HATIRLATMA_SABLONLARI, hatirlatmaEngeli } from "@/lib/abonelik-hatirlatma";

const TAM = { abone: "Akademik Merkez", urun: "ArvoOS", tarih: "30 Eylül", ucret: "₺1.500,00" };

describe("abonelik hatırlatması şablonu", () => {
  test("deneme şablonunda ücret yok", () => {
    /*
      Fiyat geçen bir bildirim Meta'nın gözünde satış mesajı oluyor ve
      şablon pazarlamaya çekiliyor; pazarlamaya düşen bildirim ise
      pazarlamadan çıkmış müşteriye hiç ulaşmıyor. Oysa deneme süresinin
      bittiğini en çok onun bilmesi gerek.
    */
    const parametreler = HATIRLATMA_SABLONLARI.trial.parametreler(TAM);
    assert.deepEqual(Object.keys(parametreler).sort(), ["abone", "tarih", "urun"]);
  });

  test("yenileme şablonu ücreti taşır", () => {
    const parametreler = HATIRLATMA_SABLONLARI.renewal.parametreler(TAM);
    assert.equal(parametreler.ucret, "₺1.500,00");
  });

  test("ücreti girilmemiş yenileme gönderilmez", () => {
    // "Aylık ücret —" yazan bir mesaj göndermek, hiç göndermemekten kötü.
    const engel = hatirlatmaEngeli("renewal", { ...TAM, ucret: "" });
    assert.match(engel ?? "", /ücreti girilmemiş/);
  });

  test("ücretsiz deneme hatırlatması engellenmez", () => {
    assert.equal(hatirlatmaEngeli("trial", { abone: "A", urun: "ArvoOS", tarih: "30 Eylül" }), null);
  });

  test("boş kurum adı sebebiyle engellenir", () => {
    // Boş parametre Meta'da 132000'e yol açıyor; sebebini önceden söylüyoruz.
    const engel = hatirlatmaEngeli("trial", { abone: "  ", urun: "ArvoOS", tarih: "30 Eylül" });
    assert.match(engel ?? "", /eksik bilgi: abone/);
  });

  test("tam bilgide engel yok", () => {
    assert.equal(hatirlatmaEngeli("renewal", TAM), null);
  });
});
