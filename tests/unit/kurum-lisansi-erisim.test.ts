import { test } from "node:test";
import assert from "node:assert/strict";
import { kurumLisansiAcik } from "../../lib/kurum-lisansi-erisim.ts";

const simdi = Date.parse("2026-10-14T10:00:00Z");

test("kuruma geçmiş abone: kurumun açık lisansı erişim verir", () => {
  assert.equal(kurumLisansiAcik({ status: "active", trial_ends_at: null }, simdi), true);
  // Gecikmiş ödeme konsolda açık sayılıyor; kapatma kurucunun kararı.
  assert.equal(kurumLisansiAcik({ status: "past_due", trial_ends_at: null }, simdi), true);
});

test("kuruma geçmiş abone: deneme yalnızca süresi sürüyorsa açık", () => {
  assert.equal(kurumLisansiAcik({ status: "trialing", trial_ends_at: "2026-10-20T00:00:00Z" }, simdi), true);
  assert.equal(kurumLisansiAcik({ status: "trialing", trial_ends_at: "2026-10-01T00:00:00Z" }, simdi), false);
  assert.equal(kurumLisansiAcik({ status: "trialing", trial_ends_at: null }, simdi), false);
});

test("kuruma geçmiş abone: lisans yoksa ya da kapalıysa erişim yok", () => {
  assert.equal(kurumLisansiAcik(null, simdi), false);
  assert.equal(kurumLisansiAcik(undefined, simdi), false);
  for (const status of ["inactive", "suspended", "canceled"]) {
    assert.equal(kurumLisansiAcik({ status, trial_ends_at: null }, simdi), false, status);
  }
});
