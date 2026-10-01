/*
  BAKİYESİ KAPANAN CARİ ARŞİVE DÜŞER.

  En kritik ayrım: sıfır bakiye iki ayrı şey olabilir. Borcu kapanmış
  cari de sıfırdır, hiç hareket görmemiş yeni cari de. İkincisini arşive
  atmak yeni açılan cariyi gözden kaybettirirdi; bu test o ayrımı
  sabitliyor.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { cariBolumle, cariDurumu } from "../../lib/cari-arsiv";

const cari = (debt: number, collections: number, refunds = 0) => ({
  debt,
  collections,
  refunds,
  balance: Math.max(0, debt + refunds - collections),
});

describe("cari arşivi", () => {
  test("açık bakiye aktif kalır", () => {
    assert.equal(cariDurumu(cari(100_00, 40_00)), "acik");
  });

  test("borcu tamamen tahsil edilen cari arşive düşer", () => {
    assert.equal(cariDurumu(cari(100_00, 100_00)), "arsiv");
  });

  test("hiç hareketi olmayan cari arşive DÜŞMEZ", () => {
    // Bakiyesi sıfır ama kapanmadı: henüz başlamadı.
    assert.equal(cariDurumu(cari(0, 0)), "hareketsiz");
  });

  test("tahsilatı tamamen iade edilen cari de arşivdedir", () => {
    // Borç 100, tahsilat 100, iade 100 → bakiye yine 100: hâlâ açık.
    assert.equal(cariDurumu({ debt: 100_00, collections: 100_00, refunds: 100_00, balance: 100_00 }), "acik");
    // İade sonrası yeniden tahsil edilirse kapanır.
    assert.equal(cariDurumu({ debt: 100_00, collections: 200_00, refunds: 100_00, balance: 0 }), "arsiv");
  });

  test("arşivdeki cariye ek hizmet girilince aktife döner", () => {
    const kapali = cari(100_00, 100_00);
    assert.equal(cariDurumu(kapali), "arsiv");
    // Ek hizmet borcu artırır; bakiye yeniden açılır.
    assert.equal(cariDurumu(cari(150_00, 100_00)), "acik");
  });

  test("bölme sırayı korur ve hiçbir cariyi düşürmez", () => {
    const liste = [
      { ad: "a", ...cari(100_00, 100_00) },
      { ad: "b", ...cari(100_00, 10_00) },
      { ad: "c", ...cari(0, 0) },
      { ad: "d", ...cari(50_00, 50_00) },
    ];
    const { aktif, arsiv } = cariBolumle(liste);
    assert.deepEqual(aktif.map((x) => x.ad), ["b", "c"]);
    assert.deepEqual(arsiv.map((x) => x.ad), ["a", "d"]);
    assert.equal(aktif.length + arsiv.length, liste.length);
  });
});
