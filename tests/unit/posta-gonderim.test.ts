import assert from "node:assert/strict";
import test from "node:test";
import {
  aliciListesi,
  base64UrlKodla,
  baslikDegeri,
  baslikKodla,
  yanitAlicisi,
  yanitKonusu,
  ekBoyutuEngeli,
  alintiliGovde,
  ccAdaylari,
  basliktakiAdresler,
  ekAdiParametresi,
  yonlendirmeGovdesi,
  yonlendirmeKonusu,
  guvenliEkAdi,
  imzaliGovde,
  yanitMesajiKur,
  yeniMesajiKur,
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

test("alıcı listesi ayrıştırılıyor ve temizleniyor", () => {
  /*
    Listeler çoğu zaman başka bir yerden kopyalanıp yapıştırılıyor ve
    "Ad Soyad <adres>" biçiminde geliyor. Adı başlığa olduğu gibi
    yazmak, adında virgül olan bir kopyada mesajı yanlış kişiye
    gönderirdi.
  */
  const sonuc = aliciListesi('Ayşe Yılmaz <Ayse@Firma.com>; bilgi@x.com , Ayse@firma.com');
  assert.ok(!("hata" in sonuc));
  if ("hata" in sonuc) return;
  // Yinelenen adres bir kez: aynı kişiye iki kopya gitmesin.
  assert.deepEqual(sonuc.adresler, ["ayse@firma.com", "bilgi@x.com"]);
});

test("geçersiz adres sessizce atılmıyor", () => {
  // Yazdığı adrese gönderdiğini sanan biri, gitmediğini günler sonra öğrenir.
  const sonuc = aliciListesi("dogru@x.com, bozuk-adres");
  assert.ok("hata" in sonuc);
  assert.match((sonuc as { hata: string }).hata, /bozuk-adres/);
  assert.match((aliciListesi("") as { hata: string }).hata, /En az bir alıcı/);
  assert.match((aliciListesi("   ,  ") as { hata: string }).hata, /En az bir alıcı/);
});

test("yeni postada Re: ve zincir başlığı yok", () => {
  /*
    Var olmayan bir mesaja atıf (In-Reply-To), alıcının istemcisinde
    konuşmayı boş bir dala asıyor.
  */
  const ham = yeniMesajiKur({
    gonderenAd: "Akademik Merkez",
    gonderenAdres: "info@akademikmerkez.com",
    alicilar: ["musteri@x.com", "ikinci@x.com"],
    konu: "Tez danışmanlığı teklifi",
    govde: "Merhaba",
  });
  assert.match(ham, /\r\nTo: musteri@x\.com, ikinci@x\.com\r\n/);
  assert.ok(!ham.includes("In-Reply-To"));
  assert.ok(!ham.includes("References:"));
  assert.ok(!/Subject: Re:/.test(ham));
  // Türkçe harf başlıkta kodlanıyor.
  assert.match(ham, /Subject: =\?UTF-8\?B\?/);
});

/*
  BAŞLIK ENJEKSİYONU.

  Başlıklar "\r\n" ile birleşiyor; bir değerin içinde satır sonu kalırsa
  o noktada YENİ BİR BAŞLIK başlıyor. 08.10.2026'da ölçüldü: konusu
  "Teklif\r\nBcc: …" olan bir posta gerçek bir Bcc başlığıyla gidiyordu,
  yani ortak kutudan yazabilen biri gönderdiği her postanın gizli bir
  kopyasını dışarı çıkarabiliyordu.

  Kaçma sebebi ince: baslikKodla salt ASCII girdiyi olduğu gibi
  döndürüyordu ve CR/LF de ASCII. TÜRKÇE bir konu base64'e çevrildiği
  için zararsızdı — açık yalnızca ASCII konularda vardı. Testler de bu
  yüzden iki dili ayrı ayrı deniyor.
*/

/*
  SATIR AYIRACI YALNIZCA "\r\n" DEĞİL. İlk sürümde bu yardımcı yalnızca
  "\r\n" ile bölüyordu ve mutasyon testinde yakalandı: tek "\n" ile
  enjekte edilen bir başlık, bölünmediği için önceki satırın içinde
  kalıyor ve test "Bcc yok" diyordu. Posta sunucularının çoğu tek LF'i
  de satır sonu sayıyor, yani açık gerçekti ve ölçüm aracı görmüyordu.
*/
const basliklariAl = (ham: string) =>
  ham.split(/\r\n\r\n|\n\n/)[0].split(/\r\n|\r|\n/);

const yeni = (parcalar: Partial<Parameters<typeof yeniMesajiKur>[0]>) =>
  yeniMesajiKur({
    gonderenAd: "ArvoCulture",
    gonderenAdres: "info@arvoculture.com",
    alicilar: ["musteri@ornek.com"],
    konu: "Teklif",
    govde: "merhaba",
    ...parcalar,
  });

test("ASCII konuya gömülü satır sonu başlık açmıyor", () => {
  const basliklar = basliklariAl(yeni({ konu: "Teklif\r\nBcc: saldirgan@kotu.com" }));
  assert.ok(!basliklar.some((b) => /^Bcc:/i.test(b)), "Bcc başlığı enjekte oldu");
  assert.equal(basliklar.filter((b) => /^Subject:/i.test(b)).length, 1);
});

test("tek LF ve tek CR de yetmiyor", () => {
  // Yalnızca "\r\n" aranan bir düzeltme bu ikisini kaçırırdı.
  for (const ayirac of ["\n", "\r", "\r\n", "\u0000"]) {
    const basliklar = basliklariAl(yeni({ konu: `Teklif${ayirac}Bcc: x@y.com` }));
    assert.ok(!basliklar.some((b) => /^Bcc:/i.test(b)), `${JSON.stringify(ayirac)} ile enjekte oldu`);
  }
});

test("gönderen adı, gönderen adresi ve alıcı da arındırılıyor", () => {
  /*
    Bu alanlar Gmail'den okunan veriden türüyor; oradan gelen bir satır
    sonu da başlık açardı.

    HER AYIRAÇ AYRI DENENİYOR. İlk sürüm yalnızca "\r\n" deniyordu ve
    mutasyon testinde yakalandı: KONU alanının ikinci bir savunması var
    (yazdırılamayan karakter görünce base64'e çeviriyor), ama ADRES
    alanlarında o yok. Yani arındırmayı "\r\n ara, boşlukla değiştir"e
    daraltan bir değişiklik, tek "\n" ile adres üzerinden hâlâ başlık
    açtırırdı ve test bunu görmezdi.
  */
  for (const ayirac of ["\n", "\r", "\r\n"]) {
    const basliklar = basliklariAl(
      yeni({
        gonderenAd: `Arvo${ayirac}Bcc: a@b.com`,
        gonderenAdres: `info@arvoculture.com${ayirac}Bcc: c@d.com`,
        alicilar: ["musteri@ornek.com"],
      }),
    );
    assert.ok(!basliklar.some((b) => /^Bcc:/i.test(b)), `${JSON.stringify(ayirac)} ile enjekte oldu`);
    assert.equal(basliklar.filter((b) => /^From:/i.test(b)).length, 1, JSON.stringify(ayirac));
  }
});

test("meşru konular bozulmuyor", () => {
  assert.equal(baslikDegeri("Teklif Güncellemesi"), "Teklif Güncellemesi");
  // Türkçe konu yine base64'e gidiyor (önceki davranış korunuyor).
  const basliklar = basliklariAl(yeni({ konu: "Teklif Güncellemesi" }));
  assert.ok(basliklar.some((b) => b === "Subject: =?UTF-8?B?VGVrbGlmIEfDvG5jZWxsZW1lc2k=?="));
});

test("arındırma yalnızca denetim karakterlerini alıyor", () => {
  // Noktalama ve çoklu boşluk meşru; konuyu tanınmaz hâle getirmemeli.
  assert.equal(baslikDegeri("Fatura #123 — 50% indirim"), "Fatura #123 — 50% indirim");
  assert.equal(baslikDegeri("  boşluklu  konu  "), "boşluklu konu");
});

test("ekli mesaj çok parçalı kuruluyor", () => {
  const ham = yeniMesajiKur({
    gonderenAd: "Akademik Merkez",
    gonderenAdres: "info@akademikmerkez.com",
    alicilar: ["musteri@x.com"],
    konu: "Teklif",
    govde: "Ektedir.",
    ekler: [{ ad: "Sözleşme Ücreti.pdf", tur: "application/pdf", veri: Buffer.from("PDF-icerik") }],
    sinir: "SINIR123",
  });

  assert.match(ham, /Content-Type: multipart\/mixed; boundary="SINIR123"/);
  // Metin ve dosya ayrı parçalarda, sonda kapanış sınırı var.
  assert.equal(ham.match(/--SINIR123\r\n/g)?.length, 2);
  assert.match(ham, /--SINIR123--/);
  assert.match(ham, /Content-Type: application\/pdf; name="Sözleşme Ücreti\.pdf"/);
  /* Dosya adı iki kez: sade filename eski istemciler için, filename*
     Türkçe harfleri taşımak için. Yalnızca sade yazmak adı bozuyordu. */
  assert.match(ham, /filename\*=UTF-8''S%C3%B6zle%C5%9Fme%20%C3%9Ccreti\.pdf/);
  const parcalar = ham.split("--SINIR123");
  assert.ok(parcalar[2].includes(Buffer.from("PDF-icerik").toString("base64")));
});

test("eksiz mesaj çok parçalı kurulmuyor", () => {
  // Tek parçalık mesajı multipart'a sarmak, bazı istemcilerde boş bir
  // ek olarak görünüyor.
  const ham = yeniMesajiKur({
    gonderenAd: "A", gonderenAdres: "a@b.com", alicilar: ["c@d.com"], konu: "K", govde: "G",
  });
  assert.ok(!ham.includes("multipart/mixed"));
  assert.match(ham, /Content-Type: text\/plain; charset="UTF-8"/);
});

test("ek adı MIME başlığına girmeden temizleniyor", () => {
  // Addaki tırnak ya da satır sonu başlığı bölüp parçanın sınırını
  // kaydırıyor ve mesaj alıcıda bozuk görünüyor.
  assert.equal(guvenliEkAdi('rapor".pdf\r\nX: 1'), "rapor .pdf X: 1");
  assert.equal(guvenliEkAdi("  Sözleşme.pdf  "), "Sözleşme.pdf");
  assert.equal(guvenliEkAdi(""), "ek");
});

test("ek boyutu sınırı gönderimden önce söyleniyor", () => {
  /*
    Gmail'in reddi "Request entity too large" diye dönüyor ve neyin
    büyük olduğunu söylemiyor; sessizce düşen bir gönderim, kullanıcının
    gittiğini sandığı bir teklif demek.
  */
  assert.equal(ekBoyutuEngeli([{ ad: "a.pdf", boyut: 1024 * 1024 }]), null);
  const engel = ekBoyutuEngeli([{ ad: "a.pdf", boyut: 2 * 1024 * 1024 }, { ad: "b.pdf", boyut: 2 * 1024 * 1024 }]);
  assert.match(engel ?? "", /4,0 MB/);
  assert.match(engel ?? "", /en fazla 3 MB/);
  assert.equal(ekBoyutuEngeli([]), null);
});

test("kurum imzası standart ayıraçla ekleniyor", () => {
  /*
    "-- " + satır sonu RFC 3676'nın imza ayıracı: posta istemcileri
    imzayı bununla tanıyıp yanıtta alıntıdan düşürüyor. Ayıraç olmadan
    her yanıtta bir kopya daha birikip yazışmanın yarısı imza oluyor.
  */
  const sonuc = imzaliGovde("Merhaba,\nteklifimiz ektedir.", "Akademik Merkez\nuzman@akademikmerkez.com");
  assert.equal(sonuc, "Merhaba,\nteklifimiz ektedir.\n\n-- \nAkademik Merkez\nuzman@akademikmerkez.com");
});

test("imza iki kez eklenmiyor", () => {
  // Taslaktan gelen metin imzayı zaten taşıyor olabilir.
  const birKez = imzaliGovde("Merhaba", "Arvo");
  assert.equal(imzaliGovde(birKez, "Arvo"), birKez);
});

test("imza yoksa gövdeye dokunulmuyor", () => {
  assert.equal(imzaliGovde("Merhaba", null), "Merhaba");
  assert.equal(imzaliGovde("Merhaba", "   "), "Merhaba");
});

test("alıntı standart biçimde ekleniyor", () => {
  /*
    Yanıt tek başına gidince müşteri neye cevap verildiğini çoğu zaman
    anlamıyor: kendi mesajını başka bir kutudan, günler sonra okuyor.
  */
  const sonuc = alintiliGovde("Teşekkürler, inceliyoruz.", {
    gonderenAd: "Ayşe Yılmaz",
    gonderenAdres: "ayse@firma.com",
    tarih: new Date("2026-10-05T09:30:00Z"),
    metin: "Merhaba,\nteklifi bekliyorum.",
  });
  assert.match(sonuc, /^Teşekkürler, inceliyoruz\.\n\n/);
  assert.match(sonuc, /Ayşe Yılmaz <ayse@firma\.com> şöyle yazdı:/);
  assert.match(sonuc, /\n> Merhaba,\n> teklifi bekliyorum\./);
});

test("alıntı yoksa gövdeye dokunulmuyor", () => {
  assert.equal(alintiliGovde("Merhaba", null), "Merhaba");
  assert.equal(alintiliGovde("Merhaba", { gonderenAd: null, gonderenAdres: "a@b.com", tarih: null, metin: "   " }), "Merhaba");
});

test("uzun alıntı kısaltılıyor", () => {
  /* Yirmi turluk bir yazışmanın tamamını her mesaja eklemek hem okunamaz
     hem Gmail'in "kırpıldı" uyarısını getiriyor. */
  const uzun = "x".repeat(5000);
  const sonuc = alintiliGovde("Cevap", { gonderenAd: null, gonderenAdres: "a@b.com", tarih: null, metin: uzun });
  assert.ok(sonuc.includes("…"));
  assert.ok(sonuc.length < 5000);
});

test("tümünü yanıtla adaylarından kutu ve asıl alıcı çıkarılıyor", () => {
  /*
    Kutunun kendi adresi Cc'ye girerse gelen kutusuna kendi yanıtımızın
    kopyası düşer; asıl alıcı girerse ona iki kopya gider.
  */
  const adaylar = ccAdaylari(
    "info@biz.com, musteri@x.com, Muhasebe <muhasebe@x.com>",
    "info@biz.com",
    "musteri@x.com",
  );
  assert.deepEqual(adaylar, ["muhasebe@x.com"]);
  assert.deepEqual(ccAdaylari(null, "info@biz.com", "musteri@x.com"), []);
  // Bozuk başlıkta sessizce boş dönüyor: Cc kullanıcı girdisi değil, türetilmiş bir öneri.
  assert.deepEqual(ccAdaylari("bozuk-adres", "info@biz.com", "musteri@x.com"), []);
});

test("Cc başlığı yalnızca adres varsa yazılıyor", () => {
  const ccli = yeniMesajiKur({
    gonderenAd: "A", gonderenAdres: "a@b.com", alicilar: ["c@d.com"], konu: "K", govde: "G", cc: ["e@f.com"],
  });
  assert.match(ccli, /\r\nCc: e@f\.com\r\n/);
  const ccsiz = yeniMesajiKur({ gonderenAd: "A", gonderenAdres: "a@b.com", alicilar: ["c@d.com"], konu: "K", govde: "G" });
  assert.ok(!ccsiz.includes("Cc:"));
});

test("tümünü yanıtla: virgüllü tırnaklı ad aday listesini düşürmüyor", () => {
  /* 09.10.2026: başlık aliciListesi ile virgülden bölünüyordu;
     "Doe, John" <j@x.com> parçalanıp geçersiz sayılıyor ve bütün
     adaylar kayboluyordu. */
  assert.deepEqual(basliktakiAdresler('"Doe, John" <J@X.com>, info@biz.com, ayse@firma.com'), ["j@x.com", "info@biz.com", "ayse@firma.com"]);
  assert.deepEqual(ccAdaylari('"Doe, John" <j@x.com>, info@biz.com, Ayşe <ayse@firma.com>', "INFO@biz.com", "ayse@firma.com"), ["j@x.com"]);
  assert.deepEqual(basliktakiAdresler(""), []);
  assert.deepEqual(basliktakiAdresler("bozuk-adres, a@b.co"), ["a@b.co"]);
});

test("ek dosya adı RFC 5987 ile kodlanıyor ve satır sınırını aşmıyor", () => {
  // Kesme işareti ve parantezler de kodlanmalı; encodeURIComponent onları bırakıyor.
  assert.equal(ekAdiParametresi("Ali'nin (son) sözleşmesi*.pdf"), "Ali%27nin%20%28son%29%20s%C3%B6zle%C5%9Fmesi%2A.pdf");
  /* Eskiden kırpılmamış ad kodlanıyordu: 200 Türkçe harfli bir ad tek
     başlık satırını 998 karakterin üstüne taşıyordu. */
  assert.ok(ekAdiParametresi("ş".repeat(400) + ".pdf").length <= 900);
  const ham = yeniMesajiKur({
    gonderenAd: "K", gonderenAdres: "info@biz.com", alicilar: ["m@x.com"], konu: "Ek", govde: "Ektedir.",
    ekler: [{ ad: "ğ".repeat(300) + ".pdf", tur: "application/pdf", veri: Buffer.from("x") }], sinir: "S1",
  });
  for (const satir of ham.split("\r\n")) assert.ok(satir.length <= 998, "998 karakteri aşan satır: " + satir.length);
});

test("yönlendirme konusu tek sefer Fwd taşıyor, Re'yi koruyor", () => {
  assert.equal(yonlendirmeKonusu("Teklif"), "Fwd: Teklif");
  // Zincirde biriken ön ek: "Fwd: Fwd: Teklif" üretilmemeli.
  assert.equal(yonlendirmeKonusu("Fwd: Teklif"), "Fwd: Teklif");
  assert.equal(yonlendirmeKonusu("FW: Teklif"), "FW: Teklif");
  assert.equal(yonlendirmeKonusu("İlt: Teklif"), "İlt: Teklif");
  // Yanıt ön eki korunuyor: alıcı neyin yönlendirildiğini konudan görmeli.
  assert.equal(yonlendirmeKonusu("Re: Teklif"), "Fwd: Re: Teklif");
  assert.equal(yonlendirmeKonusu("   "), "Fwd:");
});

test("yönlendirme gövdesi özgün mesajın üst verisini taşıyor", () => {
  const govde = yonlendirmeGovdesi("Muhasebeye iletiyorum.", {
    gonderenAd: "Ayşe Yılmaz",
    gonderenAdres: "ayse@musteri.com",
    alici: "info@biz.com",
    konu: "Teklif",
    tarih: new Date("2026-10-08T07:30:00Z"),
    metin: "Teklifi aldık, teşekkürler.",
  });
  assert.match(govde, /^Muhasebeye iletiyorum\.\n\n---------- İletilen mesaj ----------\n/);
  assert.match(govde, /Kimden: Ayşe Yılmaz <ayse@musteri\.com>/);
  assert.match(govde, /Kime: info@biz\.com/);
  assert.match(govde, /Konu: Teklif/);
  assert.match(govde, /Tarih: 8 Ekim 2026 10:30/);
  assert.match(govde, /Teklifi aldık, teşekkürler\.$/);
  // Not yazılmamışsa gövde doğrudan başlıkla başlıyor.
  const notsuz = yonlendirmeGovdesi("  ", {
    gonderenAd: null, gonderenAdres: "a@b.com", alici: null, konu: null, tarih: null, metin: "metin",
  });
  assert.match(notsuz, /^---------- İletilen mesaj ----------\nKimden: a@b\.com\n\nmetin$/);
});

test("imzanın ilk satırı yanıtı yazanın adı", () => {
  /* Ortak kutudan çıkan yanıtta kimin yazdığı görünmüyordu
     (kurum sahibinin kararı, 10.10.2026). Kurum imzası altında kalıyor. */
  assert.equal(
    imzaliGovde("Merhaba.", "Akademik Merkez\ninfo@am.com", "Burak Erdoğan"),
    "Merhaba.\n\n-- \nBurak Erdoğan\nAkademik Merkez\ninfo@am.com",
  );
  // Ad yoksa eski davranış: yalnızca kurum imzası.
  assert.equal(imzaliGovde("Merhaba.", "Akademik Merkez", null), "Merhaba.\n\n-- \nAkademik Merkez");
  // Kurum imzası yoksa yalnızca ad; ikisi de yoksa gövdeye dokunulmuyor.
  assert.equal(imzaliGovde("Merhaba.", "", "Burak Erdoğan"), "Merhaba.\n\n-- \nBurak Erdoğan");
  assert.equal(imzaliGovde("Merhaba.", "", ""), "Merhaba.");
  // Taslaktan gelen metinde blok zaten varsa ikinci kez eklenmiyor.
  const birKez = imzaliGovde("Merhaba.", "Akademik Merkez", "Burak Erdoğan");
  assert.equal(imzaliGovde(birKez, "Akademik Merkez", "Burak Erdoğan"), birKez);
});

test("HTML gövde multipart/alternative olarak gidiyor", () => {
  /* Düz metin KALDIRILMIYOR: HTML'i göstermeyen kutuda (kurumsal
     Outlook kuralları, otomatik işleyen sistemler) yazışma okunur
     kalmalı. Yalnızca HTML göndermek o kutularda boş mesaj demekti. */
  const ham = yeniMesajiKur({
    gonderenAd: "Akademik Merkez", gonderenAdres: "info@am.com", alicilar: ["m@x.com"],
    konu: "Teklif", govde: "Düz metin.", html: "<p>HTML</p>", sinir: "S",
  });
  assert.match(ham, /Content-Type: multipart\/alternative; boundary="S-metin"/);
  // Sıra RFC 2046: en sade biçim önce, istemci sonuncuyu seçer.
  const duzYeri = ham.indexOf('Content-Type: text/plain');
  const htmlYeri = ham.indexOf('Content-Type: text/html');
  assert.ok(duzYeri > 0 && duzYeri < htmlYeri, "düz metin HTML'den önce");
  assert.ok(ham.includes(Buffer.from("Düz metin.", "utf8").toString("base64")));
  assert.ok(ham.includes(Buffer.from("<p>HTML</p>", "utf8").toString("base64")));
  assert.ok(!ham.includes("multipart/mixed"), "ek yok: mixed katmanı kurulmuyor");
  assert.ok(!ham.includes("multipart/related"), "logo yok: related katmanı kurulmuyor");
});

test("imza logosu mesajın içine gömülüyor", () => {
  const ham = yeniMesajiKur({
    gonderenAd: "Akademik Merkez", gonderenAdres: "info@am.com", alicilar: ["m@x.com"],
    konu: "Teklif", govde: "Metin.", html: '<img src="cid:logo-kimligi">',
    gomulu: [{ kimlik: "logo-kimligi", ad: "logo.png", tur: "image/png", veri: Buffer.from("PNGVERI") }],
    sinir: "S",
  });
  /* related katmanı alternative'i ve logoyu sarıyor; type parametresi
     olmadan bazı eski istemciler logoyu gövde sanıyor. */
  assert.match(ham, /Content-Type: multipart\/related; type="multipart\/alternative"; boundary="S-ilgili"/);
  assert.match(ham, /Content-Type: image\/png; name="logo\.png"/);
  // inline + Content-ID: logo alıcının ek listesinde ataç olarak görünmesin.
  assert.match(ham, /Content-Disposition: inline; filename="logo\.png"/);
  assert.match(ham, /Content-ID: <logo-kimligi>/);
  assert.ok(ham.includes(Buffer.from("PNGVERI").toString("base64")));
});

test("ek, logo ve HTML bir aradayken katmanlar iç içe", () => {
  const ham = yeniMesajiKur({
    gonderenAd: "A", gonderenAdres: "a@b.com", alicilar: ["c@d.com"],
    konu: "K", govde: "G", html: "<p>G</p>",
    ekler: [{ ad: "teklif.pdf", tur: "application/pdf", veri: Buffer.from("PDF") }],
    gomulu: [{ kimlik: "logo", ad: "logo.png", tur: "image/png", veri: Buffer.from("IMG") }],
    sinir: "S",
  });
  /* Sıra: mixed → related → alternative. İÇ İÇE katmanların sınırı
     farklı olmalı; aynı sınır, dış katmanın iç parçanın ortasında
     bitmesi (alıcıda yarım mesaj) demekti. */
  const mixed = ham.indexOf('multipart/mixed; boundary="S"');
  const related = ham.indexOf('multipart/related');
  const alternative = ham.indexOf('multipart/alternative; boundary="S-metin"');
  assert.ok(mixed >= 0 && mixed < related && related < alternative, "mixed → related → alternative");
  // Her katman kendi kapanış sınırıyla bitiyor.
  for (const sinir of ["S", "S-ilgili", "S-metin"]) assert.ok(ham.includes(`--${sinir}--`), sinir);
  assert.match(ham, /Content-Disposition: attachment; filename="teklif\.pdf"/);
});
