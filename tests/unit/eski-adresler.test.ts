import { test } from "node:test";
import assert from "node:assert/strict";
import { eskiKonsolAdresi } from "../../lib/konsol/eski-adresler";

const adres = (pathname: string, search = "") => eskiKonsolAdresi({ pathname, search });

test("kiracı dosyaları Müşteriler'e; kurum kimliği kaydın ayar penceresine", () => {
  assert.equal(adres("/panel/platform"), "/panel/platform/musteriler");
  assert.equal(
    adres("/panel/platform", "?organization=11111111-1111-4111-8111-111111111111"),
    "/panel/platform/musteriler/11111111-1111-4111-8111-111111111111?pencere=ayarlar",
  );
  assert.equal(
    adres("/panel/platform", "?organization=11111111-1111-4111-8111-111111111111&provisioned=1"),
    "/panel/platform/musteriler/11111111-1111-4111-8111-111111111111?pencere=ayarlar&provisioned=1",
  );
  /* Kimlik uydurma olabilir: biçimi tutmuyorsa listeye. */
  assert.equal(adres("/panel/platform", "?organization=olmayan"), "/panel/platform/musteriler");
  assert.equal(adres("/panel/platform", "?filtre=kurulum"), "/panel/platform/kurulumlar?asama=devam");
});

test("Yenilemeler Abonelikler takvimine; dikkat süzgeci korunur", () => {
  assert.equal(adres("/panel/platform/yenilemeler"), "/panel/platform/billing?gorunum=takvim");
  assert.equal(adres("/panel/platform/yenilemeler", "?gorunum=dikkat"), "/panel/platform/billing?gorunum=takvim&filtre=dikkat");
});

test("Modüller Ürünler'in matris sekmesine; yalnızca bilinen süzgeç taşınır", () => {
  assert.equal(adres("/panel/platform/moduller"), "/panel/platform/urunler?gorunum=moduller");
  assert.equal(adres("/panel/platform/moduller", "?suzgec=kapali"), "/panel/platform/urunler?gorunum=moduller&suzgec=kapali");
  assert.equal(adres("/panel/platform/moduller", "?suzgec=uydurma"), "/panel/platform/urunler?gorunum=moduller");
});

test("Fiyatlar: iki adres yönlendirme DEĞİL", () => {
  /* Ek hizmetler bir ürün değil, gideceği ürün detayı yok; karşılaştırma
     ekranı da silinmedi, açıkça isteniyor. İkisini de yönlendirmek
     ekranları erişilemez yapardı. */
  assert.equal(adres("/panel/platform/fiyatlar", "?urun=ek"), null);
  assert.equal(adres("/panel/platform/fiyatlar", "?gorunum=karsilastirma"), null);
});

test("Fiyatlar: ürün seçiliyse ürünün Fiyat basamaklarına, değilse Ürünler'e", () => {
  assert.equal(adres("/panel/platform/fiyatlar", "?urun=arvolab"), "/panel/platform/urunler/arvolab?bolum=fiyat");
  assert.equal(adres("/panel/platform/fiyatlar"), "/panel/platform/urunler");
  assert.equal(adres("/panel/platform/fiyatlar", "?urun=tumu"), "/panel/platform/urunler");
});

test("sondaki eğik çizgi adresi değiştirmiyor", () => {
  assert.equal(adres("/panel/platform/moduller/"), "/panel/platform/urunler?gorunum=moduller");
});

test("başka hiçbir konsol adresi yönlendirilmiyor", () => {
  for (const yol of [
    "/panel", "/panel/platform/musteriler", "/panel/platform/urunler",
    "/panel/platform/payments", "/panel/platform/destek", "/panel/platform/ayarlar",
    "/panel/platform/fiyatlarr", "/panel/platform/modullerx",
  ]) assert.equal(adres(yol), null, yol);
});
