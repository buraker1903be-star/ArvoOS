import assert from "node:assert/strict";
import test from "node:test";
import { gunlukSeri } from "@/lib/gunluk-seri";

/*
  Genel bakış grafiği (ana ekran ve modül genel bakışları). Gün sınırı
  Türkiye saatiyle; önceki dönem kıyası aynı uzunlukta pencereyle.
*/

// 08.10.2026 12:00 İstanbul = 09:00 UTC
const SIMDI = Date.parse("2026-10-08T09:00:00Z");

test("bugün dahil 14 gün; son gün bugün", () => {
  const seri = gunlukSeri([], SIMDI);
  assert.equal(seri.days.length, 14);
  assert.equal(seri.days[13].key, "2026-10-08");
  assert.equal(seri.days[0].key, "2026-09-25");
  assert.ok(seri.days[13].isToday);
});

test("gece 01:00 İstanbul'daki kayıt aynı güne düşer (UTC'de önceki gün)", () => {
  // 08.10 01:00 İstanbul = 07.10 22:00 UTC
  const seri = gunlukSeri(["2026-10-07T22:00:00Z"], SIMDI);
  assert.equal(seri.today, 1);
});

test("toplam, önceki dönem ve yüzde değişim", () => {
  const seri = gunlukSeri([
    "2026-10-08T06:00:00Z", "2026-10-01T06:00:00Z", // bu dönem: 2
    "2026-09-20T06:00:00Z", "2026-09-15T06:00:00Z", "2026-09-12T06:00:00Z", "2026-09-11T06:00:00Z", // önceki: 4
    "2026-08-01T06:00:00Z", // pencere dışı
  ], SIMDI);
  assert.equal(seri.total, 2);
  assert.equal(seri.previous, 4);
  assert.equal(seri.delta, -50);
});

test("önceki dönem boşsa yüzde yok; ağırlık (tutar) verilebilir", () => {
  assert.equal(gunlukSeri(["2026-10-08T06:00:00Z"], SIMDI).delta, null);
  const seri = gunlukSeri(["2026-10-08T06:00:00Z", "2026-10-08T07:00:00Z"], SIMDI, 7, [1500, 2500]);
  assert.equal(seri.days.length, 7);
  assert.equal(seri.today, 4000);
  assert.equal(seri.max, 4000);
});
