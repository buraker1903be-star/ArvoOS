import assert from "node:assert/strict";
import test from "node:test";
import { eksikMesajAyarlari, mesajAyarlari } from "../../lib/platform-mesaj-ayarlari";

/*
  CANLIDA YAŞANDI (29.10.2026): RESEND_API_KEY tanımsızdı, yani
  otomatik proforma kesilip e-postayla GİTMEYECEKTİ. Bu yalnızca
  Sistem ayarları → Entegrasyonlar sekmesinde yazıyordu; kurucunun
  her gün baktığı Sistem sağlığı ekranı "Açık sorun 0" diyordu.
*/

const hepsiVar = () => true;
const hicbiri = () => false;

test("anahtarlar tamken eksik ayar yok", () => {
  const ayarlar = mesajAyarlari(hepsiVar, true);
  assert.equal(ayarlar.length, 3);
  assert.deepEqual(eksikMesajAyarlari(ayarlar), []);
});

test("eksik anahtar listeye düşüyor ve bedeli yazılı", () => {
  const ayarlar = mesajAyarlari((ad) => ad !== "RESEND_API_KEY", true);
  const eksik = eksikMesajAyarlari(ayarlar);
  assert.equal(eksik.length, 1);
  assert.equal(eksik[0].ad, "E-posta (Resend)");
  assert.match(eksik[0].not, /RESEND_API_KEY/);
  /* Bedel cümlesi şart: "eksik" demek, neyin olmadığını söylemiyorsa
     kurucu onu kapatılabilir bir ayar sanır. */
  assert.match(eksik[0].bedel, /proforma/i);
});

/* WhatsApp İKİ anahtar istiyor; biri eksikken "bağlı" demek,
   gönderimin çalıştığını sanmak olurdu. */
test("WhatsApp'ta tek anahtar yetmiyor", () => {
  const ayarlar = mesajAyarlari((ad) => ad === "WHATSAPP_PHONE_ID", true);
  const whatsapp = ayarlar.find((a) => a.ad.startsWith("WhatsApp"))!;
  assert.equal(whatsapp.bagli, false);
});

test("web push ayrı bir bayraktan okunuyor", () => {
  assert.equal(mesajAyarlari(hepsiVar, false).find((a) => a.ad.startsWith("Anlık"))!.bagli, false);
  assert.equal(mesajAyarlari(hicbiri, true).find((a) => a.ad.startsWith("Anlık"))!.bagli, true);
});

/* Bağlı ayarın da bedeli yazılı: "bu anahtar ne işe yarıyor" sorusunun
   cevabı, onu kaldırmayı düşünen kişinin görmesi gereken şey. */
test("her ayarın bedel cümlesi var", () => {
  for (const ayar of mesajAyarlari(hepsiVar, true)) assert.ok(ayar.bedel.length > 20, ayar.ad);
});
