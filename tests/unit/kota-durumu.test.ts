import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { davetDurumu, ekKullaniciSayisi, ekKullaniciUcretiKurus, kotaDurumu, kotayaGoreSirala } from "@/lib/kota-durumu";

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

describe("davet durumu ve ek kullanıcı", () => {
  const BIRIM = 24_900; // 249 TL/ay, fiyat listesindeki ek kullanıcı kalemi
  const dur = (aktif, limit, tavan = 10, birim = BIRIM) =>
    davetDurumu({ aktifKullanici: aktif, limit, tavan, birimKurus: birim });

  test("dahil limitin altında davet ücretsiz", () => {
    const d = dur(2, 3);
    assert.equal(d.engel, null);
    assert.equal(d.yeniEkKoltuk, 0);
    assert.equal(d.ekUcretKurus, 0);
  });

  test("limite eşitken gönderilen davet İLK ek koltuğu açar", () => {
    /*
      Üç kullanıcılık pakette üçüncü kullanıcı hakkın içinde; yeni davet
      dördüncüyü yaratıyor, yani ilk ücretli koltuk. Eskiden burada davet
      DURUYORDU ve kullanıcıya "paketinizi yükseltin" deniyordu — oysa
      fiyat listesi aynı kişiye 249 TL diyordu.
    */
    const d = dur(3, 3);
    assert.equal(d.engel, null);
    assert.equal(d.yeniEkKoltuk, 1);
    assert.equal(d.ekUcretKurus, 24_900);
  });

  test("ek koltuklar birikir", () => {
    assert.equal(dur(5, 3).yeniEkKoltuk, 3);
    assert.equal(dur(5, 3).ekUcretKurus, 3 * BIRIM);
  });

  test("tavan dolunca davet durur", () => {
    // 3 dahil + 2 ek koltuk = 5 kişilik hak; altıncı davet durur.
    const d = dur(5, 3, 2);
    assert.match(d.engel ?? "", /hakkınız doldu \(5\/3 dahil, 2 ek koltuk\)/);
    assert.equal(d.ekUcretKurus, 0, "durdurulan davet ücret üretmemeli");
  });

  test("tavan sıfırken eski davranış: dahil limit dolunca durur", () => {
    assert.match(dur(3, 3, 0).engel ?? "", /hakkınız doldu/);
  });

  test("lisans satırı yoksa sınır uygulanmaz", () => {
    /*
      Olmayan bir limiti gerekçe gösterip daveti durdurmak, kurulumu yarım
      kalmış bir kurumu tamamen çalışmaz hale getirirdi.
    */
    assert.equal(dur(99, null).engel, null);
    assert.equal(dur(99, undefined).engel, null);
    assert.equal(dur(99, null).ekUcretKurus, 0, "limitsiz kuruma ek koltuk faturalanmaz");
  });

  test("sıfır limit sınırsız sayılır", () => {
    // user_limit > 0 kısıtı var; yine de sıfır gelirse daveti kilitlemiyoruz.
    assert.equal(dur(99, 0).engel, null);
    assert.equal(dur(99, 0).ekUcretKurus, 0);
  });

  test("birim fiyat girilmemişse koltuk sayılır, ücret sıfır kalır", () => {
    /*
      Ücreti olmayan bir kuruma (kurucunun kendi kurumu, özel anlaşma)
      uydurma bir rakam yazmaktansa sıfır geçmek doğru: fatura tutarı
      kurucunun girdiği değerden gelir.
    */
    const d = dur(5, 3, 10, null);
    assert.equal(d.yeniEkKoltuk, 3);
    assert.equal(d.ekUcretKurus, 0);
  });
});

describe("ek kullanıcı ücreti", () => {
  test("aktif üye dahil limitin altındayken ücret yok", () => {
    assert.equal(ekKullaniciSayisi(2, 3), 0);
    assert.equal(ekKullaniciUcretiKurus(2, 3, 24_900), 0);
  });

  test("aşan her kullanıcı ayrı ücretlenir", () => {
    assert.equal(ekKullaniciSayisi(7, 3), 4);
    assert.equal(ekKullaniciUcretiKurus(7, 3, 24_900), 99_600);
  });

  test("pasife alınan hesap ücreti aynı dönem içinde düşürür", () => {
    /*
      Sayı türetilmiş (aktif üye − dahil limit), ayrı bir sayaç yok: bir
      hesap pasife alınınca ek koltuk kendiliğinden azalıyor. Ayrı sayaç
      tutulsaydı pasife alma, silme ve davet iptali yollarının üçünü de
      azaltmak gerekirdi; biri unutulsa kurum ödemediği koltuğa fatura
      görürdü.
    */
    assert.equal(ekKullaniciUcretiKurus(6, 3, 24_900), 3 * 24_900);
    assert.equal(ekKullaniciUcretiKurus(5, 3, 24_900), 2 * 24_900);
  });

  test("limit yoksa ücret yok", () => {
    assert.equal(ekKullaniciUcretiKurus(99, null, 24_900), 0);
    assert.equal(ekKullaniciUcretiKurus(99, 0, 24_900), 0);
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
