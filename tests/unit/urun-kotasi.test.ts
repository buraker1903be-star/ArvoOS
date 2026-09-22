import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { URUN_KOTALARI, kotaOzetiYaz, urunKotalari } from "@/lib/urun-kotasi";

describe("ürün kotaları", () => {
  test("ARC arşiv alanı tanımlı DEĞİL", () => {
    /*
      Kural: ölçümü yazılmamış kota eklenmez. ARC'ın arşiv ölçümü kendi
      veritabanında bir fonksiyon gerektiriyor ve o ayrı bir depo.
      Eklenirse kurucu onu bir koruma sanar.
    */
    assert.equal(URUN_KOTALARI.arc, undefined);
  });

  test("limit ve kullanım karşılaştırılır", () => {
    const satirlar = urunKotalari("randevu", { personel: 5 }, { personel: 3 });
    const personel = satirlar.find((s) => s.alan.anahtar === "personel")!;
    assert.equal(personel.oran, 60);
    assert.equal(personel.asildi, false);
  });

  test("limite eşit olmak aşım değildir", () => {
    const [personel] = urunKotalari("randevu", { personel: 5 }, { personel: 5 });
    assert.equal(personel.asildi, false);
  });

  test("limitin üstü aşımdır", () => {
    const [personel] = urunKotalari("randevu", { personel: 5 }, { personel: 6 });
    assert.equal(personel.asildi, true);
  });

  test("limit yoksa sınırsız sayılır", () => {
    const [personel] = urunKotalari("randevu", {}, { personel: 999 });
    assert.equal(personel.limit, null);
    assert.equal(personel.asildi, false);
  });

  test("ölçüm alınamadıysa aşım sayılmaz", () => {
    /*
      Köprü koptuğu için bir kiracının modülünü kapatmak en kötü hata
      türü olurdu. Bilinmeyen, aşım değildir.
    */
    const [personel] = urunKotalari("randevu", { personel: 1 }, { personel: null });
    assert.equal(personel.kullanilan, null);
    assert.equal(personel.asildi, false);
    assert.equal(personel.oran, null);
  });

  test("sıfır ve eksi limit sınırsız sayılır", () => {
    assert.equal(urunKotalari("randevu", { personel: 0 }, { personel: 5 })[0].limit, null);
    assert.equal(urunKotalari("randevu", { personel: -3 }, { personel: 5 })[0].limit, null);
  });

  test("kotası olmayan ürün boş liste döner", () => {
    assert.deepEqual(urunKotalari("arvoos", { x: 1 }, { x: 1 }), []);
  });
});

describe("kota özeti", () => {
  test("ölçüm yoksa soru işareti yazılır", () => {
    // Sıfır yazmak "hiç kullanılmamış" demek olurdu.
    const ozet = kotaOzetiYaz(urunKotalari("randevu", { personel: 5 }, { personel: null }));
    assert.match(ozet ?? "", /\?\/5 personel/);
  });

  test("limitsiz alan sonsuz işaretiyle yazılır", () => {
    const ozet = kotaOzetiYaz(urunKotalari("randevu", {}, { personel: 3 }));
    assert.match(ozet ?? "", /3\/∞ personel/);
  });

  test("hiç veri yoksa özet yok", () => {
    assert.equal(kotaOzetiYaz(urunKotalari("randevu", {}, {})), null);
    assert.equal(kotaOzetiYaz([]), null);
  });
});
