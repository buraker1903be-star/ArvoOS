import assert from "node:assert/strict";
import test from "node:test";
import { donemTutari, farkMetinleri, havaleFarklari, havaleUyariBasligi } from "@/lib/abonelik-tutari";

/* Bir dönemin beklenen tutarı ve havale bildirimiyle karşılaştırması. */

test("ArvoOS: paket + dahil sayıyı aşan etkin kullanıcılar", () => {
  assert.deepEqual(donemTutari({ urun: "arvoos", aylikUcret: 199_000, aktifKullanici: 5, kullaniciLimiti: 3, ekKullaniciUcreti: 24_900 }), { tutar: 199_000 + 2 * 24_900, ekKoltuk: 2 });
  assert.deepEqual(donemTutari({ urun: "arvoos", aylikUcret: 199_000, aktifKullanici: 3, kullaniciLimiti: 3, ekKullaniciUcreti: 24_900 }), { tutar: 199_000, ekKoltuk: 0 });
});

test("öteki ürünlerde koltuk yok; ücret girilmemişse 0", () => {
  assert.deepEqual(donemTutari({ urun: "arc", aylikUcret: 299_000, aktifKullanici: 50, kullaniciLimiti: 3, ekKullaniciUcreti: 24_900 }), { tutar: 299_000, ekKoltuk: 0 });
  assert.equal(donemTutari({ urun: "arvoos", aylikUcret: null }).tutar, 0);
});

test("havale: uyumlu bildirimde fark yok; eksik tutar ve paket değişimi yazılıyor", () => {
  assert.deepEqual(havaleFarklari({ bildirilenTutar: 199_000, beklenenTutar: 199_000, bildirilenPaket: "starter", mevcutPaket: "starter" }), []);
  const farklar = havaleFarklari({ bildirilenTutar: 199_000, beklenenTutar: 599_000, bildirilenPaket: "professional", mevcutPaket: "starter" });
  assert.equal(farklar.length, 2);
  assert.equal(farklar[0].tur, "tutar");
  assert.match(farklar[0].metin, /eksik/);
  assert.equal(farklar[1].tur, "paket");
  assert.match(farklar[1].metin, /pakete geçirir/);
});

test("havale: ücret girilmemişse doğrulanamadığı söyleniyor", () => {
  const farklar = havaleFarklari({ bildirilenTutar: 1, beklenenTutar: 0, bildirilenPaket: null, mevcutPaket: null });
  assert.equal(farklar[0].tur, "dogrulanamadi");
  assert.match(farklar[0].metin, /karşılaştırılamıyor/);
});

test("başlık farkın türünden: olmayan karşılaştırma 'uyuşmuyor' diye sunulmaz", () => {
  /*
    27.11.2026 ara kontrolü: üç hâl de "Beklenenle uyuşmuyor" diye
    gösteriliyordu. Beklenen ücret hiç girilmemişse karşılaştırılacak
    iki tutar yok; kurucu var olmayan bir farkı aramaya gönderiliyordu.
  */
  const yok = havaleFarklari({ bildirilenTutar: 1, beklenenTutar: null, bildirilenPaket: null, mevcutPaket: null });
  assert.equal(havaleUyariBasligi(yok), "Beklenen tutar doğrulanamadı.");

  const farkli = havaleFarklari({ bildirilenTutar: 199_000, beklenenTutar: 599_000, bildirilenPaket: null, mevcutPaket: null });
  assert.equal(havaleUyariBasligi(farkli), "Beklenen tutarla uyuşmuyor.");

  const yalnizPaket = havaleFarklari({ bildirilenTutar: 199_000, beklenenTutar: 199_000, bildirilenPaket: "professional", mevcutPaket: "starter" });
  assert.equal(havaleUyariBasligi(yalnizPaket), "Bildirim kiracının kaydından farklı.");

  assert.equal(havaleUyariBasligi([]), null);
});

test("düz metin listesi sırayı koruyor", () => {
  const farklar = havaleFarklari({ bildirilenTutar: 199_000, beklenenTutar: 599_000, bildirilenPaket: "professional", mevcutPaket: "starter" });
  assert.deepEqual(farkMetinleri(farklar), farklar.map((f) => f.metin));
});

/*
  PARA BİRİMİ FARKI (28.11.2026). 100 USD ile 100 TRY aynı ödeme
  değildir; fark görünmeden onay verilirse lisans yanlış bedelle açılır.
*/
test("para birimi uyuşmazlığı tutar karşılaştırmasının önüne geçiyor", () => {
  const farklar = havaleFarklari({
    bildirilenTutar: 10_000,
    beklenenTutar: 10_000,
    bildirilenPaket: null,
    mevcutPaket: null,
    bildirilenParaBirimi: "USD",
    beklenenParaBirimi: "TRY",
  });
  assert.equal(farklar.length, 1);
  assert.equal(farklar[0].tur, "para_birimi");
  assert.match(farklar[0].metin, /bildirim USD, beklenen TRY/);
  assert.equal(havaleUyariBasligi(farklar), "Para birimi uyuşmuyor.");
});

test("aynı birimde tutar farkı kendi biriminde yazılıyor", () => {
  const farklar = havaleFarklari({
    bildirilenTutar: 8_500,
    beklenenTutar: 11_900,
    bildirilenPaket: null,
    mevcutPaket: null,
    bildirilenParaBirimi: "USD",
    beklenenParaBirimi: "USD",
  });
  assert.equal(farklar[0].tur, "tutar");
  assert.match(farklar[0].metin, /85,00 USD.*119,00 USD/);
});

test("TARİHSEL UYUM: para birimi verilmeyen bildirim eskisi gibi karşılaştırılıyor", () => {
  /* 28.11.2026 öncesindeki her bildirim TRY'ydi; o kayıtların
     karşılaştırması değişmemeli. */
  const farklar = havaleFarklari({
    bildirilenTutar: 199_000,
    beklenenTutar: 199_000,
    bildirilenPaket: null,
    mevcutPaket: null,
  });
  assert.deepEqual(farklar, []);
  const farkli = havaleFarklari({
    bildirilenTutar: 100_000,
    beklenenTutar: 199_000,
    bildirilenPaket: null,
    mevcutPaket: null,
  });
  assert.equal(farkli[0].tur, "tutar");
  assert.match(farkli[0].metin, /₺1\.000,00.*₺1\.990,00/);
});
