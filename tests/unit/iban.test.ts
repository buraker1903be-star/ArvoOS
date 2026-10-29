import assert from "node:assert/strict";
import test from "node:test";
import { ibanHatasi, ibanTemizle, ibanYazisi } from "../../lib/iban.ts";

/* IBAN (lib/iban): proformayla müşteriye giden banka hesabı denetim hanesinden geçmeli. */

test("geçerli Türkiye IBAN'ı kabul edilir, yazımı dörtlü gruplar", () => {
  assert.equal(ibanHatasi("TR48 0006 2001 1510 0006 2900 81"), null);
  assert.equal(ibanTemizle("tr48-0006 2001"), "TR4800062001");
  assert.equal(ibanYazisi("TR480006200115100006290081"), "TR48 0006 2001 1510 0006 2900 81");
});

test("tek hane yanlışsa denetim hanesi yakalar", () => {
  assert.match(ibanHatasi("TR480006200115100006290082") ?? "", /denetim hanesi/);
});

test("eksik uzunluk ve yabancı karakter reddedilir", () => {
  assert.match(ibanHatasi("TR4800062001151000062900") ?? "", /26 karakter/);
  assert.match(ibanHatasi("TR48 0006 2001 1510 0006 2900 8*") ?? "", /harf ve rakam/);
  assert.match(ibanHatasi("") ?? "", /yazın/);
});
