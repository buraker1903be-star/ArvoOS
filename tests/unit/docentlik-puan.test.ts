/*
  DOÇENTLİK PUANI — FAALİYET PUANI TESTLERİ (F6 PR1).

  İlk iki bölüm ArvoLab tests/unit/docentlik-puan.test.ts'in (b62bfcf)
  aynısı; yalnızca içe aktarma yolu ArvoOS çekirdeğine çevrildi. Kaynak
  senaryolar hiç değiştirilmedi: taşınan kod aynı beklentileri
  karşılamalı. Sonraki bölümler taşımada eklendi (doğrulama, cephe,
  sınırlar, yuvarlama, kural sürümü). Bütün veriler yapay.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { korunanBirimPuan } from "@/lib/docentlik/puan";

const kayit = (birim: number, puan: number, kriter = "k1") => ({
  criteria_id: kriter,
  unit_count: birim,
  computed_points: puan,
});

describe("doçentlik düzenlemede birim puan", () => {
  test("kriter aynıysa kaydın kendi puanı korunur", () => {
    // Kriter bu arada 20'ye çıkmış olabilir; kayıt 12'den hesaplanmıştı.
    assert.equal(korunanBirimPuan(kayit(2, 24), "k1"), 12);
  });

  test("kriter değiştiyse türetilmez", () => {
    assert.equal(korunanBirimPuan(kayit(2, 24), "k2"), null);
  });

  test("ondalık kayması birikmiyor", () => {
    // 3 × 0.1 kayan noktada 0.30000000000000004; bölünce geri 0.1 gelmeli.
    assert.equal(korunanBirimPuan(kayit(3, 3 * 0.1), "k1"), 0.1);
  });

  test("sıfır birimli bozuk satırda bölme yapılmıyor", () => {
    assert.equal(korunanBirimPuan(kayit(0, 10), "k1"), null);
  });

  test("puanı sayı olmayan satır kritere bırakılıyor", () => {
    assert.equal(korunanBirimPuan(kayit(2, Number.NaN), "k1"), null);
  });

  /*
    0 puanlı kriter gerçek: "şart ama puansız" faaliyetler var. null ile
    karıştırılırsa kriterin güncel puanı çekilir ve kayıt sessizce
    fiyatlanır.
  */
  test("gerçekten sıfır puanlı kayıt null ile karışmıyor", () => {
    assert.equal(korunanBirimPuan(kayit(4, 0), "k1"), 0);
  });
});

import { paylasimKatsayisi, puanHesapla } from "@/lib/docentlik/puan";

describe("ortak yazarlık", () => {
  const kriter = { baslica_yazar_katsayisi: 0.8, diger_yazar_katsayisi: 0.5 };

  test("tek yazar ve katsayısız kriter tam puan alır", () => {
    assert.equal(paylasimKatsayisi(kriter, 1, false), 1);
    assert.equal(paylasimKatsayisi({ baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null }, 4, false), 1);
    assert.equal(paylasimKatsayisi(null, 3, true), 1);
  });

  test("çok yazarlıda başlıca ve diğer yazar katsayısı", () => {
    assert.equal(paylasimKatsayisi(kriter, 3, true), 0.8);
    assert.equal(paylasimKatsayisi(kriter, 3, false), 0.5);
    assert.equal(puanHesapla(1, 20, 0.5), 10);
  });

  test("katsayılı kaydın birim puanı düzenlemede korunur", () => {
    assert.equal(korunanBirimPuan({ criteria_id: "a", unit_count: 2, computed_points: 16, paylasim_katsayisi: 0.8 }, "a"), 10);
    // Eski satır: katsayı yok, 1 sayılır.
    assert.equal(korunanBirimPuan({ criteria_id: "a", unit_count: 2, computed_points: 20 }, "a"), 10);
  });
});

describe("eşit bölüşüm", () => {
  test("puan yazar sayısına eşit bölünür, katsayılardan önce gelir", () => {
    assert.equal(paylasimKatsayisi({ esit_bolusum: true, baslica_yazar_katsayisi: 0.8 }, 4, true), 0.25);
    assert.equal(paylasimKatsayisi({ esit_bolusum: true }, 1, false), 1);
    const ucte = paylasimKatsayisi({ esit_bolusum: true }, 3, true);
    assert.equal(puanHesapla(1, 30, ucte), 10);
    // Düzenlemede birim puan geri türetilebilmeli (kayıtta katsayı tam hâliyle duruyor).
    assert.equal(korunanBirimPuan({ criteria_id: "a", unit_count: 1, computed_points: 10, paylasim_katsayisi: ucte }, "a"), 30);
  });
});

/* ---------------------------------------------------------------------- */
/* Taşımada eklenen senaryolar                                            */
/* ---------------------------------------------------------------------- */

import { paylasimTanimli, faaliyetPuani, duzenlemePuani } from "@/lib/docentlik/puan";
import {
  birimSayisiOku,
  faaliyetAyrintisiOku,
  hedefPuanlariOku,
  katsayiOku,
  kriterPuaniOku,
  ondalikOku,
} from "@/lib/docentlik/dogrulama";
import { KURAL_SURUMLERI, VARSAYILAN_KURAL, VARSAYILAN_KURAL_SURUMU, kuralSeti, yuvarla } from "@/lib/docentlik/kural-surumu";

describe("katsayı: kategoriye göre (kriter verisi)", () => {
  test("bozuk katsayı (0, negatif, 1'den büyük, NaN) tam puana düşer", () => {
    for (const bozuk of [0, -0.5, 1.2, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(paylasimKatsayisi({ baslica_yazar_katsayisi: bozuk, diger_yazar_katsayisi: bozuk }, 3, true), 1, String(bozuk));
    }
  });
  test("katsayı tam 1 sınırı geçerli", () => {
    assert.equal(paylasimKatsayisi({ diger_yazar_katsayisi: 1 }, 2, false), 1);
  });
  test("başlıca yazar tanımlı, diğer tanımsız: diğer yazar tam puan alır (kaynağın davranışı)", () => {
    const k = { baslica_yazar_katsayisi: 0.8, diger_yazar_katsayisi: null };
    assert.equal(paylasimKatsayisi(k, 4, true), 0.8);
    assert.equal(paylasimKatsayisi(k, 4, false), 1);
  });
  test("paylasimTanimli yalnızca kural girilmişse doğru", () => {
    assert.equal(paylasimTanimli(null), false);
    assert.equal(paylasimTanimli({}), false);
    assert.equal(paylasimTanimli({ baslica_yazar_katsayisi: null, diger_yazar_katsayisi: null, esit_bolusum: false }), false);
    assert.equal(paylasimTanimli({ esit_bolusum: true }), true);
    assert.equal(paylasimTanimli({ diger_yazar_katsayisi: 0.5 }), true);
    // 0 da "girilmiş" sayılır (veritabanı zaten reddediyor); hesapta 1'e düşer.
    assert.equal(paylasimTanimli({ baslica_yazar_katsayisi: 0 }), true);
  });
});

describe("yazar sayısı ve sırası", () => {
  test("eşit bölüşüm: 2..10 yazar 1/n", () => {
    for (let n = 2; n <= 10; n++) assert.equal(paylasimKatsayisi({ esit_bolusum: true }, n, n % 2 === 0), 1 / n);
  });
  test("eşit bölüşümde yazar sırası (başlıca) fark etmez", () => {
    assert.equal(paylasimKatsayisi({ esit_bolusum: true, baslica_yazar_katsayisi: 0.9, diger_yazar_katsayisi: 0.1 }, 5, true), 0.2);
    assert.equal(paylasimKatsayisi({ esit_bolusum: true, baslica_yazar_katsayisi: 0.9, diger_yazar_katsayisi: 0.1 }, 5, false), 0.2);
  });
  test("ondalık yazar sayısı aşağı yuvarlanır (form izin vermiyor; çekirdek kaynağı izler)", () => {
    assert.equal(paylasimKatsayisi({ esit_bolusum: true }, 3.7, true), 1 / 3);
  });
  test("tanımsız/sonsuz/0 yazar sayısı tam puan", () => {
    for (const n of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(paylasimKatsayisi({ esit_bolusum: true }, n, true), 1);
  });
  test("tek yazar her zaman başlıca sayılır (form 'hayır' dese de)", () => {
    const r = faaliyetAyrintisiOku({ yazarSayisi: "1", baslicaYazar: "hayir" });
    assert.deepEqual(r, { ok: true, deger: { yazarSayisi: 1, baslica: true, tarih: null } });
  });
  test("başlıca yazar varsayılanı 'evet'", () => {
    const r = faaliyetAyrintisiOku({ yazarSayisi: "3" });
    assert.ok(r.ok && r.deger.baslica);
  });
});

describe("yuvarlama", () => {
  test("puan 1e-6'ya yuvarlanır; 1/3 bölüşümü 30 puanı 10'a geri getirir", () => {
    assert.equal(puanHesapla(1, 30, 1 / 3), 10);
    assert.equal(puanHesapla(1, 10, 1 / 3), 3.333333);
    assert.equal(puanHesapla(3, 0.1, 1), 0.3);
  });
  test("yarım değer Math.round'un yönüyle (yukarı) yuvarlanır", () => {
    assert.equal(yuvarla(0.0000005), 0.000001);
    assert.equal(yuvarla(2.5e-7), 0);
  });
  test("negatif yarım değer Math.round gibi sıfıra doğru (kaynağın davranışı)", () => {
    assert.equal(yuvarla(-0.0000005), -0);
  });
});

describe("girdi doğrulama (ArvoLab formu)", () => {
  test("ondalık virgül ve nokta", () => {
    assert.equal(ondalikOku(" 2,5 "), 2.5);
    assert.equal(ondalikOku("2.5"), 2.5);
    // Kaynak davranışı, bilinen tuhaflık: binlik ayırıcı ondalık sanılır.
    assert.equal(ondalikOku("1.500"), 1.5);
    assert.ok(Number.isNaN(ondalikOku("1,5,0")));
  });
  test("birim sayısı: boş 1, sıfır/negatif/metin reddedilir", () => {
    assert.deepEqual(birimSayisiOku(""), { ok: true, deger: 1 });
    assert.deepEqual(birimSayisiOku(null), { ok: true, deger: 1 });
    assert.deepEqual(birimSayisiOku("0,5"), { ok: true, deger: 0.5 });
    for (const bozuk of ["0", "-1", "abc", "Infinity"]) {
      assert.deepEqual(birimSayisiOku(bozuk), { ok: false, hata: "Adet / birim sayısı 0'dan büyük bir sayı olmalıdır." }, bozuk);
    }
  });
  test("yazar sayısı 1..500 tam sayı", () => {
    assert.ok(faaliyetAyrintisiOku({ yazarSayisi: "500" }).ok);
    for (const bozuk of ["0", "501", "2,5", "1.5", "x"]) {
      assert.deepEqual(faaliyetAyrintisiOku({ yazarSayisi: bozuk }), { ok: false, hata: "Yazar sayısı 1 ile 500 arasında bir tam sayı olmalı." }, bozuk);
    }
  });
  test("tarih biçimi", () => {
    assert.deepEqual(faaliyetAyrintisiOku({ faaliyetTarihi: "2024-05-01" }), { ok: true, deger: { yazarSayisi: 1, baslica: true, tarih: "2024-05-01" } });
    assert.deepEqual(faaliyetAyrintisiOku({ faaliyetTarihi: "01.05.2024" }), { ok: false, hata: "Tarih geçersiz." });
  });
  test("katsayı alanı: boş null, (0,1] dışı hata", () => {
    assert.deepEqual(katsayiOku("  "), { ok: true, deger: null });
    assert.deepEqual(katsayiOku("0,8"), { ok: true, deger: 0.8 });
    assert.deepEqual(katsayiOku("1"), { ok: true, deger: 1 });
    for (const bozuk of ["0", "1,01", "-0,2", "a"]) assert.equal(katsayiOku(bozuk).ok, false, bozuk);
  });
  test("kriter puanı: 0 geçerli; eklemede boş zorunlu, düzenlemede boş 0 (kaynak davranışı)", () => {
    assert.deepEqual(kriterPuaniOku("0", "ekleme"), { ok: true, deger: 0 });
    assert.deepEqual(kriterPuaniOku("", "ekleme"), { ok: false, hata: "Kod, etiket ve puan alanları zorunludur." });
    assert.deepEqual(kriterPuaniOku("", "duzenleme"), { ok: true, deger: 0 });
    assert.deepEqual(kriterPuaniOku("-1", "duzenleme"), { ok: false, hata: "Birim başına puan 0 veya daha büyük bir sayı olmalıdır." });
  });
  test("hedef: en az biri; doktora sonrası satırda azami yok sayılır", () => {
    assert.deepEqual(hedefPuanlariOku({ asgariPuan: "100", azamiPuan: "", doktoraSonrasi: false }), { ok: true, deger: { asgari: 100, azami: null } });
    assert.deepEqual(hedefPuanlariOku({ asgariPuan: "", azamiPuan: "", doktoraSonrasi: false }), { ok: false, hata: "Asgari ya da azami puandan en az birini girin." });
    assert.deepEqual(hedefPuanlariOku({ asgariPuan: "", azamiPuan: "10", doktoraSonrasi: true }), { ok: false, hata: "Asgari ya da azami puandan en az birini girin." });
    assert.deepEqual(hedefPuanlariOku({ asgariPuan: "90", azamiPuan: "abc", doktoraSonrasi: true }), { ok: true, deger: { asgari: 90, azami: null } });
    assert.deepEqual(hedefPuanlariOku({ asgariPuan: "0", doktoraSonrasi: false }), { ok: false, hata: "Puanlar 0'dan büyük sayı olmalı." });
  });
});

describe("cephe: ekleme ve düzenleme", () => {
  const kriter = { points_per_unit: 20, baslica_yazar_katsayisi: 0.8, diger_yazar_katsayisi: 0.5 };

  test("ekleme: birim × birim puan × katsayı; çıktı kural sürümünü taşır", () => {
    const r = faaliyetPuani({ birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" }, kriter);
    assert.ok(r.ok);
    assert.equal(r.deger.puan, 20);
    assert.equal(r.deger.paylasimKatsayisi, 0.5);
    assert.equal(r.deger.kuralSurumu, VARSAYILAN_KURAL_SURUMU);
  });

  test("ekleme: hata sırası kaynakla aynı (önce birim, sonra yazar)", () => {
    assert.deepEqual(faaliyetPuani({ birimSayisi: "0", yazarSayisi: "0" }, kriter), { ok: false, hata: "Adet / birim sayısı 0'dan büyük bir sayı olmalıdır." });
  });

  test("düzenleme: kriter ve yazar aynıysa kriter OKUNMAZ, eski birim puan ve katsayı korunur", () => {
    const mevcut = { criteria_id: "a", unit_count: 2, computed_points: 16, paylasim_katsayisi: 0.8, yazar_sayisi: 3, baslica_yazar: true };
    let okundu = 0;
    const r = duzenlemePuani({ birimSayisi: "3", yazarSayisi: "3", baslicaYazar: "evet" }, mevcut, "a", () => (okundu++, kriter));
    assert.equal(okundu, 0);
    assert.ok(r.ok);
    // Eski birim puan 10 (kriter sonradan 20 olmuş olsa da), katsayı 0,8.
    assert.equal(r.deger.puan, 24);
    assert.equal(r.deger.korundu, true);
  });

  test("düzenleme: yazar değiştiyse birim puan korunur, katsayı kriterden yeniden", () => {
    const mevcut = { criteria_id: "a", unit_count: 2, computed_points: 16, paylasim_katsayisi: 0.8, yazar_sayisi: 3, baslica_yazar: true };
    const r = duzenlemePuani({ birimSayisi: "2", yazarSayisi: "3", baslicaYazar: "hayir" }, mevcut, "a", () => kriter);
    assert.ok(r.ok);
    assert.equal(r.deger.birimPuan, 10);
    assert.equal(r.deger.paylasimKatsayisi, 0.5);
    assert.equal(r.deger.puan, 10);
    assert.equal(r.deger.korundu, false);
  });

  test("düzenleme: kriter değiştiyse birim puan yeni kriterden", () => {
    const mevcut = { criteria_id: "a", unit_count: 2, computed_points: 16, paylasim_katsayisi: 0.8, yazar_sayisi: 3, baslica_yazar: true };
    const r = duzenlemePuani({ birimSayisi: "1", yazarSayisi: "3", baslicaYazar: "evet" }, mevcut, "b", () => ({ points_per_unit: 7 }));
    assert.ok(r.ok);
    assert.equal(r.deger.puan, 7);
  });

  test("düzenleme: eski satır (yazar ve katsayı sütunu yok) tek yazar ve 1 sayılır", () => {
    const r = duzenlemePuani({ birimSayisi: "2" }, { criteria_id: "a", unit_count: 1, computed_points: 12 }, "a", () => {
      throw new Error("kriter okunmamalıydı");
    });
    assert.ok(r.ok);
    assert.equal(r.deger.puan, 24);
  });
});

describe("kural sürümü", () => {
  test("varsayılan sürüm ArvoLab b62bfcf davranışı", () => {
    assert.equal(VARSAYILAN_KURAL.yuvarlamaCarpani, 1e6);
    assert.equal(VARSAYILAN_KURAL.azamiYazarSayisi, 500);
    assert.equal(VARSAYILAN_KURAL.kaynak.commit, "b62bfcf698e680b73810cf747cc7355020f95b72");
    assert.deepEqual(Object.keys(KURAL_SURUMLERI), ["arvolab-2026-10-27"]);
  });
  test("bilinmeyen sürüm tahmin edilmez", () => {
    assert.equal(kuralSeti("yok"), null);
    assert.equal(kuralSeti("toString"), null);
    assert.equal(kuralSeti("arvolab-2026-10-27"), VARSAYILAN_KURAL);
  });
  test("sürüm parametresi hesaba gerçekten girer (sürümlerin ayrılabildiği)", () => {
    const deneme = { ...VARSAYILAN_KURAL, kod: "deneme", yuvarlamaCarpani: 100, azamiYazarSayisi: 3 };
    assert.equal(puanHesapla(1, 10, 1 / 3, deneme), 3.33);
    assert.equal(faaliyetAyrintisiOku({ yazarSayisi: "4" }, deneme).ok, false);
    const r = faaliyetPuani({ birimSayisi: "1" }, { points_per_unit: 1 }, deneme);
    assert.ok(r.ok && r.deger.kuralSurumu === "deneme");
  });
});
