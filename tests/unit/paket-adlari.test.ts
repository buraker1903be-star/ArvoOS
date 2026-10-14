import { test } from "node:test";
import assert from "node:assert/strict";
import { PAKET_ADLARI, PAKET_SECENEKLERI, paketAdi } from "../../lib/paket-adlari.ts";
import { YAYIN_KODU } from "../../lib/paket-ucreti.ts";
import { PLANS } from "../../lib/site/pricing.ts";

test("paket adları sitedeki adla aynı (konsol ile site iki ayrı ad yazmasın)", () => {
  for (const [kod, yayin] of Object.entries(YAYIN_KODU)) {
    const plan = PLANS.find((p) => p.code === yayin);
    assert.ok(plan, `${yayin} sitede yok`);
    assert.equal(PAKET_ADLARI[kod], plan.ad.tr, kod);
  }
});

test("paket adları: eşleme ve seçenekler", () => {
  assert.equal(paketAdi("professional"), "Kurumsal");
  assert.equal(paketAdi("enterprise"), "Özel kurum");
  assert.equal(paketAdi("bilinmeyen"), "bilinmeyen");
  assert.equal(paketAdi(null), "");
  assert.deepEqual(PAKET_SECENEKLERI.map((p) => p.kod), ["starter", "professional", "enterprise"]);
});
