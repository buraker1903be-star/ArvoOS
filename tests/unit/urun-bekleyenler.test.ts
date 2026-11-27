import { test } from "node:test";
import assert from "node:assert/strict";
import { DENEME_ESIGI_GUN, YENILEME_ESIGI_GUN, urunBekleyenleri } from "../../lib/konsol/urun-bekleyenler";

/*
  "İşlem bekleyenler" kartı 27.11.2026'da sayı yazmaya başladı. Sayı
  yazan bir kart, sayının NEREDEN geldiğini de taşımak zorunda: bu
  testler kartın üç kuralını sabitliyor — sıfır satır çizilmez,
  okunamayan sayı uydurulmaz, kaynağı olmayan iş hiç eklenmez.
*/

const SIMDI = new Date("2026-11-27T09:00:00Z");
const gunSonra = (gun: number) => new Date(SIMDI.getTime() + gun * 86400000).toISOString();
const sayi = (n: number) => new Intl.NumberFormat("tr-TR").format(n);

const temel = { urunKodu: "arvolab", lisanslar: [], aboneler: [], bekleyenOdeme: 0, simdi: SIMDI, sayi };

test("sayısı sıfır olan satır hiç çizilmez", () => {
  /* "0 müşteri" diye bir iş yok: boş kart "Bekleyen işlem yok." diyor. */
  assert.deepEqual(urunBekleyenleri(temel), []);
});

test("okunamayan ödeme sayısı uydurulmaz: satır sayısız çizilir", () => {
  const isler = urunBekleyenleri({ ...temel, bekleyenOdeme: null });
  assert.equal(isler.length, 1);
  assert.equal(isler[0].anahtar, "odeme");
  assert.match(isler[0].alt ?? "", /okunamadı/i);
  /* Sayı yazılmamalı. */
  assert.doesNotMatch(isler[0].alt ?? "", /\d+ müşteri/);
});

test("bekleyen ödeme sayısı müşteri sayısıyla yazılır", () => {
  const isler = urunBekleyenleri({ ...temel, bekleyenOdeme: 12 });
  assert.equal(isler[0].baslik, "Onay bekleyen ödeme");
  assert.match(isler[0].alt ?? "", /12 müşteri/);
  assert.equal(isler[0].href, "/panel/platform/payments");
});

test("yaklaşan yenileme: eşik içinde ve ÖDEYEN lisanslar sayılır", () => {
  const isler = urunBekleyenleri({
    ...temel,
    lisanslar: [
      { durum: "active", donemSonu: gunSonra(3), denemeSonu: null },            // sayılır
      { durum: "past_due", donemSonu: gunSonra(YENILEME_ESIGI_GUN - 1), denemeSonu: null }, // sayılır
      { durum: "active", donemSonu: gunSonra(YENILEME_ESIGI_GUN + 5), denemeSonu: null },   // eşiğin dışında
      { durum: "active", donemSonu: gunSonra(-2), denemeSonu: null },           // GEÇMİŞ: "yaklaşan" değil
      { durum: "trialing", donemSonu: gunSonra(2), denemeSonu: null },          // ödeyen değil
      { durum: "active", donemSonu: null, denemeSonu: null },                   // tarihi yok
    ],
  });
  const yenileme = isler.find((i) => i.anahtar === "yenileme");
  assert.ok(yenileme, "yenileme satırı yok");
  assert.match(yenileme.alt ?? "", /2 müşteri/);
});

test("deneme bitişi: lisans ve abone birlikte sayılır", () => {
  const isler = urunBekleyenleri({
    ...temel,
    lisanslar: [
      { durum: "trialing", donemSonu: null, denemeSonu: gunSonra(1) },                    // sayılır
      { durum: "trialing", donemSonu: null, denemeSonu: gunSonra(DENEME_ESIGI_GUN + 2) }, // eşiğin dışında
      { durum: "active", donemSonu: null, denemeSonu: gunSonra(1) },                      // denemede değil
    ],
    aboneler: [
      { status: "trialing", trial_ends_at: gunSonra(2) },   // sayılır
      { status: "active", trial_ends_at: gunSonra(2) },     // denemede değil
      { status: "trialing", trial_ends_at: null },          // tarihi yok
    ],
  });
  const deneme = isler.find((i) => i.anahtar === "deneme");
  assert.ok(deneme, "deneme satırı yok");
  assert.match(deneme.alt ?? "", /2 müşteri/);
  assert.equal(deneme.href, "/panel/platform/musteriler?urun=arvolab");
});

test("kaynağı olmayan iş hiç eklenmez: destek satırı yok", () => {
  /*
    Destek talepleri KURUMA bağlı (support_tickets'ta product sütunu
    yok). Ürün başına sayı üretmek ölçülmemiş bir şeyi ölçülmüş
    göstermek olurdu; kart bu yüzden destek satırı taşımıyor.
  */
  const isler = urunBekleyenleri({
    ...temel,
    bekleyenOdeme: 3,
    lisanslar: [{ durum: "active", donemSonu: gunSonra(1), denemeSonu: null }],
    aboneler: [{ status: "trialing", trial_ends_at: gunSonra(1) }],
  });
  assert.deepEqual(isler.map((i) => i.anahtar), ["odeme", "yenileme", "deneme"]);
});

test("bağlantılar ürün kapsamını taşır", () => {
  const isler = urunBekleyenleri({
    ...temel, urunKodu: "randevu",
    lisanslar: [{ durum: "active", donemSonu: gunSonra(1), denemeSonu: null }],
  });
  /* Ürünün KODU adından ayrıdır (ArvoCal → randevu): bağlantı kodu
     taşımalı, etiketi değil. */
  assert.equal(isler[0].href, "/panel/platform/musteriler?urun=randevu");
});
