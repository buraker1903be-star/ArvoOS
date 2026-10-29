import assert from "node:assert/strict";
import test from "node:test";
import { kurulumHatasiCumlesi, kurulumHatasiTaninir } from "../../lib/kurulum-hatasi";

/*
  Yeni müşteri sihirbazı düşen kurulumu olduğu gibi yazıyordu:
  "Kurum oluşturulamadı: duplicate key value violates unique
  constraint "organizations_slug_key"". Ne olduğunu söyleyen ama ne
  YAPILACAĞINI söylemeyen bir cümle — hem de ilk gerçek müşterinin
  açıldığı anda.
*/

test("kısa ad çakışması ne yapılacağını söylüyor", () => {
  const cumle = kurulumHatasiCumlesi('duplicate key value violates unique constraint "organizations_slug_key"');
  assert.match(cumle, /kısa ad/i);
  assert.match(cumle, /değiştirip/i, "yapılacak iş yazılmalı");
  assert.ok(!/duplicate key/i.test(cumle), "ham mesaj kalmamalı");
});

test("alan adı ve davet çakışmaları ayrı cümleler", () => {
  assert.match(kurulumHatasiCumlesi('violates unique constraint "organizations_custom_domain_key"'), /alan adı/i);
  assert.match(kurulumHatasiCumlesi('violates unique constraint "organization_invitations_organization_id_email_key"'), /davet/i);
});

test("zaten kayıtlı e-posta hesabı anlatılıyor", () => {
  assert.match(kurulumHatasiCumlesi("User already registered"), /hesap/i);
});

/* Bilinmeyen hata GİZLENMİYOR: anlaşılmaz bir cümle, yanlış bir
   cümleden iyidir ve ekran görüntüsü bize gelen tek kanıt. */
test("tanınmayan hata olduğu gibi kalıyor", () => {
  const ham = "connection terminated unexpectedly";
  assert.equal(kurulumHatasiCumlesi(ham), ham);
  assert.equal(kurulumHatasiTaninir(ham), false);
});

test("boş mesaj sessiz kalmıyor", () => {
  assert.match(kurulumHatasiCumlesi(""), /sebebi sunucudan gelmedi/);
});

/* Alan adı kısıtı da "duplicate key" içeriyor; sıra yanlışsa genel
   kural onu yutar ve kurucu kısa adı değiştirmeye çalışırdı. */
test("alan adı çakışması kısa ad cümlesine düşmüyor", () => {
  const cumle = kurulumHatasiCumlesi('duplicate key value violates unique constraint "organizations_custom_domain_key"');
  assert.match(cumle, /alan adı/i);
  assert.ok(!/kısa ad/i.test(cumle));
});
