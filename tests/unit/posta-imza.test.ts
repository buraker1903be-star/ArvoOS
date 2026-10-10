import assert from "node:assert/strict";
import test from "node:test";
import {
  LOGO_CID,
  LOGO_YUKSEKLIK,
  baglantilandir,
  gorselOlculeri,
  htmlGovdesi,
  htmlKacis,
  imzaHtml,
  logoAdresiUygunMu,
  logoOlcusu,
  markaRengi,
  metinHtml,
  varsayilanImza,
} from "@/lib/posta-imza";

test("gövde HTML'e kaçırılarak giriyor", () => {
  /* Kaçırılmayan "<" tarayıcıda etiket başı sanılıyor ve cümlenin
     kalanı yutuluyordu: müşteriye yarım cümle gidiyordu. */
  assert.equal(htmlKacis('fiyat < 5.000 TL & "net"'), "fiyat &lt; 5.000 TL &amp; &quot;net&quot;");
  assert.equal(metinHtml("Merhaba\nİyi çalışmalar"), "Merhaba<br>İyi çalışmalar");
  assert.equal(metinHtml("<b>kalın</b>"), "&lt;b&gt;kalın&lt;/b&gt;");
});

test("gövdedeki bağlantı tıklanabilir, sondaki noktalama dışarıda kalıyor", () => {
  // Çıplak adres bazı istemcilerde düz metin kalıyor; müşteri adresi
  // elle kopyalamak zorunda kalıyordu.
  assert.match(metinHtml("Teklif: https://arvo-os.com/teklif/abc"), /<a href="https:\/\/arvo-os\.com\/teklif\/abc" /);
  // Sondaki nokta adrese girerse bağlantı 404 veriyor.
  const nokta = metinHtml("Bakın https://arvo-os.com/t/abc.");
  assert.match(nokta, /">https:\/\/arvo-os\.com\/t\/abc<\/a>\./);
  // Kaçırılmış tırnak da adrese girmiyor.
  assert.match(metinHtml('"https://arvo-os.com/t/abc"'), /&quot;<a href="https:\/\/arvo-os\.com\/t\/abc" /);
  // Sorgudaki & kaçırılmış hâliyle href'e giriyor (HTML niteliğinde doğrusu bu).
  assert.match(baglantilandir(htmlKacis("https://x.com/a?b=1&c=2")), /href="https:\/\/x\.com\/a\?b=1&amp;c=2"/);
});

test("imza bloğu logo ve adla kuruluyor", () => {
  const html = imzaHtml({
    gonderenAdi: "Burak Erdoğan",
    imza: "Akademik Merkez\ninfo@akademikmerkez.com",
    logoSrc: `cid:${LOGO_CID}`,
    logoAlt: "Akademik Merkez",
    logoOlculeri: { en: 400, boy: 200 },
    renk: "#0A66C2",
  });
  assert.match(html, /<table role="presentation"/);
  assert.match(html, new RegExp(`<img src="cid:${LOGO_CID}" alt="Akademik Merkez" width="88" height="44"`));
  assert.match(html, /border-left:3px solid #0A66C2/);
  assert.match(html, /<div style="font-weight:600;color:#1b1f24">Burak Erdoğan<\/div>/);
  assert.match(html, /Akademik Merkez<br>info@akademikmerkez\.com/);
});

test("imza bloğu eksik parçalarla da ayakta", () => {
  // Logo yoksa görsel hücresi hiç yazılmıyor; <img> boş src ile
  // kalsaydı alıcıda kırık kare görünürdü.
  const logosuz = imzaHtml({ gonderenAdi: "Ad", imza: "Kurum" });
  assert.ok(!logosuz.includes("<img"));
  assert.match(logosuz, /Kurum/);
  // Yalnızca logo: metin hücresi yok.
  const yalnizLogo = imzaHtml({ logoSrc: "https://x.com/logo.png" });
  assert.match(yalnizLogo, /<img/);
  assert.ok(!yalnizLogo.includes("border-left"));
  // Hiçbir şey yoksa blok hiç eklenmiyor (boş çizgi ve boş tablo gitmesin).
  assert.equal(imzaHtml({}), "");
  assert.equal(imzaHtml({ gonderenAdi: "  ", imza: "\n\n", logoSrc: " " }), "");
});

test("imzadaki kurum metni de kaçırılıyor", () => {
  // İmza serbest metin; kurum oraya "<" yazarsa HTML'i bozmamalı.
  assert.match(imzaHtml({ imza: "A & B <Danışmanlık>" }), /A &amp; B &lt;Danışmanlık&gt;/);
});

test("marka rengi doğrulanıyor", () => {
  /* Renk kurum ayarlarından serbest metin geliyor; doğrudan style'a
     yazmak imzaya başka bildirim sokardı. */
  assert.equal(markaRengi("#0A66C2"), "#0A66C2");
  assert.equal(markaRengi("#abc"), "#abc");
  assert.equal(markaRengi("red; background:url(http://kotu)"), "#e3e6ea");
  assert.equal(markaRengi(null), "#e3e6ea");
});

test("logo ölçüsü yazılıyor ve geniş logo genişlikten sınırlanıyor", () => {
  /* Ölçü HTML niteliklerine yazılmak zorunda: Outlook'un Word motoru
     CSS boyutunu yoksayıp görseli özgün boyutunda çiziyor. */
  assert.deepEqual(logoOlcusu({ en: 400, boy: 200 }), { en: 88, boy: 44 });
  // Kelime logosu: 44 piksel yükseklikte 900 piksel genişlerdi.
  assert.deepEqual(logoOlcusu({ en: 1800, boy: 90 }), { en: 200, boy: 10 });
  assert.equal(logoOlcusu(null), null);
  assert.equal(logoOlcusu({ en: 0, boy: 10 }), null);
  // Ölçü okunamadıysa yalnızca yükseklik yazılıyor, en oranla çiziliyor.
  assert.match(imzaHtml({ logoSrc: "cid:x" }), new RegExp(`height="${LOGO_YUKSEKLIK}"`));
});

test("görselin ölçüsü baytlarından okunuyor", () => {
  const png = Buffer.alloc(24);
  png.write("\x89PNG\r\n\x1a\n", 0, "latin1");
  png.write("IHDR", 12, "latin1");
  png.writeUInt32BE(320, 16);
  png.writeUInt32BE(120, 20);
  assert.deepEqual(gorselOlculeri(png), { en: 320, boy: 120 });

  const gif = Buffer.alloc(10);
  gif.write("GIF89a", 0, "latin1");
  gif.writeUInt16LE(64, 6);
  gif.writeUInt16LE(32, 8);
  assert.deepEqual(gorselOlculeri(gif), { en: 64, boy: 32 });

  /* JPEG: Huffman tablosu (0xC4) çerçeve başlığı sanılırsa boyut
     baytların ortasından okunur ve logo saçma bir ölçüyle gider. */
  const jpg = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xc4, 0x00, 0x04, 0x00, 0x00]),
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08]),
    (() => { const b = Buffer.alloc(4); b.writeUInt16BE(150, 0); b.writeUInt16BE(300, 2); return b; })(),
    Buffer.alloc(8),
  ]);
  assert.deepEqual(gorselOlculeri(jpg), { en: 300, boy: 150 });

  // WEBP okunmuyor: null dönüyor ve imza yalnızca yükseklikle çiziliyor.
  assert.equal(gorselOlculeri(Buffer.from("RIFF....WEBPVP8 ", "latin1")), null);
  assert.equal(gorselOlculeri(Buffer.alloc(0)), null);
});

test("logo adresi yalnızca https ve genel adlardan indiriliyor", () => {
  /* Adres kurum ayarlarından geliyor, indirmeyi SUNUCU yapıyor:
     iç ağdaki bir servise ya da bulut üst verisine yöneltilemesin. */
  assert.equal(logoAdresiUygunMu("https://abc.supabase.co/storage/v1/logo.png?v=1"), true);
  assert.equal(logoAdresiUygunMu("https://akademikmerkez.com/logo.png"), true);
  assert.equal(logoAdresiUygunMu("http://akademikmerkez.com/logo.png"), false);
  assert.equal(logoAdresiUygunMu("https://169.254.169.254/latest/meta-data/"), false);
  assert.equal(logoAdresiUygunMu("https://10.0.0.5/logo.png"), false);
  assert.equal(logoAdresiUygunMu("https://localhost/logo.png"), false);
  assert.equal(logoAdresiUygunMu("https://kasa.internal/logo.png"), false);
  assert.equal(logoAdresiUygunMu("https://[::1]/logo.png"), false);
  assert.equal(logoAdresiUygunMu("file:///etc/passwd"), false);
  assert.equal(logoAdresiUygunMu("logo.png"), false);
  assert.equal(logoAdresiUygunMu(null), false);
});

test("HTML gövde: yanıt, imza, alıntı sırası", () => {
  const html = htmlGovdesi({
    govde: "Merhaba, teklifi hazırladık.",
    gonderenAdi: "Burak Erdoğan",
    imza: "Akademik Merkez",
    logoSrc: "cid:logo",
    alinti: {
      gonderenAd: "Ali Veli",
      gonderenAdres: "ali@x.com",
      tarih: new Date("2026-10-09T07:30:00Z"),
      metin: "Fiyat nedir?",
    },
  });
  assert.match(html, /^<!DOCTYPE html><html lang="tr">/);
  // charset olmadan bazı istemciler Türkçe harfleri bozuyordu.
  assert.match(html, /<meta charset="utf-8">/);
  const yanitYeri = html.indexOf("teklifi hazırladık");
  const imzaYeri = html.indexOf("Burak Erdoğan");
  const alintiYeri = html.indexOf("Fiyat nedir?");
  assert.ok(yanitYeri < imzaYeri && imzaYeri < alintiYeri, "sıra: yanıt → imza → alıntı");
  assert.match(html, /9 Ekim 2026 .* tarihinde Ali Veli &lt;ali@x\.com&gt; şöyle yazdı:/);
  assert.match(html, /<blockquote style="margin:0;padding:0 0 0 12px/);
});

test("HTML gövdede alıntı yoksa blockquote hiç yazılmıyor", () => {
  const html = htmlGovdesi({ govde: "Tek satır.", imza: "Kurum" });
  assert.ok(!html.includes("blockquote"));
  // İmza da yoksa yalnızca gövde kalıyor.
  const sade = htmlGovdesi({ govde: "Tek satır." });
  assert.ok(!sade.includes("<table"));
  assert.match(sade, /Tek satır\./);
});

test("imza kutusu boşken kurumun kendi bilgileri yazılıyor", () => {
  /* İmza doldurulmadığında giden postada kurumdan hiçbir iz
     kalmıyordu: yalnızca logo ve yazanın adı. Bilgi Ayarlar'da zaten
     kayıtlı. */
  assert.equal(
    varsayilanImza({ ad: "Akademik Merkez", eposta: "info@am.com", telefon: "0312 000 00 00", web: "https://akademikmerkez.com/" }),
    "Akademik Merkez\ninfo@am.com · 0312 000 00 00\nakademikmerkez.com",
  );
  // Eksik alanlar satır ya da ayraç bırakmıyor.
  assert.equal(varsayilanImza({ ad: "Kurum", telefon: "0312" }), "Kurum\n0312");
  assert.equal(varsayilanImza({ ad: "Kurum" }), "Kurum");
  assert.equal(varsayilanImza({}), "");
  // Hiçbir bilgi yoksa imza bloğu da kurulmuyor.
  assert.equal(imzaHtml({ imza: varsayilanImza({}) }), "");
});
