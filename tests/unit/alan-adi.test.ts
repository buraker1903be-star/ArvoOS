import assert from "node:assert/strict";
import test from "node:test";
import { alanAdiTuru, alanAdiUyarisi, onerilenAlanAdi } from "@/lib/alan-adi";

test("alt alan adı ile kök alan adı ayırt ediliyor", () => {
  assert.equal(alanAdiTuru("panel.firma.com"), "alt");
  assert.equal(alanAdiTuru("firma.com"), "kok");
  /* "firma.com.tr" ÜÇ etiketli ama kök: etiket saymak Türkiye'de
     yanlış cevap verir ve kurum kendi sitesini panele yönlendirirken
     uyarı almazdı. */
  assert.equal(alanAdiTuru("firma.com.tr"), "kok");
  assert.equal(alanAdiTuru("panel.firma.com.tr"), "alt");
  assert.equal(alanAdiTuru("https://panel.firma.com/giris"), "alt");
  assert.equal(alanAdiTuru("firma"), "gecersiz");
  assert.equal(alanAdiTuru(""), "gecersiz");
});

test("kök alan adı engellenmiyor ama uyarılıyor", () => {
  const uyari = alanAdiUyarisi("firma.com.tr");
  assert.match(uyari ?? "", /KÖK alan adınız/);
  assert.match(uyari ?? "", /panel\.firma\.com\.tr/);
  // Alt alan adında uyarı yok.
  assert.equal(alanAdiUyarisi("panel.firma.com"), null);
  // Boş alan henüz bir hata değil: kullanıcı yazmaya başlamadı.
  assert.equal(alanAdiUyarisi(""), null);
});

test("www ayrı uyarı veriyor", () => {
  const uyari = alanAdiUyarisi("www.firma.com");
  assert.match(uyari ?? "", /web sitesinin kendisi/);
  assert.match(uyari ?? "", /panel\.firma\.com/);
});

test("öneri kök adresten türüyor", () => {
  assert.equal(onerilenAlanAdi("firma.com.tr"), "panel.firma.com.tr");
  assert.equal(onerilenAlanAdi("www.firma.com"), "panel.firma.com");
  // Zaten alt alan adıysa öneri yok.
  assert.equal(onerilenAlanAdi("panel.firma.com"), null);
});
