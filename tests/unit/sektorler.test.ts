import { test } from "node:test";
import assert from "node:assert/strict";
import { sektorAdi } from "../../lib/sektorler.ts";

test("sektör kodu okunur adla yazılır; listede olmayan metin olduğu gibi kalır", () => {
  assert.equal(sektorAdi("general"), "Genel");
  assert.equal(sektorAdi("ajans-yazilim"), "Ajans ve yazılım");
  assert.equal(sektorAdi("Mimarlık"), "Mimarlık");
  assert.equal(sektorAdi(null), "");
});
