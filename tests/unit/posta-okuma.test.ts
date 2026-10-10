import assert from "node:assert/strict";
import test from "node:test";
import { alintiMetni, alintiSatirSayisi, govdeyiBol, metinParcalari } from "@/lib/posta-okuma";

test("alıntılanan geçmiş gövdeden ayrılıyor", () => {
  /* Müşteri yanıt yazdığında istemcisi bizim önceki mesajımızı da
     gönderiyor; okunacak iki satır yirmi turluk geçmişin üstünde
     kalıyordu. */
  const { yeni, alinti } = govdeyiBol([
    "Teşekkürler, onaylıyorum.",
    "",
    "9 Ekim 2026 10:30 tarihinde Akademik Merkez <info@am.com> şöyle yazdı:",
    "> Teklifi hazırladık.",
    "> İyi çalışmalar.",
  ].join("\n"));
  assert.equal(yeni, "Teşekkürler, onaylıyorum.");
  assert.match(alinti ?? "", /^9 Ekim 2026 .* şöyle yazdı:/);
  assert.equal(alintiSatirSayisi(alinti ?? ""), 3);
});

test("Outlook'un biçimleri de alıntı sayılıyor", () => {
  // Kurumun müşterileri Gmail, Outlook ve telefon uygulamalarını
  // karışık kullanıyor; tek biçim tanımak çoğunda işe yaramıyordu.
  const cizgi = govdeyiBol("Uygundur.\n\n________________________________\nKimden: Ali <ali@x.com>\nKonu: Teklif");
  assert.equal(cizgi.yeni, "Uygundur.");
  assert.match(cizgi.alinti ?? "", /Kimden: Ali/);

  const ozgun = govdeyiBol("Tamam.\n\n-----Original Message-----\nFrom: Ali");
  assert.equal(ozgun.yeni, "Tamam.");

  const ingilizce = govdeyiBol("Thanks.\n\nOn Fri, 9 Oct 2026 at 10:30, Ali wrote:\n> hi");
  assert.equal(ingilizce.yeni, "Thanks.");

  /* "Kimden:" tek başına ölçüt değil: aynı satır postanın kendi
     metninde de geçebiliyor. */
  const yanlisAlarm = govdeyiBol("Kimden: diye soruyorsanız biz gönderdik.\nİyi günler.");
  assert.equal(yanlisAlarm.alinti, null);
});

test("yönlendirilen posta katlanmıyor", () => {
  /* İletilen mesajda "yeni" kısım boş; alıntıyı katlasaydık ekranda
     okunacak hiçbir şey kalmazdı. */
  const { yeni, alinti } = govdeyiBol("---------- İletilen mesaj ----------\nKimden: Ali\n\nMerhaba.");
  assert.match(yeni, /İletilen mesaj/);
  assert.equal(alinti, null);
});

test("imza ayrılıyor ama uzun blok imza sayılmıyor", () => {
  const { yeni, imza } = govdeyiBol("Merhaba.\n\n-- \nAli Veli\nX Danışmanlık");
  assert.equal(yeni, "Merhaba.");
  assert.equal(imza, "Ali Veli\nX Danışmanlık");

  /* "--" bazen cümle ayıracı olarak yazılıyor; metnin yarısını
     soluklaştırmak okumayı bozardı. */
  const uzun = govdeyiBol("Merhaba.\n--\n" + Array.from({ length: 12 }, (_, i) => `satır ${i}`).join("\n"));
  assert.equal(uzun.imza, null);
  assert.match(uzun.yeni, /satır 11$/);
});

test("imza alıntının içindeyse ayrı ayıklanmıyor", () => {
  // Alıntının içindeki imza zaten katlı gidiyor.
  const { yeni, imza, alinti } = govdeyiBol("Olur.\n\n> Merhaba\n> -- \n> Akademik Merkez");
  assert.equal(yeni, "Olur.");
  assert.equal(imza, null);
  assert.match(alinti ?? "", /Akademik Merkez/);
});

test("gövdedeki adresler tıklanabilir parçalara ayrılıyor", () => {
  /* Gövde düz metin basılıyor; müşterinin yolladığı bağlantıyı açmak
     için metni elle seçip kopyalamak gerekiyordu. */
  const parcalar = metinParcalari("Teklif: https://arvo-os.com/t/abc. Sorun olursa ali@x.com yazın.");
  assert.deepEqual(parcalar.map((p) => p.tip), ["metin", "baglanti", "metin", "baglanti", "metin"]);
  assert.deepEqual(
    parcalar.filter((p) => p.tip === "baglanti").map((p) => p.adres),
    ["https://arvo-os.com/t/abc", "mailto:ali@x.com"],
  );
  // Cümle sonundaki nokta adresin dışında kalıyor: bağlantı 404 veriyordu.
  assert.equal(parcalar[2].deger, ". Sorun olursa ");
  // www ile başlayan adrese şema ekleniyor; şemasız href aynı sayfaya gider.
  assert.equal(metinParcalari("bkz www.arvo-os.com").find((p) => p.tip === "baglanti")?.adres, "https://www.arvo-os.com");
  /* Başka şema hiç eşleşmiyor: adres metinden üretiliyor, gönderenin
     verdiği bir nitelikten değil. */
  assert.deepEqual(metinParcalari("javascript:alert(1)").map((p) => p.tip), ["metin"]);
  assert.deepEqual(metinParcalari("düz metin").map((p) => p.tip), ["metin"]);
});

test("alıntı gösterilirken bir düzey > işareti düşüyor", () => {
  /* Metnin solundaki şerit zaten "bu alıntı" diyor; her satırın
     başındaki işaret okumayı zorlaştırıyordu. İç içe alıntıda kalan
     işaret duruyor: kaç tur geriye gidildiği bilgi. */
  assert.equal(alintiMetni("> Merhaba\n> > Eski soru\n>\n> İyi günler"), "Merhaba\n> Eski soru\n\nİyi günler");
  // Başlık satırı zaten işaretsiz; dokunulmuyor.
  assert.match(alintiMetni("Ali şöyle yazdı:\n> Merhaba"), /^Ali şöyle yazdı:\nMerhaba$/);
});
