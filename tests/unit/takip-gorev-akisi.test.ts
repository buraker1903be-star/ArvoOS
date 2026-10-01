/*
  Tamamlanan görev listesi DOM'da TERS basılır: CSS column-reverse
  kullanıyor (kaydırıcıyı JS'siz sona dayamak için), orada DOM'daki ilk
  eleman en altta görünür. Ters basmayı unutmak sessiz bir hata — liste
  yine dolu görünür, yalnız sıra tersine döner. Test onu yakalıyor.
*/
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { gorevAkisi, type TakipGorevi } from "../../lib/takip-gorevleri";

const g = (ad: string, durum: TakipGorevi["durum"], asama = "Hazırlık"): TakipGorevi => ({ ad, asama, durum });

const liste: TakipGorevi[] = [
  g("Tez Öneri Formu", "done"),
  g("Etik Kurul İzni", "done"),
  g("Veri Toplama", "done", "Yöntem"),
  g("Bulgular Bölümü", "current", "Yöntem"),
  g("Savunma Sunumu", "upcoming", "Savunma"),
  g("Teslim Dosyası", "upcoming", "Savunma"),
];

describe("takip görev akışı", () => {
  test("tamamlananlar DOM'a ters basılır (ekranda kronolojik olsun diye)", () => {
    const a = gorevAkisi(liste)!;
    assert.deepEqual(a.bitenlerDom.map((x) => x.ad), [
      "Veri Toplama",
      "Etik Kurul İzni",
      "Tez Öneri Formu",
    ]);
    // Ekranda en altta duran = DOM'daki ilk = en son biten iş.
    assert.equal(a.bitenlerDom[0].ad, "Veri Toplama");
  });

  test("şu an yapılan iş tek ve veritabanının seçtiğidir", () => {
    const a = gorevAkisi(liste)!;
    assert.equal(a.simdi?.ad, "Bulgular Bölümü");
    assert.equal(a.simdi?.asama, "Yöntem");
  });

  test("sıradaki bir sonraki görev, kalanlar sayıya iner", () => {
    const a = gorevAkisi(liste)!;
    assert.equal(a.siradaki?.ad, "Savunma Sunumu");
    assert.equal(a.siradaki?.asama, "Savunma");
    assert.equal(a.kalan, 1);
  });

  test("girdi bozulmaz", () => {
    const kopya = liste.map((x) => ({ ...x }));
    gorevAkisi(liste);
    assert.deepEqual(liste, kopya, "reverse() yerinde çalışıp diziyi bozmamalı");
  });

  test("hepsi bitince şu an ve sıradaki yok", () => {
    const a = gorevAkisi(liste.map((x) => g(x.ad, "done", x.asama)))!;
    assert.equal(a.simdi, null);
    assert.equal(a.siradaki, null);
    assert.equal(a.kalan, 0);
    assert.deepEqual([a.tamamlanan, a.toplam], [6, 6]);
  });

  test("görev yoksa bölüm hiç çizilmez", () => {
    assert.equal(gorevAkisi([]), null);
    assert.equal(gorevAkisi(undefined), null);
    assert.equal(gorevAkisi(null), null);
  });
});
