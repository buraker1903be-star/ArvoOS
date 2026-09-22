import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { binKrediFiyati, krediPaketi, KREDI_PAKETLERI } from "@/lib/ai-kredi-paketleri";

describe("AI kredi paketleri", () => {
  test("paket kodları benzersiz", () => {
    const kodlar = KREDI_PAKETLERI.map((paket) => paket.kod);
    assert.equal(new Set(kodlar).size, kodlar.length);
  });

  test("bilinmeyen kod null döner", () => {
    // Satın alma isteği istemciden geliyor; tanınmayan kod sessizce
    // varsayılana düşerse müşteri istemediği paketi öder.
    assert.equal(krediPaketi("yok"), null);
    assert.equal(krediPaketi("k500")?.kredi, 500);
  });

  test("büyük paket bin kredi başına daha ucuz", () => {
    /*
      Değilse kimse büyüğünü almaz ve paket kademesi anlamını yitirir.
      Fiyat değiştirilirken bu test kırılırsa kademe ters çevrilmiş
      demektir.
    */
    const birim = KREDI_PAKETLERI.map(binKrediFiyati);
    for (let i = 1; i < birim.length; i += 1) {
      assert.ok(birim[i] < birim[i - 1], `${KREDI_PAKETLERI[i].kod} daha pahalı: ${birim[i]} >= ${birim[i - 1]}`);
    }
  });

  test("fiyatlar maliyetin üstünde", () => {
    /*
      22.09.2026: kredi maliyeti ≈ $0,0012 ≈ 5 kuruş (kur 40 varsayımıyla).
      Marjı burada sabitlemiyoruz ama zarar eden bir paket kazara
      girilemesin: en ucuz paket bile kredi başına 5 kuruşun üstünde
      olmalı.
    */
    for (const paket of KREDI_PAKETLERI) {
      assert.ok(paket.fiyat / paket.kredi > 5, `${paket.kod} kredi başına 5 kuruşun altında`);
    }
  });
});
