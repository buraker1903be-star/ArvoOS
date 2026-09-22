import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { yansimaDurumu } from "@/lib/yansima-durumu";

const konsol = { status: "active", aiCreditLimit: 10_000 };

describe("yansıma durumu", () => {
  test("kopya konsolla aynıysa uyarı yok", () => {
    const d = yansimaDurumu(
      { syncedAt: "2026-09-22T20:24:00Z", status: "active", aiCreditLimit: 10_000 },
      konsol, "ArvoLab",
    );
    assert.equal(d.uyari, false);
    assert.match(d.notu, /güncel/);
  });

  /*
    AkademikMerkez'de yaşanan tam durum: konsol 10.000 derken ArvoLab'ın
    kopyasında hak hiç bildirilmemişti ve bu hiçbir yerde görünmüyordu.
  */
  test("AI hakkı farklıysa uyarır ve iki değeri de yazar", () => {
    const d = yansimaDurumu(
      { syncedAt: "2026-09-16T19:00:00Z", status: "active", aiCreditLimit: null },
      konsol, "ArvoLab",
    );
    assert.equal(d.uyari, true);
    assert.match(d.notu, /bildirilmemiş/);
    assert.match(d.notu, /10\.000 kredi/);
    assert.match(d.notu, /16\.09\.2026/);
  });

  test("durum farklıysa uyarır", () => {
    const d = yansimaDurumu(
      { syncedAt: "2026-09-22T20:24:00Z", status: "trialing", aiCreditLimit: 10_000 },
      konsol, "ArvoLab",
    );
    assert.equal(d.uyari, true);
    assert.match(d.notu, /trialing/);
    assert.match(d.notu, /active/);
  });

  test("hiç yansıtılmamışsa uyarır", () => {
    const d = yansimaDurumu({ syncedAt: null, status: "inactive", aiCreditLimit: null }, konsol, "ArvoLab");
    assert.equal(d.uyari, true);
    assert.match(d.notu, /hiç yansıtılmamış/);
  });

  /*
    Okunamama uyarı DEĞİL: köprü anahtarı olmayan ortamda her kurum
    "sorunlu" görünür, uyarı da hızla göz ardı edilen bir süse dönerdi.
  */
  test("kopya okunamazsa uyarı yok ama durum söylenir", () => {
    const d = yansimaDurumu(null, konsol, "ArvoLab");
    assert.equal(d.uyari, false);
    assert.match(d.notu, /okunamadı/);
  });

  test("AI hakkı iki tarafta da yoksa fark sayılmaz (Arc, Randevu)", () => {
    const d = yansimaDurumu(
      { syncedAt: "2026-09-22T20:24:00Z", status: "active", aiCreditLimit: null },
      { status: "active", aiCreditLimit: null }, "Arc",
    );
    assert.equal(d.uyari, false);
  });
});
