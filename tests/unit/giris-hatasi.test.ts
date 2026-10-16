import { test } from "node:test";
import assert from "node:assert/strict";
import { girisHataAnahtari, sifreHataAnahtari } from "../../lib/giris-hatasi.ts";

test("giriş: çok deneme ve doğrulanmamış e-posta 'parola hatalı' değildir", () => {
  assert.equal(girisHataAnahtari({ code: "invalid_credentials", status: 400 }), "invalid");
  assert.equal(girisHataAnahtari({ code: "over_request_rate_limit", status: 429 }), "cok_deneme");
  assert.equal(girisHataAnahtari({ status: 429 }), "cok_deneme");
  assert.equal(girisHataAnahtari({ code: "email_not_confirmed" }), "dogrulanmamis");
  // Bilinmeyen kod hesabın varlığını ele vermeyen genel anahtara düşer.
  assert.equal(girisHataAnahtari({ code: "user_not_found" }), "invalid");
  assert.equal(girisHataAnahtari(null), "invalid");
});

test("şifre: aynı şifre ve zayıf şifre ayrı söylenir", () => {
  assert.equal(sifreHataAnahtari({ code: "same_password" }), "ayni");
  assert.equal(sifreHataAnahtari({ code: "weak_password" }), "zayif");
  assert.equal(sifreHataAnahtari({ status: 429 }), "cok_deneme");
  assert.equal(sifreHataAnahtari({ code: "session_not_found" }), "oturum");
  assert.equal(sifreHataAnahtari({ code: "baska" }), "failed");
});
