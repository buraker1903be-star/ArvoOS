import assert from "node:assert/strict";
import test from "node:test";
import { ayEkle, ayIzgarasi, aralikta, goreliAd, gunEkle, gunMu, haftaGunu, kutuYazisi, uzunYazi, yaziMaskesi, yaziyiCoz } from "../../lib/takvim.ts";

/* TAKVİM (lib/takvim): panelin tarih seçicisinin hesapları. */

test("gün anahtarı doğrulaması taşan tarihi reddeder", () => {
  assert.ok(gunMu("2026-02-28"));
  assert.ok(gunMu("2028-02-29"));
  assert.ok(!gunMu("2026-02-29"));
  assert.ok(!gunMu("2026-13-01"));
  assert.ok(!gunMu("2026-7-9"));
  assert.ok(!gunMu(null));
});

test("ay ekleme ay sonuna kırpar, gün ekleme ay ve yıl atlar", () => {
  assert.equal(ayEkle("2026-01-31", 1), "2026-02-28");
  assert.equal(ayEkle("2028-01-31", 1), "2028-02-29");
  assert.equal(ayEkle("2026-12-15", 1), "2027-01-15");
  assert.equal(ayEkle("2026-03-31", -1), "2026-02-28");
  assert.equal(gunEkle("2026-12-31", 1), "2027-01-01");
  assert.equal(gunEkle("2026-03-01", -1), "2026-02-28");
});

test("hafta pazartesi başlar; ızgara 42 gün ve ayın 1'i doğru sütunda", () => {
  assert.equal(haftaGunu("2026-10-26"), 0); // pazartesi
  assert.equal(haftaGunu("2026-11-01"), 6); // pazar
  const izgara = ayIzgarasi(2026, 10);
  assert.equal(izgara.length, 42);
  assert.equal(izgara[0].gun, "2026-09-28");
  assert.equal(izgara.findIndex((h) => h.gun === "2026-10-01"), 3); // perşembe
  assert.equal(izgara.filter((h) => h.ayIcinde).length, 31);
});

test("aralık uçları dahil, verilmeyen uç sınırsız", () => {
  assert.ok(aralikta("2026-10-29", "2026-10-29", "2026-10-29"));
  assert.ok(!aralikta("2026-10-28", "2026-10-29"));
  assert.ok(aralikta("2030-01-01", "2026-10-29", ""));
});

test("yazılan tarih çözülür, yarım ya da geçersiz olan reddedilir", () => {
  assert.equal(yaziyiCoz("09.07.2026"), "2026-07-09");
  assert.equal(yaziyiCoz("9.7.2026"), "2026-07-09");
  assert.equal(yaziyiCoz("09/07/26"), "2026-07-09");
  assert.equal(yaziyiCoz("09072026"), "2026-07-09");
  assert.equal(yaziyiCoz("31.02.2026"), null);
  assert.equal(yaziyiCoz("09.07"), null);
});

test("maske noktaları koyar; yazılar Türkçe", () => {
  assert.equal(yaziMaskesi("0907"), "09.07");
  assert.equal(yaziMaskesi("09072026"), "09.07.2026");
  assert.equal(yaziMaskesi("9.7.2026"), "9.7.2026");
  // Art arda yazarken maske kendi noktasını taşır (eskiden "09.072026" oluyordu).
  assert.equal(yaziMaskesi("09.0720"), "09.07.20");
  assert.equal(yaziMaskesi("09.072026"), "09.07.2026");
  assert.equal(kutuYazisi("2026-07-09"), "09.07.2026");
  assert.equal(uzunYazi("2026-07-09"), "9 Temmuz 2026, Perşembe");
});

test("göreli ad yalnızca yakın günler için", () => {
  assert.equal(goreliAd("2026-10-29", "2026-10-29"), "Bugün");
  assert.equal(goreliAd("2026-10-30", "2026-10-29"), "Yarın");
  assert.equal(goreliAd("2026-11-05", "2026-10-29"), "7 gün sonra");
  assert.equal(goreliAd("2026-10-27", "2026-10-29"), "2 gün önce");
  assert.equal(goreliAd("2027-10-29", "2026-10-29"), null);
});
