import assert from "node:assert/strict";
import test from "node:test";
import { formatPhone, phoneHref, phoneSearchTerms } from "@/lib/format-phone";

test("aynı numaranın beş farklı kaydı tek biçime gelir", () => {
  const beklenen = "+90 (532) 462 80 98";
  for (const kayit of ["+90 532 462 80 98", "532 462 80 98", "0532 462 80 98", "5324628098", "0090 532 462 80 98"]) {
    assert.equal(formatPhone(kayit), beklenen, kayit);
  }
});

test("yurt dışı numarası olduğu gibi kalır", () => {
  // Tanımadığımız numarayı ASLA kırpmıyoruz: yurt dışı ya da eksik kayıt olabilir.
  assert.equal(formatPhone("+49 30 123456"), "+49 30 123456");
  assert.equal(formatPhone("0044 20 7946 0958"), "0044 20 7946 0958");
});

test("eksik ya da bozuk kayıt korunur", () => {
  assert.equal(formatPhone("532 462"), "532 462");
  assert.equal(formatPhone("  bilinmiyor  "), "bilinmiyor");
  assert.equal(formatPhone(""), "");
  assert.equal(formatPhone(null), "");
  assert.equal(formatPhone(undefined), "");
});

test("tel: bağlantısı boşluksuz", () => {
  assert.equal(phoneHref("0532 462 80 98"), "+905324628098");
  assert.equal(phoneHref("+49 30 123456"), "+4930123456");
  assert.equal(phoneHref("123"), null, "çok kısa numara bağlantı olmaz");
  assert.equal(phoneHref(null), null);
});

test("arama metni üç varyantı da içerir", () => {
  // Ekranda biçimli hali gören kullanıcı onu aratıyor, veritabanında yalın hali yazıyor.
  const terms = phoneSearchTerms("0532 462 80 98");
  assert.ok(terms.includes("0532 462 80 98"), "ham hali");
  assert.ok(terms.includes("+90 (532) 462 80 98"), "biçimli hali");
  assert.ok(terms.includes("5324628098"), "yalın rakamlar");
  assert.equal(phoneSearchTerms(null), "");
});
