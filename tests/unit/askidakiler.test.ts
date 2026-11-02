import assert from "node:assert/strict";
import test from "node:test";
import { askidakiKurumlar } from "@/lib/askidakiler";

const SIMDI = Date.parse("2026-11-02T12:00:00Z");

test("kurum başına tek satır, en eski askıdan gün; en uzun bekleyen başta", () => {
  const liste = askidakiKurumlar([
    { organization_id: "a", product: "arvoos", suspended_at: "2026-10-30T12:00:00Z", suspension_reason: "Ödeme yok" },
    { organization_id: "a", product: "arvolab", suspended_at: "2026-10-20T12:00:00Z", suspension_reason: "Kart reddedildi" },
    { organization_id: "b", product: "randevu", suspended_at: "2026-11-01T12:00:00Z", suspension_reason: null },
    { organization_id: "c", product: "arvoos", suspended_at: null, suspension_reason: "Eski kayıt" },
  ], () => true, SIMDI);
  assert.deepEqual(liste.map((k) => [k.organizationId, k.gun, k.sebep, k.urunler.length]), [
    ["a", 13, "Kart reddedildi", 2],
    ["b", 1, null, 1],
    ["c", null, "Eski kayıt", 1],
  ]);
});

test("müşteri olmayan kurum kuyruğa girmez", () => {
  assert.deepEqual(askidakiKurumlar([{ organization_id: "arvo", product: "arvoos", suspended_at: "2026-10-01T00:00:00Z", suspension_reason: null }], () => false, SIMDI), []);
});
