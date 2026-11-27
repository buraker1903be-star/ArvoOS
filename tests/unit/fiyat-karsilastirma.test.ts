import { test } from "node:test";
import assert from "node:assert/strict";
import { karsilastirmaSatirlari, suzgecVarMi, type KarsilastirmaPlani } from "../../lib/konsol/fiyat-karsilastirma";

/*
  Fiyatlar ekranı 27.11.2026'da ürünler arası karşılaştırmaya geçti.
  Bu testler ekranın üç sözünü sabitliyor: aynı planın iki dönemi AYRI
  satır, süzgeçler birbirini silmiyor ve durum bekleyen taslağı
  gizlemiyor.
*/

const plan = (ek: Partial<KarsilastirmaPlani> = {}): KarsilastirmaPlani => ({
  urun: "arvolab", urunAdi: "ArvoLab", kod: "arvolab-baslangic", ad: "Başlangıç",
  birim: "kurum başına", aylik: 100000, yillik: 1000000, yayimli: false, bekleyen: false, ...ek,
});

test("aynı planın aylık ve yıllık dönemi ayrı satır", () => {
  const satirlar = karsilastirmaSatirlari([plan()]);
  assert.deepEqual(satirlar.map((s) => s.donem), ["aylik", "yillik"]);
  assert.deepEqual(satirlar.map((s) => s.tutar), [100000, 1000000]);
  /* İki satır da aynı planı gösteriyor: ad ve kod ortak. */
  assert.equal(new Set(satirlar.map((s) => s.planKodu)).size, 1);
});

test("yıllığı olmayan planın yıllık satırı yok", () => {
  /* Teklif usulü planın (aylık null) yıllığı da yok; "—" yazan bir
     satır listeyi uzatmaktan başka bir şey yapmıyor. */
  const satirlar = karsilastirmaSatirlari([plan({ aylik: null, yillik: null })]);
  assert.equal(satirlar.length, 1);
  assert.equal(satirlar[0].donem, "aylik");
  assert.equal(satirlar[0].tutar, null);
});

test("durumda bekleyen taslak yayımlının üstünde", () => {
  assert.equal(karsilastirmaSatirlari([plan({ yayimli: true, bekleyen: true })])[0].durum, "bekliyor");
  assert.equal(karsilastirmaSatirlari([plan({ yayimli: true })])[0].durum, "yayimli");
  assert.equal(karsilastirmaSatirlari([plan()])[0].durum, "koddan");
});

test("süzgeçler ayrı ayrı ve birlikte çalışıyor", () => {
  const planlar = [
    plan({ urun: "arvolab", kod: "lab-1", yayimli: true }),
    plan({ urun: "arc", urunAdi: "ArvoARC", kod: "arc-1", bekleyen: true }),
    plan({ urun: "ek", urunAdi: "Ek hizmetler", kod: "ek-1", yillik: null }),
  ];
  assert.equal(karsilastirmaSatirlari(planlar).length, 5); // 2 + 2 + 1

  /* Ürün süzgeci. */
  assert.deepEqual(
    [...new Set(karsilastirmaSatirlari(planlar, { urun: "arc" }).map((s) => s.urun))], ["arc"]);
  /* "tumu" süzgeç değil: hepsi. */
  assert.equal(karsilastirmaSatirlari(planlar, { urun: "tumu" }).length, 5);

  /* Dönem süzgeci: ek kalemin yıllığı olmadığı için yıllıkta görünmez. */
  const yillik = karsilastirmaSatirlari(planlar, { donem: "yillik" });
  assert.deepEqual(yillik.map((s) => s.planKodu), ["lab-1", "arc-1"]);

  /* Durum süzgeci. */
  assert.deepEqual(
    [...new Set(karsilastirmaSatirlari(planlar, { durum: "bekliyor" }).map((s) => s.planKodu))], ["arc-1"]);

  /* Üçü birlikte: biri ötekini silmiyor. */
  const hepsi = karsilastirmaSatirlari(planlar, { urun: "arvolab", donem: "aylik", durum: "yayimli" });
  assert.equal(hepsi.length, 1);
  assert.equal(hepsi[0].planKodu, "lab-1");
  assert.equal(hepsi[0].donem, "aylik");

  /* Bilinmeyen süzgeç değeri yok sayılır, listeyi boşaltmaz. */
  assert.equal(karsilastirmaSatirlari(planlar, { donem: "haftalik" }).length, 5);
});

test("boş sonuç ile süzgeçsiz boşluk ayrı okunuyor", () => {
  /* Ekran "süzgece uyan plan yok" ile "tanımlı plan yok" arasında
     ayrım yapıyor; ayrımın kaynağı bu. */
  assert.equal(suzgecVarMi({}), false);
  assert.equal(suzgecVarMi({ urun: "tumu" }), false);
  assert.equal(suzgecVarMi({ urun: "arc" }), true);
  assert.equal(suzgecVarMi({ donem: "aylik" }), true);
  assert.equal(suzgecVarMi({ durum: "bekliyor" }), true);
  /* Tanınmayan değer süzgeç sayılmaz. */
  assert.equal(suzgecVarMi({ durum: "yok-boyle" }), false);
});
