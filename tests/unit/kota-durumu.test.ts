import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { davetEngeli, kotaDurumu, kotayaGoreSirala } from "@/lib/kota-durumu";

const olc = (kullaniciSayisi: number, kullaniciLimiti: number, aiKullanilan = 0, aiLimiti = 100) =>
  kotaDurumu({ organizationId: "o", kullaniciSayisi, kullaniciLimiti, aiKullanilan, aiLimiti });

describe("kota durumu", () => {
  test("limitin altında normal", () => {
    assert.equal(olc(3, 10).durum, "normal");
    assert.equal(olc(3, 10).kullanici.oran, 30);
  });

  test("limite eşit olmak aşım değildir", () => {
    // 10 kullanıcılık pakette 10. kullanıcı hakkın içinde.
    const d = olc(10, 10);
    assert.equal(d.kullanici.asildi, false);
    assert.equal(d.durum, "yaklasti");
  });

  test("limitin üstü aşımdır", () => {
    assert.equal(olc(11, 10).kullanici.asildi, true);
    assert.equal(olc(11, 10).durum, "asildi");
  });

  test("%85 ve üstü yaklaşma sayılır", () => {
    // Limite değmeden haber verilsin; kurucu paketi büyütmeyi konuşabilsin.
    assert.equal(olc(85, 100).durum, "yaklasti");
    assert.equal(olc(84, 100).durum, "normal");
  });

  test("limiti sıfır olan kota, kullanım varsa aşılmıştır", () => {
    /*
      Limit 0 "hak yok" demek. Eskiden yüzde hesabı 0'a bölmemek için 0
      dönüyordu ve aşım hiç görünmüyordu — AI kredisi tanımlanmamış bir
      kurumun harcaması sessizce geçerdi.
    */
    assert.equal(kotaDurumu({ organizationId: "o", kullaniciSayisi: 1, kullaniciLimiti: 5, aiKullanilan: 3, aiLimiti: 0 }).durum, "asildi");
  });

  test("limiti sıfır ve kullanımı sıfır olan kota sorunsuz", () => {
    assert.equal(kotaDurumu({ organizationId: "o", kullaniciSayisi: 1, kullaniciLimiti: 5, aiKullanilan: 0, aiLimiti: 0 }).durum, "normal");
  });

  test("AI kotası da genel durumu belirler", () => {
    assert.equal(olc(1, 10, 120, 100).durum, "asildi");
  });

  test("eksi ve ondalık değerler yuvarlanır", () => {
    const d = olc(-2, 10);
    assert.equal(d.kullanici.kullanilan, 0);
  });
});

describe("kota sıralaması", () => {
  test("önce aşanlar, sonra yaklaşanlar", () => {
    const liste = [
      kotaDurumu({ organizationId: "normal", kullaniciSayisi: 1, kullaniciLimiti: 10, aiKullanilan: 0, aiLimiti: 100 }),
      kotaDurumu({ organizationId: "asan", kullaniciSayisi: 12, kullaniciLimiti: 10, aiKullanilan: 0, aiLimiti: 100 }),
      kotaDurumu({ organizationId: "yaklasan", kullaniciSayisi: 9, kullaniciLimiti: 10, aiKullanilan: 0, aiLimiti: 100 }),
    ];
    assert.deepEqual(kotayaGoreSirala(liste).map((d) => d.organizationId), ["asan", "yaklasan", "normal"]);
  });

  test("aynı gruptakiler doluluk oranına göre sıralanır", () => {
    const liste = [
      kotaDurumu({ organizationId: "az", kullaniciSayisi: 11, kullaniciLimiti: 10, aiKullanilan: 0, aiLimiti: 100 }),
      kotaDurumu({ organizationId: "cok", kullaniciSayisi: 30, kullaniciLimiti: 10, aiKullanilan: 0, aiLimiti: 100 }),
    ];
    assert.deepEqual(kotayaGoreSirala(liste).map((d) => d.organizationId), ["cok", "az"]);
  });
});

describe("davet engeli", () => {
  test("limitin altında davet açık", () => {
    assert.equal(davetEngeli(3, 10), null);
  });

  test("limite ulaşınca yeni davet durur", () => {
    // 10 kullanıcılık pakette onuncu kullanıcı hakkın içinde; yeni davet
    // on birinciyi yaratacağı için burada durduruluyor.
    assert.match(davetEngeli(10, 10) ?? "", /limitiniz dolu \(10\/10\)/);
  });

  test("limiti aşmış kurumda da durur", () => {
    assert.match(davetEngeli(14, 10) ?? "", /14\/10/);
  });

  test("lisans satırı yoksa sınır uygulanmaz", () => {
    /*
      Olmayan bir limiti gerekçe gösterip daveti durdurmak, kurulumu yarım
      kalmış bir kurumu tamamen çalışmaz hale getirirdi.
    */
    assert.equal(davetEngeli(99, null), null);
    assert.equal(davetEngeli(99, undefined), null);
  });

  test("sıfır limit sınırsız sayılır", () => {
    // user_limit > 0 kısıtı var; yine de sıfır gelirse daveti kilitlemiyoruz.
    assert.equal(davetEngeli(99, 0), null);
  });
});
