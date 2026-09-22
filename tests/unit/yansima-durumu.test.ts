import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { yansimaDurumu } from "@/lib/yansima-durumu";

const DAMGA = "2026-09-22T20:24:00Z";
const alan = (etiket: string, kopya: string, konsol: string) => ({ etiket, kopya, konsol });

describe("yansıma durumu", () => {
  test("bütün alanlar tutuyorsa uyarı yok", () => {
    const d = yansimaDurumu(
      { damga: DAMGA, alanlar: [alan("durum", "active", "active")] },
      "ArvoLab",
    );
    assert.equal(d.uyari, false);
    assert.match(d.notu, /güncel/);
  });

  /*
    AkademikMerkez'de yaşanan tam durum: konsol 10.000 derken ArvoLab'ın
    kopyasında hak hiç bildirilmemişti ve bu hiçbir yerde görünmüyordu.
  */
  test("fark varsa uyarır ve iki değeri de yazar", () => {
    const d = yansimaDurumu(
      {
        damga: "2026-09-16T19:00:00Z",
        alanlar: [alan("durum", "active", "active"), alan("AI hakkı", "bildirilmemiş", "10.000 kredi")],
      },
      "ArvoLab",
    );
    assert.equal(d.uyari, true);
    assert.match(d.notu, /AI hakkı bildirilmemiş \(burada 10\.000 kredi\)/);
    assert.match(d.notu, /16\.09\.2026/);
    // Tutan alan gürültü yapmamalı.
    assert.doesNotMatch(d.notu, /durum/);
  });

  test("birden çok fark virgülle sıralanır", () => {
    const d = yansimaDurumu(
      {
        damga: DAMGA,
        alanlar: [alan("durum", "trialing", "active"), alan("AI hakkı", "500 kredi", "10.000 kredi")],
      },
      "ArvoLab",
    );
    assert.match(d.notu, /durum trialing \(burada active\), AI hakkı 500 kredi/);
  });

  test("hiç yansıtılmamışsa uyarır", () => {
    const d = yansimaDurumu({ damga: null, alanlar: [alan("durum", "inactive", "active")] }, "Arc");
    assert.equal(d.uyari, true);
    assert.match(d.notu, /hiç yansıtılmamış/);
  });

  /*
    Okunamama uyarı DEĞİL: köprü anahtarı olmayan ortamda her kurum
    "sorunlu" görünür, uyarı da hızla göz ardı edilen bir süse dönerdi.
  */
  test("kopya okunamazsa uyarı yok ama durum söylenir", () => {
    const d = yansimaDurumu(null, "Randevu");
    assert.equal(d.uyari, false);
    assert.match(d.notu, /okunamadı/);
  });

  test("alan listesi boşsa kopya güncel sayılır", () => {
    const d = yansimaDurumu({ damga: DAMGA, alanlar: [] }, "Randevu");
    assert.equal(d.uyari, false);
  });
});
