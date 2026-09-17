import assert from "node:assert/strict";
import test from "node:test";
import { istanbulMidnight, monthStartKey, todayInIstanbul } from "@/lib/istanbul-date";

test("gece 00:00–03:00 arası tarih bir gün geri kaymaz", () => {
  // Gerileme: sunucu UTC'de çalıştığı için ayın 1'inde gece girilen tahsilat
  // önceki aya düşüyordu.
  assert.equal(todayInIstanbul(new Date("2026-03-01T00:30:00Z")), "2026-03-01");
  assert.equal(todayInIstanbul(new Date("2026-02-28T22:30:00Z")), "2026-03-01");
  assert.equal(todayInIstanbul(new Date("2026-03-01T20:59:59Z")), "2026-03-01");
  assert.equal(todayInIstanbul(new Date("2026-03-01T21:00:00Z")), "2026-03-02");
});

test("Türkiye yaz saati uygulamaz: yıl boyu UTC+3", () => {
  assert.equal(todayInIstanbul(new Date("2026-07-15T21:30:00Z")), "2026-07-16");
  assert.equal(todayInIstanbul(new Date("2026-01-15T21:30:00Z")), "2026-01-16");
});

test("gün anahtarı Türkiye gece yarısının UTC anına çevrilir", () => {
  assert.equal(istanbulMidnight("2026-03-01").toISOString(), "2026-02-28T21:00:00.000Z");
});

test("ay başı anahtarı, ay taşmasıyla birlikte", () => {
  assert.equal(monthStartKey(2026, 3), "2026-03-01");
  assert.equal(monthStartKey(2026, 13), "2027-01-01", "13. ay sonraki yıla taşar");
  assert.equal(monthStartKey(2026, 0), "2025-12-01", "0. ay önceki yıla taşar");
});
