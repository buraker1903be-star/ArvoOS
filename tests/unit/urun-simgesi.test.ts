import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRODUCTS, urunSimgesi } from "@/lib/products";

/*
  15.10.2026'da konsolun Ürünler sayfasında ve müşteri detayında dört
  ürünün dördü de "AR" simgesiyle çiziliyordu: liste satırı simge
  verilmediğinde adın baş harflerini türetiyor ve dört ürün adı da
  "Arvo" ile başlıyor. Kısaltma artık ürünün tanımında; bu test onun
  ayırt edici kalmasını sabitliyor.
*/
describe("urunSimgesi", () => {
  it("her ürünün kısaltması var", () => {
    for (const urun of PRODUCTS) assert.equal(urunSimgesi(urun.code), urun.badge);
  });

  // Asıl hata buydu: farklı ürünler aynı harfleri alıyordu.
  it("kısaltmalar benzersiz", () => {
    const kisaltmalar = PRODUCTS.map((urun) => urun.badge);
    assert.equal(new Set(kisaltmalar).size, kisaltmalar.length, `yinelenen kısaltma: ${kisaltmalar.join(", ")}`);
  });

  it("iki harf ve büyük", () => {
    for (const urun of PRODUCTS) assert.match(urun.badge, /^[A-Z]{2}$/);
  });

  it("tanınmayan kod için null", () => {
    assert.equal(urunSimgesi("yok"), null);
    assert.equal(urunSimgesi(""), null);
  });
});
