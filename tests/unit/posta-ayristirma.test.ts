import assert from "node:assert/strict";
import test from "node:test";
import {
  baslik,
  gondereniAyristir,
  gmailAramaSorgusu,
  kullaniciEtiketleri,
  htmlDenMetin,
  konusmayiOzetle,
  mesajGovdesi,
  mesajTarihi,
  mesajYonu,
  mesajiCoz,
  mesajEkleri,
  guvenliDosyaAdi,
  postaAramaDeseni,
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
    payload: { parts: [{ parts: [{ filename: "teklif.pdf", body: { attachmentId: "ek1" } }] } as never] },
  }, "info@biz.com");
  assert.equal(cozulen?.ekliDosya, true);

  /* Rozet ek listesiyle aynı kaynaktan okunuyor: "ek var" diyip
     listede hiçbir şey göstermemek, kullanıcıyı eki arar hâlde
     bırakıyordu. İndirilemeyen parça (attachmentId yok) ek sayılmıyor. */
  const kimliksiz = mesajiCoz({
    id: "m2", threadId: "t",
    payload: { parts: [{ filename: "teklif.pdf" } as never] },
  }, "info@biz.com");
  assert.equal(kimliksiz?.ekliDosya, false);
});

test("ekler iç içe parçalardan toplanıyor", () => {
  const ekler = mesajEkleri({
    mimeType: "multipart/mixed",
    parts: [
      { mimeType: "text/plain", body: { data: "x" } },
      { filename: "teklif.pdf", mimeType: "application/pdf", body: { attachmentId: "ek1", size: 2048 } },
      { parts: [{ filename: "sözleşme.docx", mimeType: "application/vnd", body: { attachmentId: "ek2", size: 10 } }] },
    ],
  });
  assert.deepEqual(ekler.map((ek) => ek.ekId), ["ek1", "ek2"]);
  assert.equal(ekler[0].dosyaAdi, "teklif.pdf");
  assert.equal(ekler[0].boyut, 2048);
  // Gövde parçası ek sayılmıyor: dosya adı YOK ve attachmentId yok.
  assert.equal(ekler.length, 2);
});

test("ek dosya adı indirme başlığına girmeden temizleniyor", () => {
  /*
    Ad gönderenden geliyor: satır sonu Content-Disposition başlığını
    bölüp ikinci bir başlık enjekte etmeye yarar, eğik çizgi dosyayı
    başka bir dizine yazdırmaya çalışır.
  */
  assert.equal(guvenliDosyaAdi('rapor"\r\nX-Kotu: 1.pdf'), "rapor X-Kotu: 1.pdf");
  assert.equal(guvenliDosyaAdi("../../etc/passwd"), "..-..-etc-passwd");
  // Türkçe harf korunuyor: başlık UTF-8 olarak da kodlanıyor.
  assert.equal(guvenliDosyaAdi(" Sözleşme Ücreti.pdf "), "Sözleşme Ücreti.pdf");
  assert.equal(guvenliDosyaAdi(""), "ek");
});

test("arama terimi süzgeç dilbilgisini bozmuyor", () => {
  /*
    Liste PostgREST'in `or` süzgeciyle aranıyor ve o süzgeç virgülle
    ayrılmış bir METİN: terimdeki virgül ya da parantez sorguyu hataya
    düşürüyor. Yüzde ve alt çizgi LIKE jokeri; "%" yazan bütün kutuyu
    getirirdi.
  */
  assert.equal(postaAramaDeseni("Yılmaz, Ayşe (teklif)"), "Yılmaz Ayşe teklif");
  assert.equal(postaAramaDeseni("%"), null);
  assert.equal(postaAramaDeseni("a_b%c"), "a b c");
  // Tek harf bütün kutuyu getirir ve arama yapılmamış gibi görünür.
  assert.equal(postaAramaDeseni("a"), null);
  assert.equal(postaAramaDeseni("   "), null);
  assert.equal(postaAramaDeseni("tez danışmanlığı"), "tez danışmanlığı");
});

test("alıcıya Cc de yazılıyor (tümünü yanıtla için)", () => {
  // 09.10.2026: yalnızca To saklanıyordu; özgün mesajın Cc alıcıları önerilemiyordu.
  const cozulen = mesajiCoz({
    id: "m2", threadId: "t2",
    payload: { headers: [
      { name: "From", value: "ayse@firma.com" },
      { name: "To", value: "info@biz.com" },
      { name: "Cc", value: "mudur@firma.com" },
    ] },
  }, "info@biz.com");
  assert.equal(cozulen!.alici, "info@biz.com, mudur@firma.com");
  const ccsiz = mesajiCoz({ id: "m3", threadId: "t3", payload: { headers: [{ name: "To", value: "info@biz.com" }] } }, "info@biz.com");
  assert.equal(ccsiz!.alici, "info@biz.com");
});

test("kullanıcı etiketleri sistem etiketlerinden ayrılıyor", () => {
  /*
    Gmail hepsini aynı listede veriyor. Sistem etiketleri BİÇİMLERİYLE
    tanınıyor (tamamı büyük harf ve alt çizgi): sabit liste tutsaydık
    Gmail yeni bir sistem etiketi eklediğinde o, kurumun etiketi gibi
    görünürdü.
  */
  assert.deepEqual(
    kullaniciEtiketleri(["INBOX", "UNREAD", "CATEGORY_PROMOTIONS", "Label_12", "Label_3"]),
    ["Label_12", "Label_3"],
  );
  assert.deepEqual(kullaniciEtiketleri(undefined), []);
  // Yinelenen etiket tek sefer; sıralı dönüyor ki konuşma satırı her turda aynı olsun.
  assert.deepEqual(kullaniciEtiketleri(["Label_9", "Label_1", "Label_9"]), ["Label_1", "Label_9"]);
});

test("gövdede arama çöp ve spam'i dışarıda bırakıyor", () => {
  // Panelin çöp kutusu kendi görünümü; arama sonucuna karışması silinmiş
  // yazışmayı geri gelmiş gibi gösterirdi.
  assert.equal(gmailAramaSorgusu("teklif"), "teklif -in:trash -in:spam");
  assert.equal(gmailAramaSorgusu("  fatura  "), "fatura -in:trash -in:spam");
  // Gmail söz dizimi bilen için olduğu gibi geçiyor.
  assert.equal(gmailAramaSorgusu("from:ayse@x.com has:attachment"), "from:ayse@x.com has:attachment -in:trash -in:spam");
});

test("kendi imza logomuz hiç listelenmiyor, müşterinin görseli listeleniyor", () => {
  /* HTML imza canlıya çıkar çıkmaz her yazışmanın altında "logo.png"
     diye bir ek göründü ve "ekli dosya" rozeti yandı (10.10.2026).
     Ama müşteri ekran görüntüsünü çoğu zaman gövdeye YAPIŞTIRARAK
     gönderiyor; panelde HTML çizilmediği için onu görmenin tek yolu
     ek listesi — hepsini gizlemek içeriği yok etmek olurdu. */
  const ekler = mesajEkleri({
    mimeType: "multipart/related",
    parts: [
      { mimeType: "text/html", body: { size: 10 } },
      {
        filename: "logo.png", mimeType: "image/png",
        headers: [
          { name: "Content-ID", value: "<arvo-kurum-logosu>" },
          { name: "Content-Disposition", value: 'inline; filename="logo.png"' },
        ],
        body: { attachmentId: "ek-logo", size: 23000 },
      },
      {
        filename: "ekran.png", mimeType: "image/png",
        headers: [
          { name: "Content-ID", value: "<image001.png@01DA.0001>" },
          { name: "Content-Disposition", value: 'inline; filename="ekran.png"' },
        ],
        body: { attachmentId: "ek-ekran", size: 4000 },
      },
      {
        filename: "teklif.pdf", mimeType: "application/pdf",
        headers: [{ name: "Content-Disposition", value: 'attachment; filename="teklif.pdf"' }],
        body: { attachmentId: "ek-pdf", size: 1000 },
      },
    ],
  });
  assert.deepEqual(ekler.map((ek) => ek.dosyaAdi), ["ekran.png", "teklif.pdf"]);
  // Gövde görseli ayrı işaretli: ekranda gerçek eklerden ayrı duruyor.
  assert.deepEqual(ekler.map((ek) => ek.gomulu), [true, false]);
});

test("gövde görseli 'ekli dosya' rozetini yakmıyor", () => {
  /* Rozet "indirilecek bir belge var" demek; her kurumsal postanın
     imzasındaki logo yüzünden listedeki her satırda yanıyordu. */
  const yalnizGorsel = mesajiCoz({
    id: "m", threadId: "t",
    payload: { parts: [{
      filename: "image001.png", mimeType: "image/png",
      headers: [
        { name: "Content-ID", value: "<image001@x>" },
        { name: "Content-Disposition", value: "inline" },
      ],
      body: { attachmentId: "ek1", size: 900 },
    } as never] },
  }, "info@biz.com");
  assert.equal(yalnizGorsel?.ekliDosya, false);
});

test("Content-ID taşımayan inline dosya gerçek ek sayılıyor", () => {
  /* Bazı istemciler PDF'i "inline" gönderiyor; gövdede çizilmediği için
     onu görsel saymak, müşterinin gönderdiği belgeyi sessiz bir satıra
     düşürmek olurdu. */
  const ekler = mesajEkleri({
    parts: [{
      filename: "sozlesme.pdf", mimeType: "application/pdf",
      headers: [{ name: "Content-Disposition", value: "inline" }],
      body: { attachmentId: "ek-1", size: 500 },
    }],
  });
  assert.deepEqual(ekler.map((ek) => [ek.dosyaAdi, ek.gomulu]), [["sozlesme.pdf", false]]);
});

test("HTML postada bağlantının adresi kaybolmuyor", () => {
  /* "Siparişinizi görüntüleyin" yazan bir düğmeden geriye yalnızca o
     cümle kalıyordu; müşterinin yolladığı ödeme bağlantısına ulaşmanın
     tek yolu Gmail'e geçmekti. */
  assert.equal(
    htmlDenMetin('<p>Teklif hazır: <a href="https://arvo-os.com/teklif/ab12" style="color:red">Görüntüle</a></p>'),
    "Teklif hazır: Görüntüle (https://arvo-os.com/teklif/ab12)",
  );
  // Adres zaten metin olarak yazıyorsa iki kez yazılmıyor.
  assert.equal(
    htmlDenMetin('<a href="https://x.com/a">https://x.com/a</a>'),
    "https://x.com/a",
  );
});

test("HTML postadan biçim kodu ve gizli metin sızmıyor", () => {
  // Outlook için yazılan koşullu yorum ">" içerdiği için etiket
  // süzgecinden geçiyor ve gövdenin başına anlamsız kod düşüyordu.
  const html = `<!--[if mso]><style>.x{color:red}</style><![endif]-->
    <head><title>Gizli başlık</title></head>
    <body><span>&#8203;&zwnj;&nbsp;&shy;</span><p>Merhaba &ccedil;ok te&scedil;ekk&uuml;rler &#8217;</p></body>`;
  const metin = htmlDenMetin(html);
  assert.ok(!metin.includes("mso"), metin);
  assert.ok(!metin.includes("Gizli başlık"), metin);
  // Tanınan varlıklar çözülüyor, tanınmayan (&scedil;) olduğu gibi kalıyor:
  // yanlış tahmin metni bozmaktan beter.
  assert.match(metin, /Merhaba çok te&scedil;ekkürler ’/);
});

test("tablo hücreleri ve liste maddeleri birbirine yapışmıyor", () => {
  /* Fatura ve pazarlama postalarının tamamı tablo; hücreler
     ayrılmadığında "ÜrünAdetTutar" diye tek kelime oluyordu. */
  assert.equal(
    htmlDenMetin("<table><tr><td>Ürün</td><td>Adet</td><td>Tutar</td></tr></table>"),
    "Ürün Adet Tutar",
  );
  assert.equal(htmlDenMetin("<ul><li>Bir</li><li>İki</li></ul>"), "• Bir\n• İki");
});
