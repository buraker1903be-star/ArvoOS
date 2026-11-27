import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error — saf .mjs modül, tip bildirimi yok.
import { rotaKusurlari } from "../../scripts/konsol-rota-olcutleri.mjs";

const MASAUSTU = { ad: "x", yol: "/panel/platform/musteriler?secili=kurum:1", w: 1440, h: 900 };
const TELEFON = { ad: "x", yol: "/panel/platform/musteriler?secili=kurum:1", w: 390, h: 844 };
const IYI = {
  liste: { x: 264, w: 632 }, panel: { x: 896, w: 520 },
  listeGorunur: true, panelGorunur: true, tasma: 0, yatayTasma: false,
  secili: 1, panelBaslik: "Akademi", panelBos: null, geriGorunur: false,
};

test("ölçümler yerindeyse kusur yok", () => {
  assert.deepEqual(rotaKusurlari(MASAUSTU, 200, IYI), []);
});

test("düzenin ekran dışına taşması kusur", () => {
  /* 390x844'te listenin son 406 pikseline ulaşılamıyordu; görüntüde
     görünmüyordu, çünkü taşan kısım kırpılıyor. */
  const k = rotaKusurlari(MASAUSTU, 200, { ...IYI, tasma: 406 });
  assert.equal(k.length, 1);
  assert.match(k[0], /taşıyor/);
});

test("liste ile panelin yer değiştirmesi kusur", () => {
  /* Araya giren bir not ızgaranın ilk gözünü kapınca oluyordu. */
  const k = rotaKusurlari(MASAUSTU, 200, { ...IYI, liste: { x: 896, w: 520 }, panel: { x: 264, w: 872 } });
  assert.deepEqual(k, ["liste panelin sağında"]);
});

test("telefonda detay açıkken liste gizlenmeli", () => {
  assert.deepEqual(
    rotaKusurlari(TELEFON, 200, { ...IYI, listeGorunur: true, geriGorunur: true }),
    ["telefonda detay açıkken liste gizlenmiyor"],
  );
});

test("telefonda 'Listeye dön' zorunlu", () => {
  assert.deepEqual(
    rotaKusurlari(TELEFON, 200, { ...IYI, listeGorunur: false, geriGorunur: false }),
    ["telefonda 'Listeye dön' yok"],
  );
});

test("telefonda seçim yokken panel görünmemeli", () => {
  const is = { ...TELEFON, yol: "/panel/platform/musteriler?tur=kurumsal" };
  assert.deepEqual(
    rotaKusurlari(is, 200, { ...IYI, listeGorunur: true, panelGorunur: true, panelBaslik: null }),
    ["telefonda seçim yokken panel görünüyor"],
  );
});

test("seçili kayıt listede işaretli olmalı", () => {
  assert.deepEqual(rotaKusurlari(MASAUSTU, 200, { ...IYI, secili: 0 }), ["seçili satır işareti 0"]);
});

test("süzgeç dışındaki kayıtta işaret beklenmez", () => {
  /* Kayıt listede YOK; panel açık ama işaretlenecek satır da yok. */
  assert.deepEqual(rotaKusurlari({ ...MASAUSTU, suzgecDisi: true }, 200, { ...IYI, secili: 0 }), []);
});

test("200 olmayan yanıt kusur", () => {
  assert.deepEqual(rotaKusurlari(MASAUSTU, 500, IYI), ["durum 500"]);
});
