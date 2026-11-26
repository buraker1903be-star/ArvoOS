import { test } from "node:test";
import assert from "node:assert/strict";
import { ceviriciKur, dilMi, DILLER, DIL_ADLARI, tarayicidanDil, VARSAYILAN_DIL } from "../../lib/konsol-giris/dil";

test("iki dil var ve adları kendi dillerinde yazılı", () => {
  /* Yanlış dilde açılmış ekranda kullanıcı kendi dilini ancak böyle tanır. */
  assert.deepEqual([...DILLER], ["tr", "en"]);
  assert.equal(DIL_ADLARI.tr, "Türkçe");
  assert.equal(DIL_ADLARI.en, "English");
});

test("dilMi yalnızca desteklenen kodları kabul eder", () => {
  assert.equal(dilMi("tr"), true);
  assert.equal(dilMi("en"), true);
  for (const bozuk of ["TR", "de", "", null, undefined, 1, {}]) assert.equal(dilMi(bozuk), false);
});

test("çevirici seçilen dilin metnini verir", () => {
  const metin = { tr: "Giriş yap", en: "Sign in" };
  assert.equal(ceviriciKur("tr")(metin), "Giriş yap");
  assert.equal(ceviriciKur("en")(metin), "Sign in");
});

test("tarayıcı dili: varsayılan Türkçe, İngilizce yalnızca önde gelirse", () => {
  assert.equal(tarayicidanDil(null), VARSAYILAN_DIL);
  assert.equal(tarayicidanDil(""), VARSAYILAN_DIL);
  assert.equal(tarayicidanDil("tr-TR,tr;q=0.9,en;q=0.8"), "tr");
  assert.equal(tarayicidanDil("en-US,en;q=0.9"), "en");
  assert.equal(tarayicidanDil("de-DE,de;q=0.9"), VARSAYILAN_DIL);
});

test("ağırlık (q) okunur: sıralama değil ağırlık karar verir", () => {
  /* "tr;q=0.8,en;q=0.9" İngilizce demektir; sırayla bakan bir çözüm
     Türkçe derdi ve İngilizce tarayıcı Türkçe ekran görürdü. */
  assert.equal(tarayicidanDil("tr;q=0.8,en;q=0.9"), "en");
  assert.equal(tarayicidanDil("en;q=0.3,tr;q=0.7"), "tr");
});
