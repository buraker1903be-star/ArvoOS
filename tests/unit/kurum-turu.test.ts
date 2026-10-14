import assert from "node:assert/strict";
import test from "node:test";
import { kurumTuru, musteriMi } from "@/lib/kurum-turu";

test("Arvo'nun kendisi, grup markası ve müşteri ayrı; Arvo işareti grup işaretinden önce gelir", () => {
  assert.equal(kurumTuru({ kind: "internal" }), "arvo");
  assert.equal(kurumTuru({ kind: "internal", grup_markasi: true }), "arvo");
  assert.equal(kurumTuru({ kind: "customer", grup_markasi: true }), "grup");
  assert.equal(kurumTuru({ kind: "customer", grup_markasi: false }), "musteri");
  // Sütun okunmadıysa (eski görünüm) müşteri sayılır: eski davranış.
  assert.equal(kurumTuru({ kind: "customer" }), "musteri");
  assert.equal(musteriMi({ kind: "customer", grup_markasi: true }), false);
  assert.equal(musteriMi(null), true);
});
