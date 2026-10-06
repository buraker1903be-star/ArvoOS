import assert from "node:assert/strict";
import test from "node:test";
import {
  baslik,
  gondereniAyristir,
  htmlDenMetin,
  konusmayiOzetle,
  mesajGovdesi,
  mesajTarihi,
  mesajYonu,
  mesajiCoz,
  type CozulmusMesaj,
} from "@/lib/posta-ayristirma";

const b64 = (metin: string) => Buffer.from(metin, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

test("başlık adı büyük/küçük harfe duyarsız aranıyor", () => {
  // Bazı sunucular "FROM" yazıyor; duyarlı arama göndereni boş bırakıyordu.
  const basliklar = [{ name: "FROM", value: "a@b.com" }, { name: "Subject", value: "Merhaba" }];
  assert.equal(baslik(basliklar, "From"), "a@b.com");
  assert.equal(baslik(basliklar, "subject"), "Merhaba");
  assert.equal(baslik(basliklar, "To"), "");
  assert.equal(baslik(undefined, "From"), "");
});

test("gönderen adı ve adresi ayrışıyor", () => {
  assert.deepEqual(gondereniAyristir("Ayşe Yılmaz <Ayse@Firma.com>"), { ad: "Ayşe Yılmaz", adres: "ayse@firma.com" });
  // Tırnaklı ad: virgül ekranda iki kişi varmış gibi görünüyordu.
  assert.deepEqual(gondereniAyristir('"Yılmaz, Ayşe" <ayse@firma.com>'), { ad: "Yılmaz, Ayşe", adres: "ayse@firma.com" });
  // Köşeli parantezsiz başlık da geliyor.
  assert.deepEqual(gondereniAyristir("ayse@firma.com"), { ad: null, adres: "ayse@firma.com" });
  assert.deepEqual(gondereniAyristir(""), { ad: null, adres: "" });
});

test("yön önce Gmail etiketinden, yoksa adresten", () => {
  assert.equal(mesajYonu({ etiketler: ["SENT"], gonderenAdres: "x@y.com", kutuAdresi: "info@firma.com" }), "giden");
  // Etiket gecikebiliyor (taslaktan ya da başka istemciden gönderim).
  assert.equal(mesajYonu({ gonderenAdres: "Info@Firma.com", kutuAdresi: "info@firma.com" }), "giden");
  assert.equal(mesajYonu({ etiketler: ["INBOX"], gonderenAdres: "musteri@x.com", kutuAdresi: "info@firma.com" }), "gelen");
});

test("internalDate metin olarak geliyor ve sayıya çevriliyor", () => {
  // Çevrilmeden Date'e verildiğinde "Invalid Date" oluyor, liste tarihsiz çiziliyordu.
  assert.equal(mesajTarihi("1760000000000")?.toISOString(), new Date(1760000000000).toISOString());
  assert.equal(mesajTarihi(1760000000000)?.toISOString(), new Date(1760000000000).toISOString());
  assert.equal(mesajTarihi("abc"), null);
  assert.equal(mesajTarihi(undefined), null);
  assert.equal(mesajTarihi("0"), null);
});

test("mesaj çözülüyor, özetteki HTML varlıkları açılıyor", () => {
  const cozulen = mesajiCoz({
    id: "m1", threadId: "t1", labelIds: ["INBOX", "UNREAD"], internalDate: "1760000000000",
    snippet: "Merhaba&#39;dan &amp; sonra",
    payload: { headers: [
      { name: "From", value: "Ayşe <ayse@firma.com>" },
      { name: "To", value: "info@biz.com" },
      { name: "Subject", value: "Teklif" },
    ] },
  }, "info@biz.com");
  assert.ok(cozulen);
  assert.equal(cozulen!.ozet, "Merhaba'dan & sonra");
  assert.equal(cozulen!.yon, "gelen");
  assert.equal(cozulen!.okunmamis, true);
  assert.equal(cozulen!.gonderenAdres, "ayse@firma.com");
  // Kimliksiz mesaj tabloya yazılamaz.
  assert.equal(mesajiCoz({ threadId: "t1" }, "info@biz.com"), null);
});

const mesaj = (parcali: Partial<CozulmusMesaj>): CozulmusMesaj => ({
  messageId: "m", threadId: "t", gonderenAd: null, gonderenAdres: "a@b.com", alici: "", konu: "",
  ozet: "", tarih: null, yon: "gelen", okunmamis: false, ekliDosya: false, ...parcali,
});

test("konuşma özeti son mesajdan, konu ilk mesajdan", () => {
  /*
    Konu ilk mesajdan: yanıtlarda "Re: " ekleniyor ve liste aynı
    konuşmayı her yanıtta farklı başlıkla gösteriyordu.
  */
  const ozet = konusmayiOzetle([
    mesaj({ messageId: "m2", konu: "Re: Teklif", tarih: new Date("2026-10-02T10:00:00Z"), gonderenAd: "Biz", yon: "giden" }),
    mesaj({ messageId: "m1", konu: "Teklif", tarih: new Date("2026-10-01T10:00:00Z"), okunmamis: true }),
  ]);
  assert.equal(ozet?.konu, "Teklif");
  assert.equal(ozet?.sonGonderenAd, "Biz");
  assert.equal(ozet?.mesajSayisi, 2);
  // Konuşmadaki herhangi bir mesaj okunmamışsa konuşma okunmamıştır.
  assert.equal(ozet?.okunmamis, true);
  assert.equal(konusmayiOzetle([]), null);
});

test("gövde düz metni tercih ediyor", () => {
  const govde = mesajGovdesi({
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/plain", body: { data: b64("Düz metin gövde") } },
      { mimeType: "text/html", body: { data: b64("<p>HTML gövde</p>") } },
    ],
  });
  assert.equal(govde, "Düz metin gövde");
});

test("düz metin yoksa HTML metne indiriliyor", () => {
  /*
    Gövde HTML olarak BASILMIYOR: gelen kutusu dışarıdan gelen içerik ve
    gönderenin HTML'ini olduğu gibi göstermek, kurumun oturumu açıkken
    çalışan bir betik demek.
  */
  const govde = mesajGovdesi({
    mimeType: "multipart/mixed",
    parts: [{ mimeType: "text/html", body: { data: b64("<script>kotu()</script><p>Satır bir</p><p>Satır iki</p>") } }],
  });
  assert.equal(govde, "Satır bir\nSatır iki");
  assert.ok(!govde.includes("kotu"));
});

test("etiket temizliği betiği ve stili tamamen atıyor", () => {
  assert.equal(htmlDenMetin("<style>p{color:red}</style><div>Metin</div>"), "Metin");
  assert.equal(htmlDenMetin("a<br>b"), "a\nb");
  assert.equal(htmlDenMetin("&lt;merhaba&gt; &amp; hoş geldin"), "<merhaba> & hoş geldin");
  // İmzalardaki art arda boş satırlar sadeleşiyor.
  assert.equal(htmlDenMetin("<p>a</p><p></p><p></p><p>b</p>"), "a\n\nb");
});

test("ekli dosya iç içe parçalarda da bulunuyor", () => {
  const cozulen = mesajiCoz({
    id: "m", threadId: "t",
    payload: { parts: [{ parts: [{ filename: "teklif.pdf" }] } as never] },
  }, "info@biz.com");
  assert.equal(cozulen?.ekliDosya, true);
});
