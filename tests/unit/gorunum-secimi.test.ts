/*
  Görünüm seçicinin seçim kuralı (app/panel/os/gorunum-secimi.ts).
  Hata: seçili panel listeden düşünce (kurulum başka sekmede tamamlandı,
  canlı yenileme paneli kaldırdı) kısa/dar ekranda hiçbir panel kalmıyordu.
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { gecerliSecim } from "@/app/panel/os/gorunum-secimi";

const ana = [{ anahtar: "bugun", sadeceTelefon: true }, { anahtar: "talepler" }, { anahtar: "operasyon" }];

test("seçili panel listeden düşünce ilk panele dönülür", () => {
  assert.equal(gecerliSecim([{ anahtar: "talepler" }, { anahtar: "operasyon" }], "kurulum", false), "talepler");
});

test("geniş ekranda düşmüş seçim telefona özel panele inmez", () => {
  assert.equal(gecerliSecim(ana, "kurulum", true), "talepler");
  assert.equal(gecerliSecim(ana, "kurulum", false), "bugun");
});

test("geçerli seçim korunur; geniş ekranda telefona özel seçim bırakılır", () => {
  assert.equal(gecerliSecim(ana, "operasyon", true), "operasyon");
  assert.equal(gecerliSecim(ana, "bugun", false), "bugun");
  assert.equal(gecerliSecim(ana, "bugun", true), "talepler");
});

test("boş listede seçim değişmez", () => {
  assert.equal(gecerliSecim([], "x", true), "x");
});
