import assert from "node:assert/strict";
import test from "node:test";
import { gunDonemde, primDonemi, primDonemiYazisi } from "@/lib/prim-donemi";

test("dönemler Türkiye takvimiyle; bitiş hariç", () => {
  const buAy = primDonemi("bu-ay", "2026-10-09");
  assert.deepEqual([buAy?.startKey, buAy?.endKey], ["2026-10-01", "2026-11-01"]);
  // Türkiye gece yarısı UTC'de bir önceki günün 21:00'i.
  assert.equal(buAy?.start.toISOString(), "2026-09-30T21:00:00.000Z");
  const gecen = primDonemi("gecen-ay", "2026-01-15");
  assert.deepEqual([gecen?.startKey, gecen?.endKey], ["2025-12-01", "2026-01-01"]);
  const yil = primDonemi("bu-yil", "2026-10-09");
  assert.deepEqual([yil?.startKey, yil?.endKey], ["2026-01-01", "2027-01-01"]);
});

test("tümü ve geçersiz özel aralık süzgeçsiz", () => {
  assert.equal(primDonemi("tum", "2026-10-09"), null);
  assert.equal(primDonemi(undefined, "2026-10-09"), null);
  assert.equal(primDonemi("ozel", "2026-10-09", "2026-10-10", "2026-10-01"), null);
  const ozel = primDonemi("ozel", "2026-10-09", "2026-09-01", "2026-09-30");
  assert.deepEqual([ozel?.startKey, ozel?.endKey], ["2026-09-01", "2026-10-01"]);
  assert.equal(primDonemiYazisi(ozel!), "1 Eylül 2026 – 30 Eylül 2026");
});

test("gün anahtarı dönemde", () => {
  const donem = primDonemi("bu-ay", "2026-10-09");
  assert.ok(gunDonemde("2026-10-01", donem));
  assert.ok(!gunDonemde("2026-11-01", donem));
  assert.ok(gunDonemde("2020-01-01", null));
});
