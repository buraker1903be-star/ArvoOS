import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { davetEngeli, kotaDurumu, kotayaGoreSirala } from "@/lib/kota-durumu";

const olc = (kullaniciSayisi: number, kullaniciLimiti: number) =>
  kotaDurumu({ organizationId: "o", kullaniciSayisi, kullaniciLimiti });

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
      dönüyordu ve aşım hiç görünmüyordu — limiti tanımlanmamış bir kurumun
      harcaması sessizce geçerdi.
    */
    assert.equal(kotaDurumu({
      organizationId: "o", kullaniciSayisi: 1, kullaniciLimiti: 5,
      depolamaBayt: 5 * 1024 * 1024, depolamaLimitiMb: 0,
    }).durum, "asildi");
  });

  test("limiti sıfır ve kullanımı sıfır olan kota sorunsuz", () => {
    assert.equal(kotaDurumu({
      organizationId: "o", kullaniciSayisi: 1, kullaniciLimiti: 5,
      depolamaBayt: 0, depolamaLimitiMb: 0,
    }).durum, "normal");
  });

  test("ölçülmeyen AI kredisi genel duruma karışmaz", () => {
    /*
      ai_credits_used'ı hiçbir kod artırmıyor; ArvoLab tüketimi kendi
      veritabanında tutuyor. Kota durumu bu yüzden AI'yı hiç hesaba
      katmıyor — katsaydı her kiracıya "%0 dolu" derdi.
    */
    assert.deepEqual(Object.keys(olc(3, 10)).sort(), ["depolama", "durum", "kullanici", "organizationId"]);
  });

  test("eksi ve ondalık değerler yuvarlanır", () => {
    const d = olc(-2, 10);
    assert.equal(d.kullanici.kullanilan, 0);
  });
});

describe("kota sıralaması", () => {
  test("önce aşanlar, sonra yaklaşanlar", () => {
    const liste = [
      kotaDurumu({ organizationId: "normal", kullaniciSayisi: 1, kullaniciLimiti: 10 }),
      kotaDurumu({ organizationId: "asan", kullaniciSayisi: 12, kullaniciLimiti: 10 }),
      kotaDurumu({ organizationId: "yaklasan", kullaniciSayisi: 9, kullaniciLimiti: 10 }),
    ];
    assert.deepEqual(kotayaGoreSirala(liste).map((d) => d.organizationId), ["asan", "yaklasan", "normal"]);
  });

  test("aynı gruptakiler doluluk oranına göre sıralanır", () => {
    const liste = [
      kotaDurumu({ organizationId: "az", kullaniciSayisi: 11, kullaniciLimiti: 10 }),
      kotaDurumu({ organizationId: "cok", kullaniciSayisi: 30, kullaniciLimiti: 10 }),
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

describe("depolama kotası", () => {
  const dep = (bayt: number, limitMb: number) =>
    kotaDurumu({ organizationId: "o", kullaniciSayisi: 1, kullaniciLimiti: 10, depolamaBayt: bayt, depolamaLimitiMb: limitMb });

  test("bayt megabayta çevrilir", () => {
    /*
      Limit MB cinsinden giriliyor. İki farklı birimi karşılaştırmak, oranı
      bin katı yanlış hesaplamak demekti.
    */
    assert.equal(dep(50 * 1024 * 1024, 100).depolama.kullanilan, 50);
    assert.equal(dep(50 * 1024 * 1024, 100).depolama.oran, 50);
  });

  test("bir megabaytın altı yukarı yuvarlanır", () => {
    // 0,4 MB'ı "0 MB" saymak, dolmuş bir kurumu boş göstermeye giden yol.
    assert.equal(dep(400 * 1024, 100).depolama.kullanilan, 1);
  });

  test("limiti aşan depolama genel durumu bozar", () => {
    assert.equal(dep(200 * 1024 * 1024, 100).durum, "asildi");
  });

  test("depolama ölçümü yoksa kota sorunsuz görünür", () => {
    // Ölçüm gelmediğinde kurumu suçlamıyoruz; bilinmeyen, aşım değildir.
    const d = kotaDurumu({ organizationId: "o", kullaniciSayisi: 1, kullaniciLimiti: 10, depolamaLimitiMb: 100 });
    assert.equal(d.depolama.kullanilan, 0);
    assert.equal(d.durum, "normal");
  });

  test("depolama da sıralamayı etkiler", () => {
    const liste = [
      kotaDurumu({ organizationId: "bos", kullaniciSayisi: 1, kullaniciLimiti: 10, depolamaBayt: 0, depolamaLimitiMb: 100 }),
      kotaDurumu({ organizationId: "dolu", kullaniciSayisi: 1, kullaniciLimiti: 10, depolamaBayt: 120 * 1024 * 1024, depolamaLimitiMb: 100 }),
    ];
    assert.equal(kotayaGoreSirala(liste)[0].organizationId, "dolu");
  });
});
