import { test } from "node:test";
import assert from "node:assert/strict";
import { erisimKapaliMi } from "../../lib/erisim-kapisi.ts";

test("erişim kapısı: yalnızca askıya alınmış lisans kilitler", () => {
  assert.equal(erisimKapaliMi("akademikmerkez", "suspended"), true);
  for (const durum of ["active", "trialing", "past_due", "canceled", null, undefined]) {
    assert.equal(erisimKapaliMi("akademikmerkez", durum), false, String(durum));
  }
});

test("erişim kapısı: Arvo'nun kendi kurumu hiçbir koşulda kilitlenmez", () => {
  assert.equal(erisimKapaliMi("arvo-os", "suspended"), false);
});
