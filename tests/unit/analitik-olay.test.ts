import assert from "node:assert/strict";
import test from "node:test";
import { botMu, cihazTuru, kaynakAdi, olayiOku, sehirAdi, tarayiciAdi, yonlendirenKonak } from "@/lib/analitik-olay";

const ANAHTAR = "abcdef0123456789abcd";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

test("aynı platformun bütün konakları tek ada iniyor", () => {
  for (const ham of ["instagram.com", "l.instagram.com", "instagram"]) assert.equal(kaynakAdi(ham), "Instagram", ham);
  for (const ham of ["google.com", "www.google.com.tr"]) assert.equal(kaynakAdi(ham), "Google", ham);
  for (const ham of ["m.facebook.com", "lm.facebook.com", "fb"]) assert.equal(kaynakAdi(ham), "Facebook", ham);
  assert.equal(kaynakAdi(null), "Doğrudan");
  assert.equal(kaynakAdi("www.ornekblog.com"), "ornekblog.com");
});

test("utm_source yönlendirenden önce gelir; sorgu dizesi atılır", () => {
  const olay = olayiOku({ k: ANAHTAR, p: "https://akademikmerkez.com/tez?eposta=a@b.com", r: "https://www.google.com/", s: "instagram", c: "ekim-kampanyasi" });
  assert.ok(olay);
  assert.equal(olay.kaynak, "Instagram");
  assert.equal(olay.kampanya, "ekim-kampanyasi");
  assert.equal(olay.yol, "/tez", "e-posta adresi yolda kalmamalı");
});

test("sitenin kendi sayfasından gelen tıklama kaynak sayılmaz", () => {
  assert.equal(yonlendirenKonak("https://www.akademikmerkez.com/", "akademikmerkez.com"), null);
  const olay = olayiOku({ k: ANAHTAR, p: "https://akademikmerkez.com/iletisim", r: "https://akademikmerkez.com/" });
  assert.equal(olay?.kaynak, "Doğrudan");
});

test("geçersiz gövde null döner", () => {
  assert.equal(olayiOku(null), null);
  assert.equal(olayiOku({ k: "kisa", p: "https://a.com/" }), null);
  assert.equal(olayiOku({ k: ANAHTAR }), null, "adres yoksa olay yok");
  assert.equal(olayiOku({ k: ANAHTAR, p: "bozuk adres" }), null);
});

test("form olayı ayrı türde", () => {
  assert.equal(olayiOku({ k: ANAHTAR, p: "https://a.com/", t: "form" })?.tur, "form");
  assert.equal(olayiOku({ k: ANAHTAR, p: "https://a.com/", t: "baska" })?.tur, "sayfa");
});

test("cihaz türü", () => {
  assert.equal(cihazTuru(IPHONE, 390), "mobil");
  assert.equal(cihazTuru(CHROME, 1920), "masaustu");
  assert.equal(cihazTuru("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/129 Safari/537.36", 1200), "tablet");
  /* Yeni iPad kendini masaüstü Safari diye tanıtıyor; genişlik ele veriyor. */
  assert.equal(cihazTuru("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", 820), "tablet");
});

test("tarayıcı: özelden genele", () => {
  assert.equal(tarayiciAdi(CHROME), "Chrome");
  assert.equal(tarayiciAdi(IPHONE), "Safari");
  assert.equal(tarayiciAdi(CHROME + " Edg/129.0"), "Edge");
  assert.equal(tarayiciAdi(IPHONE + " Instagram 300.0"), "Instagram uygulaması");
});

test("botlar ve boş kimlik elenir", () => {
  assert.equal(botMu("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(botMu("facebookexternalhit/1.1"), true);
  assert.equal(botMu("WhatsApp/2.23 preview"), true);
  assert.equal(botMu(""), true);
  assert.equal(botMu(CHROME), false);
});

test("şehir adı kodlaması çözülür, bozuksa ham kalır", () => {
  assert.equal(sehirAdi("%C4%B0stanbul"), "İstanbul");
  assert.equal(sehirAdi("%E0%A4%A"), "%E0%A4%A");
  assert.equal(sehirAdi(null), null);
});

test("kurulumdaki alan adı adres çubuğundan kopyalanabilir", async () => {
  const { alanAdiOku } = await import("@/lib/analitik-olay");
  assert.equal(alanAdiOku("https://www.AkademikMerkez.com/iletisim?x=1"), "akademikmerkez.com");
  assert.equal(alanAdiOku("akademikmerkez.com"), "akademikmerkez.com");
  assert.equal(alanAdiOku("blog.akademikmerkez.com.tr"), "blog.akademikmerkez.com.tr");
  assert.equal(alanAdiOku("localhost"), null, "noktasız konak olmaz");
  assert.equal(alanAdiOku(""), null);
  assert.equal(alanAdiOku("bu bir site değil"), null);
});
