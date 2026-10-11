import assert from "node:assert/strict";
import test from "node:test";
import { SAYFA_BOYU, sayfaAraligi, sayfaNumarasi, sonSayfaNo } from "@/lib/liste-sayfalama";

test("adresteki sayfa numarası bozuk değerde ilk sayfaya düşüyor", () => {
  assert.equal(sayfaNumarasi("3"), 3);
  assert.equal(sayfaNumarasi(undefined), 1);
  // "?sayfa=abc" ile gelen bağlantı hata vermemeli.
  assert.equal(sayfaNumarasi("abc"), 1);
  assert.equal(sayfaNumarasi("0"), 1);
  assert.equal(sayfaNumarasi("-5"), 1);
});

test("son sayfa toplamdan, toplam yoksa dolu sayfadan", () => {
  assert.equal(sonSayfaNo(120, 50, 1), 3);
  assert.equal(sonSayfaNo(50, 50, 1), 1);
  assert.equal(sonSayfaNo(0, 0, 1), 1, "boş liste de tek sayfa");
  /* Toplam dönmediyse dolu bir sayfa "devamı var" sayılıyor: eksik bir
     "Sonraki" düğmesi kullanıcıyı kayıtların bittiğine inandırır. */
  assert.equal(sonSayfaNo(null, SAYFA_BOYU, 2), 3);
  assert.equal(sonSayfaNo(null, 7, 2), 2);
});

test("sorgu aralığı sıfırdan başlıyor", () => {
  assert.deepEqual(sayfaAraligi(1), [0, 49]);
  assert.deepEqual(sayfaAraligi(3), [100, 149]);
  assert.deepEqual(sayfaAraligi(2, 10), [10, 19]);
});
