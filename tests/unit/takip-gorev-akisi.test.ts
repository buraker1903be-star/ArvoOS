/*
  Halkanın yanındaki üç satır: en son biten iş, şu an yapılan iş, sıradaki.
  "En son biten" done kayıtlarının SONUNCUSU'dur, ilki değil. Ters alınırsa
  ekran yine dolu görünür ama müşteri haftalar önce biten işi güncel sanır
  — sessiz hata. Test onu yakalıyor.
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
  test("üst satır EN SON biten iştir, ilki değil", () => {
    const a = gorevAkisi(liste)!;
    assert.equal(a.sonBiten?.ad, "Veri Toplama");
    assert.notEqual(a.sonBiten?.ad, "Tez Öneri Formu", "listenin ilki alınmamalı");
  });

  test("hiç biten iş yoksa üst satır çizilmez", () => {
    const a = gorevAkisi([
      g("Bulgular Bölümü", "current"),
      g("Savunma Sunumu", "upcoming"),
    ])!;
    assert.equal(a.sonBiten, null);
    assert.equal(a.simdi?.ad, "Bulgular Bölümü");
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
    assert.deepEqual(liste, kopya);
  });

  test("hepsi bitince şu an ve sıradaki yok", () => {
    const a = gorevAkisi(liste.map((x) => g(x.ad, "done", x.asama)))!;
    assert.equal(a.simdi, null);
    assert.equal(a.siradaki, null);
    assert.equal(a.sonBiten?.ad, "Teslim Dosyası", "hepsi bitince üst satır sonuncusu");
    assert.equal(a.kalan, 0);
    assert.deepEqual([a.tamamlanan, a.toplam], [6, 6]);
  });

  test("görev yoksa bölüm hiç çizilmez", () => {
    assert.equal(gorevAkisi([]), null);
    assert.equal(gorevAkisi(undefined), null);
    assert.equal(gorevAkisi(null), null);
  });
});
