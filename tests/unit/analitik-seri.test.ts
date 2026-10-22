import assert from "node:assert/strict";
import test from "node:test";
import { analitikSerisi, degisim, etiketliMi, gunEkle } from "@/lib/analitik-seri";

test("boş günler de çubuk; pencere bugünle biter", () => {
  const { gunler } = analitikSerisi([{ gun: "2026-10-20", ziyaretci: 3, sayfa: 5, form: 1 }], "2026-10-22", 7);
  assert.equal(gunler.length, 7);
  assert.equal(gunler[0].gun, "2026-10-16");
  assert.equal(gunler[6].gun, "2026-10-22");
  assert.deepEqual(gunler.map((g) => g.ziyaretci), [0, 0, 0, 0, 3, 0, 0]);
});

test("pencereden önceki günler önceki döneme gider; daha eskisi hiçbir yere", () => {
  const { onceki, gunler } = analitikSerisi([
    { gun: "2026-10-01", ziyaretci: 99, sayfa: 99, form: 99 }, // iki pencereden de eski
    { gun: "2026-10-09", ziyaretci: 2, sayfa: 4, form: 0 },     // önceki dönem (09–15)
    { gun: "2026-10-15", ziyaretci: 1, sayfa: 1, form: 1 },     // önceki dönemin son günü
    { gun: "2026-10-16", ziyaretci: 5, sayfa: 8, form: 0 },     // pencerenin ilk günü
  ], "2026-10-22", 7);
  assert.deepEqual(onceki, { ziyaretci: 3, sayfa: 5, form: 1 });
  assert.equal(gunler[0].ziyaretci, 5);
});

test("ay ve yıl sınırında gün aritmetiği kaymaz", () => {
  assert.equal(gunEkle("2026-03-01", -1), "2026-02-28");
  assert.equal(gunEkle("2026-12-31", 1), "2027-01-01");
  /* Türkiye'de yaz saati yok ama hesap UTC'ye sabitli; 29 Mart'ta da kaymıyor. */
  assert.equal(gunEkle("2026-03-30", -1), "2026-03-29");
});

test("değişim: önceki dönem sıfırsa yüzde yok", () => {
  assert.equal(degisim(10, 0), null);
  assert.equal(degisim(15, 10), 50);
  assert.equal(degisim(5, 10), -50);
});

test("etiket: 30 günde beşte bir, bugün her zaman etiketli", () => {
  assert.ok(etiketliMi(29, 30));
  assert.ok(!etiketliMi(28, 30));
  assert.ok(etiketliMi(24, 30));
  assert.equal(Array.from({ length: 7 }, (_, i) => etiketliMi(i, 7)).filter(Boolean).length, 7);
  assert.equal(Array.from({ length: 30 }, (_, i) => etiketliMi(i, 30)).filter(Boolean).length, 6);
});
