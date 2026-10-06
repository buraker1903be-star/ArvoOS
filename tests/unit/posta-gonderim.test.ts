import assert from "node:assert/strict";
import test from "node:test";
import {
  base64UrlKodla,
  baslikKodla,
  yanitAlicisi,
  yanitKonusu,
  yanitMesajiKur,
  zincirBasliklari,
} from "@/lib/posta-gonderim";

test("başlıkta Türkçe harf RFC 2047 ile kodlanıyor", () => {
  /*
    Başlıklar yalnızca ASCII taşıyor; doğrudan yazılan "Güncelleme"
    alıcıda "GÃ¼ncelleme" görünüyordu ve bu kurumun müşterisine giden
    ilk izlenim oluyor.
  */
  assert.equal(baslikKodla("Teklif Güncellemesi"), "=?UTF-8?B?VGVrbGlmIEfDvG5jZWxsZW1lc2k=?=");
  // ASCII ise kodlanmıyor: okunabilir kalsın.
  assert.equal(baslikKodla("Proposal update"), "Proposal update");
});

test("Re: ön eki bir kez taşınıyor", () => {
  // Her yanıtta eklemek "Re: Re: Re: Teklif" üretiyordu.
  assert.equal(yanitKonusu("Teklif"), "Re: Teklif");
  assert.equal(yanitKonusu("Re: Teklif"), "Re: Teklif");
  assert.equal(yanitKonusu("RE:Teklif"), "RE:Teklif");
  assert.equal(yanitKonusu("YNT: Teklif"), "YNT: Teklif");
  assert.equal(yanitKonusu(""), "Re:");
});

test("zincir başlıkları yanıtın ayrı konuşma açmasını engelliyor", () => {
  /*
    In-Reply-To / References olmadan yanıt alıcının kutusunda AYRI bir
    konuşma olarak açılıyor; Gmail'in threadId'si yalnızca bizim
    tarafımızı birleştiriyor.
  */
  assert.deepEqual(
    zincirBasliklari({ sonMesajId: "<b@mail>", referanslar: "<a@mail>" }),
    ["In-Reply-To: <b@mail>", "References: <a@mail> <b@mail>"],
  );
  // Zincirin ilk yanıtında References yalnızca son mesajı taşır.
  assert.deepEqual(
    zincirBasliklari({ sonMesajId: "<b@mail>", referanslar: null }),
    ["In-Reply-To: <b@mail>", "References: <b@mail>"],
  );
  // Kimlik okunamadıysa başlık hiç yazılmıyor; boş başlık mesajı bozuyor.
  assert.deepEqual(zincirBasliklari({ sonMesajId: null, referanslar: "<a@mail>" }), []);
});

test("ham mesaj doğru başlıklarla kuruluyor", () => {
  const ham = yanitMesajiKur({
    gonderenAd: "Akademik Merkez",
    gonderenAdres: "info@akademikmerkez.com",
    alici: "musteri@x.com",
    konu: "Tez danışmanlığı",
    govde: "Merhaba, teklifimiz ektedir.",
    sonMesajId: "<abc@mail.gmail.com>",
    referanslar: null,
  });
  assert.match(ham, /^From: Akademik Merkez <info@akademikmerkez\.com>\r\n/);
  assert.match(ham, /\r\nTo: musteri@x\.com\r\n/);
  assert.match(ham, /\r\nIn-Reply-To: <abc@mail\.gmail\.com>\r\n/);
  assert.match(ham, /\r\nContent-Type: text\/plain; charset="UTF-8"\r\n/);
  // Gövde base64: 998 karakterlik satır sınırı ve Türkçe harf yüzünden
  // düz gönderilen uzun paragraflar bazı sunucularda bozuluyordu.
  const govde = ham.split("\r\n\r\n")[1];
  assert.equal(Buffer.from(govde.replace(/\r\n/g, ""), "base64").toString("utf8"), "Merhaba, teklifimiz ektedir.");
});

test("base64url kodlaması dolgusuz ve url güvenli", () => {
  const kodlu = base64UrlKodla("??>>");
  assert.ok(!kodlu.includes("+") && !kodlu.includes("/") && !kodlu.includes("="));
  assert.equal(Buffer.from(kodlu.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"), "??>>");
});

test("yanıt son GELEN mesajın göndereneine gidiyor", () => {
  /*
    Son GİDEN mesaja bakmak kendi adresimize yanıt yazdırırdı: ortak
    kutudan çıkan son mesaj çoğu zaman bizim cevabımız.
  */
  const adres = yanitAlicisi([
    { gonderenAdres: "ilk@musteri.com", yon: "gelen", tarih: new Date("2026-10-01T09:00:00Z") },
    { gonderenAdres: "son@musteri.com", yon: "gelen", tarih: new Date("2026-10-03T09:00:00Z") },
    { gonderenAdres: "info@biz.com", yon: "giden", tarih: new Date("2026-10-04T09:00:00Z") },
  ]);
  assert.equal(adres, "son@musteri.com");
  // Yalnızca giden mesaj varsa yanıtlanacak kimse yok.
  assert.equal(yanitAlicisi([{ gonderenAdres: "info@biz.com", yon: "giden", tarih: new Date() }]), null);
  assert.equal(yanitAlicisi([]), null);
});
