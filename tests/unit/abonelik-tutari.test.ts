import assert from "node:assert/strict";
import test from "node:test";
import { donemTutari, havaleFarklari } from "@/lib/abonelik-tutari";

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
  assert.match(farklar[0], /eksik/);
  assert.match(farklar[1], /pakete geçirir/);
});

test("havale: ücret girilmemişse doğrulanamadığı söyleniyor", () => {
  assert.match(havaleFarklari({ bildirilenTutar: 1, beklenenTutar: 0, bildirilenPaket: null, mevcutPaket: null })[0], /doğrulanamıyor/);
});
