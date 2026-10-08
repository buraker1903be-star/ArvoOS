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
