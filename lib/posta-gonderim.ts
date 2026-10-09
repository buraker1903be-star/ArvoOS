/*
  ORTAK POSTA KUTUSU — yanıt mesajının kurulması (saf).

  Gmail'in gönderme ucu hazır bir RFC 2822 mesajı istiyor; burası onu
  metin olarak kuruyor. Ağ yok, Supabase yok — birim testten import
  edilebilsin diye (tests/unit/posta-gonderim.test.ts).
*/

/** Gmail'in `raw` alanı base64url bekliyor ("+/" yerine "-_", dolgu yok). */
export function base64UrlKodla(metin: string): string {
  return Buffer.from(metin, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Başlıklarda Türkçe harf.
 *
 * RFC 2822 başlıkları yalnızca ASCII taşıyor; "Teklif Güncellemesi"
 * doğrudan yazıldığında alıcıda "Teklif GÃ¼ncellemesi" görünüyor ve bu
 * kurumun müşterisine giden ilk izlenim oluyor. RFC 2047 kodlaması
 * (=?UTF-8?B?…?=) bunu çözüyor; ASCII dışı karakter yoksa gereksiz
 * kodlama yapılmıyor, okunabilir kalsın.
 */
/*
  BAŞLIK SATIRINA GİREN HER DEĞER ÖNCE DENETİM KARAKTERLERİNDEN ARINIR.

  Başlıklar "\r\n" ile birleşiyor; değerin içinde bir "\r\n" kalırsa o
  noktada YENİ BİR BAŞLIK başlar. 08.10.2026'da ölçüldü: konusu
  "Teklif\r\nBcc: saldirgan@kotu.com" olan bir posta, gerçek bir Bcc
  başlığıyla gidiyordu — yani ortak kutudan yazabilen biri, gönderdiği
  her postanın gizli bir kopyasını dışarı çıkarabiliyordu.

  Kaçan şey şuydu: baslikKodla girdiyi SALT ASCII ise olduğu gibi
  döndürüyordu ve CR ile LF de ASCII. Türkçe bir konu base64'e
  çevrildiği için zararsızdı; İNGİLİZCE bir konu doğrudan geçiyordu.
  Yani açık, yalnızca ASCII konularda vardı ve gözden kaçması kolaydı.

  Üst katmandaki trim() yetmiyor: o yalnızca baştaki ve sondaki boşluğu
  alıyor, ortadaki satır sonunu değil. Temizlik burada, başlığın
  KURULDUĞU yerde: alanın kaynağı (form, Gmail'den okunan gönderen adı,
  ileride başka bir yer) ne olursa olsun aynı kapıdan geçsin.
*/
export function baslikDegeri(deger: string): string {
  return (deger ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function baslikKodla(deger: string): string {
  const sade = baslikDegeri(deger);
  if (/^[\x20-\x7E]*$/.test(sade)) return sade;
  return `=?UTF-8?B?${Buffer.from(sade, "utf8").toString("base64")}?=`;
}

/**
 * Yanıtın konusu. Gmail ve çoğu istemci "Re:" ön ekini zincirin tamamında
 * tek sefer taşıyor; her yanıtta yeniden eklemek "Re: Re: Re: Teklif"
 * üretiyordu. Mevcut ön ek (Re, RE, Yan, YNT) tanınıp korunuyor.
 */
export function yanitKonusu(konu: string): string {
  const sade = (konu ?? "").trim();
  if (!sade) return "Re:";
  return /^(re|yan|ynt)\s*:/i.test(sade) ? sade : `Re: ${sade}`;
}

/**
 * Zincirleme için başlıklar.
 *
 * In-Reply-To ve References olmadan yanıt alıcının kutusunda AYRI bir
 * konuşma olarak açılıyor; Gmail'in threadId'si yalnızca bizim
 * tarafımızı birleştiriyor, karşı tarafı değil.
 */
export function zincirBasliklari(girdi: { sonMesajId: string | null; referanslar: string | null }) {
  const basliklar: string[] = [];
  if (girdi.sonMesajId) {
    basliklar.push(`In-Reply-To: ${girdi.sonMesajId}`);
    const birlesik = [girdi.referanslar, girdi.sonMesajId].filter(Boolean).join(" ").trim();
    basliklar.push(`References: ${birlesik}`);
  }
  return basliklar;
}

/*
  ALICI LİSTESİ.

  Birden çok adres virgül ya da noktalı virgülle yazılabiliyor; kurumlar
  listeyi çoğu zaman başka bir yerden kopyalayıp yapıştırıyor ve o metin
  "Ad Soyad <adres>" biçiminde geliyor. Adres dışındaki her şey atılıyor:
  başlığa olduğu gibi yazmak, alıcı adında virgül olan bir kopyada
  mesajı yanlış kişiye gönderirdi.

  Geçersiz bir adres SESSİZCE ATILMIYOR, hata olarak dönüyor: yazdığı
  adrese gönderdiğini sanan biri, gitmediğini günler sonra öğrenir.
*/
const ADRES_DESENI = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export function aliciListesi(ham: string): { adresler: string[] } | { hata: string } {
  const parcalar = (ham ?? "").split(/[,;]/).map((parca) => parca.trim()).filter(Boolean);
  if (!parcalar.length) return { hata: "En az bir alıcı adresi yazın." };
  if (parcalar.length > 20) return { hata: "Tek seferde en fazla 20 alıcıya gönderebilirsiniz." };

  const adresler: string[] = [];
  for (const parca of parcalar) {
    const koseli = parca.match(/<([^>]+)>\s*$/);
    const adres = (koseli ? koseli[1] : parca).trim().toLowerCase();
    if (!ADRES_DESENI.test(adres)) return { hata: `Geçerli bir e-posta adresi değil: ${parca}` };
    if (!adresler.includes(adres)) adresler.push(adres);
  }
  return { adresler };
}

export type YanitGirdisi = {
  gonderenAd: string;
  gonderenAdres: string;
  alici: string;
  konu: string;
  govde: string;
  sonMesajId?: string | null;
  referanslar?: string | null;
};

/**
 * Gönderilecek ham mesaj. Gövde de base64'e çevriliyor: 998 karakterlik
 * satır sınırı ve Türkçe karakterler yüzünden düz metin olarak gönderilen
 * uzun paragraflar bazı sunucularda bozuluyordu.
 */
/** Gönderilecek ek: adı, türü ve içeriği. */
export type EkDosya = { ad: string; tur: string; veri: Buffer };

const b64satirli = (veri: Buffer) => veri.toString("base64").replace(/(.{76})/g, "$1\r\n");

/*
  Ekli mesaj çok parçalı (multipart/mixed): metin bir parça, her dosya
  ayrı bir parça. Parçaları ayıran SINIR dışarıdan veriliyor — rastgele
  üretmek bu dosyayı saf olmaktan çıkarır ve testten import edilemez
  hâle getirirdi. Çağıran her mesaj için yeni bir sınır üretiyor: sınır
  içerikte geçerse mesaj alıcıda parçalanmış görünür.

  Dosya adı iki kez yazılıyor: sade `filename` eski istemciler için,
  `filename*` (RFC 5987) Türkçe harfleri taşımak için. Yalnızca sadeyi
  yazmak "Sözleşme.pdf" dosyasını "Sözlesme.pdf" ya da bozuk bir adla
  indirtiyordu.
*/
function mesajiKur(girdi: {
  gonderenAd: string;
  gonderenAdres: string;
  alici: string;
  konu: string;
  govde: string;
  zincir?: string[];
  ekler?: readonly EkDosya[];
  sinir?: string;
  cc?: readonly string[];
}): string {
  const ekler = girdi.ekler ?? [];
  /* Adres alanları da aynı kapıdan: alıcı listesi doğrulanmış geliyor
     ama gönderen adresi ve yanıt alıcısı Gmail'den okunan veriden
     türüyor — oradan gelen bir satır sonu da başlık açardı. */
  const ustBasliklar = [
    `From: ${baslikKodla(girdi.gonderenAd)} <${baslikDegeri(girdi.gonderenAdres)}>`,
    `To: ${baslikDegeri(girdi.alici)}`,
    ...(girdi.cc?.length ? [`Cc: ${baslikDegeri(girdi.cc.join(", "))}`] : []),
    `Subject: ${baslikKodla(girdi.konu)}`,
    ...(girdi.zincir ?? []),
    "MIME-Version: 1.0",
  ];

  if (!ekler.length) {
    return [
      ...ustBasliklar,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      b64satirli(Buffer.from(girdi.govde, "utf8")),
    ].join("\r\n");
  }

  const sinir = girdi.sinir || "arvo-sinir";
  const parcalar = [
    `--${sinir}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    b64satirli(Buffer.from(girdi.govde, "utf8")),
  ];
  for (const ek of ekler) {
    const ad = guvenliEkAdi(ek.ad);
    parcalar.push(
      `--${sinir}`,
      `Content-Type: ${ek.tur}; name="${ad}"`,
      /* filename* ayrı satırda (başlık katlaması): uzun Türkçe bir ad
         kodlanınca tek satırı 998 karakter sınırının üstüne taşıyordu. */
      `Content-Disposition: attachment; filename="${ad}";`,
      ` filename*=UTF-8''${ekAdiParametresi(ek.ad)}`,
      "Content-Transfer-Encoding: base64",
      "",
      b64satirli(ek.veri),
    );
  }
  parcalar.push(`--${sinir}--`, "");

  return [
    ...ustBasliklar,
    `Content-Type: multipart/mixed; boundary="${sinir}"`,
    "",
    ...parcalar,
  ].join("\r\n");
}

/*
  Ek adı MIME başlığına girmeden temizleniyor. Ad kullanıcının seçtiği
  dosyadan geliyor: içindeki tırnak ya da satır sonu başlığı bölüp
  parçanın sınırını kaydırıyor ve mesaj alıcıda bozuk görünüyor.
*/
export function guvenliEkAdi(ham: string): string {
  const sade = (ham ?? "").replace(/[\r\n"\\]/g, " ").replace(/\s+/g, " ").trim();
  return sade.slice(0, 180) || "ek";
}

/*
  RFC 5987 kodlu dosya adı (filename*). encodeURIComponent tek başına
  yetmiyor: ' ( ) * harflerini kodlamadan bırakıyor ve kesme işareti
  içeren bir ad ("Ali'nin sözleşmesi.pdf") bazı istemcilerde adı bozuyordu.
  Eskiden ayrıca kırpılmamış ad kullanılıyordu; kodlanmış hâli 900
  karakteri geçmeyecek kadar kısaltılıyor.
*/
export function ekAdiParametresi(ham: string): string {
  const kodla = (metin: string) =>
    encodeURIComponent(metin).replace(/['()*]/g, (harf) => "%" + harf.charCodeAt(0).toString(16).toUpperCase());
  let ad = guvenliEkAdi(ham);
  while (kodla(ad).length > 900) ad = Array.from(ad).slice(0, -1).join("");
  return kodla(ad);
}

export function yanitMesajiKur(girdi: YanitGirdisi & { ekler?: readonly EkDosya[]; sinir?: string; cc?: readonly string[] }): string {
  return mesajiKur({
    ...girdi,
    konu: yanitKonusu(girdi.konu),
    zincir: zincirBasliklari({ sonMesajId: girdi.sonMesajId ?? null, referanslar: girdi.referanslar ?? null }),
  });
}

/**
 * Sıfırdan yazılan posta. Yanıttan iki farkı var ve ikisi de bilinçli:
 * konuya "Re:" eklenmiyor ve zincir başlığı yazılmıyor — var olmayan bir
 * mesaja atıf, alıcının istemcisinde konuşmayı boş bir dala asıyor.
 */
export function yeniMesajiKur(girdi: {
  gonderenAd: string;
  gonderenAdres: string;
  alicilar: readonly string[];
  konu: string;
  govde: string;
  ekler?: readonly EkDosya[];
  sinir?: string;
  cc?: readonly string[];
}): string {
  return mesajiKur({
    gonderenAd: girdi.gonderenAd,
    gonderenAdres: girdi.gonderenAdres,
    alici: girdi.alicilar.join(", "),
    konu: girdi.konu,
    govde: girdi.govde,
    ekler: girdi.ekler,
    sinir: girdi.sinir,
    cc: girdi.cc,
  });
}

/*
  TOPLAM EK BOYUTU.

  Gmail'in basit gönderim ucu 5 MB'lık bir istek kabul ediyor ve mesaj
  base64'e çevrilince ~%37 büyüyor. 3 MB ham ek, base64'ten sonra ~4,1
  MB ediyor ve metinle birlikte sınırın altında kalıyor. Daha büyüğü
  Google'ın parçalı yükleme ucunu gerektiriyor; o gelene kadar sınırı
  SÖYLEYEREK kesiyoruz — sessizce düşen bir gönderim, kullanıcının
  gittiğini sandığı bir teklif demek.
*/
export const EK_SINIRI_BAYT = 3 * 1024 * 1024;

export function ekBoyutuEngeli(ekler: readonly { ad: string; boyut: number }[]): string | null {
  const toplam = ekler.reduce((birikim, ek) => birikim + ek.boyut, 0);
  if (toplam <= EK_SINIRI_BAYT) return null;
  const mb = (toplam / (1024 * 1024)).toFixed(1).replace(".", ",");
  return `Ekler toplam ${mb} MB; tek postada en fazla 3 MB gönderilebiliyor. Büyük dosyaları bağlantıyla paylaşın.`;
}

/** Yanıt kimin adresine gidecek: zincirdeki son GELEN mesajın göndereni. */
export function yanitAlicisi(
  mesajlar: readonly { gonderenAdres: string | null; yon: string; tarih: Date | null }[],
): string | null {
  const gelenler = mesajlar
    .filter((mesaj) => mesaj.yon === "gelen" && mesaj.gonderenAdres)
    .sort((a, b) => (a.tarih?.getTime() ?? 0) - (b.tarih?.getTime() ?? 0));
  /* Son GİDEN mesaja bakmak, kendi adresimize yanıt yazdırırdı: ortak
     kutudan gönderilen son mesaj çoğu zaman bizim cevabımız. */
  return gelenler[gelenler.length - 1]?.gonderenAdres ?? null;
}

/*
  KURUM İMZASI.

  Gönderilen metnin sonuna, RFC 3676'nın imza ayıracıyla ("-- " ve satır
  sonu) ekleniyor. Ayıraç önemli: posta istemcileri imzayı bununla
  tanıyıp yanıtta alıntıdan düşürüyor, yoksa her yanıtta bir kopya daha
  birikip yazışmanın yarısı imza oluyor.

  İmza METNE DEĞİL GÖNDERİME ekleniyor: personelin yazdığı kutuda
  görünmemesi bilinçli — iki kez eklenmesinin (bir kez elle, bir kez
  sunucuda) en kolay yolu onu kutuya önceden yazmaktı.
*/
export function imzaliGovde(govde: string, imza: string | null | undefined): string {
  const sadeImza = (imza ?? "").trim();
  if (!sadeImza) return govde;
  // Zaten eklenmişse (taslaktan gelen metin olabilir) ikinci kez eklenmiyor.
  if (govde.includes(`\n-- \n${sadeImza}`)) return govde;
  return `${govde.replace(/\s+$/, "")}\n\n-- \n${sadeImza}`;
}

/*
  ALINTILI YANIT.

  Yanıt tek başına gidince müşteri neye cevap verildiğini çoğu zaman
  anlamıyor: kendi mesajını başka bir kutudan, günler sonra, başka bir
  konuyla karışık okuyor. Posta istemcilerinin kuralı yüz yıllık:
  yanıtın altına "Şu tarihte X şöyle yazdı:" ve her satırı "> " ile
  başlayan özgün metin.

  İmzadan ÖNCE değil SONRA eklenmiyor — sıra: yanıt, imza, alıntı. İmza
  alıntının içinde kalırsa her turda bir kopya daha birikiyor.

  Alıntı uzunluğu sınırlı: yirmi turluk bir yazışmanın tamamını her
  mesaja eklemek, hem okunamaz hem Gmail'in "kırpıldı" uyarısını
  getiriyor.
*/
const ALINTI_SINIRI = 4000;

export function alintiliGovde(govde: string, alinti: {
  gonderenAd: string | null;
  gonderenAdres: string;
  tarih: Date | null;
  metin: string;
} | null): string {
  const metin = (alinti?.metin ?? "").trim();
  if (!alinti || !metin) return govde;

  const kim = alinti.gonderenAd ? `${alinti.gonderenAd} <${alinti.gonderenAdres}>` : alinti.gonderenAdres;
  const ne_zaman = alinti.tarih
    ? alinti.tarih.toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : null;
  const baslik = ne_zaman ? `${ne_zaman} tarihinde ${kim} şöyle yazdı:` : `${kim} şöyle yazdı:`;

  const kisaltilmis = metin.length > ALINTI_SINIRI ? `${metin.slice(0, ALINTI_SINIRI)}\n…` : metin;
  const alintiliMetin = kisaltilmis.split("\n").map((satir) => `> ${satir}`.trimEnd()).join("\n");
  return `${govde.replace(/\s+$/, "")}\n\n${baslik}\n${alintiliMetin}`;
}

/*
  TÜMÜNÜ YANITLA adayları.

  Özgün mesajın alıcıları arasından ORTAK KUTUNUN KENDİSİ ve asıl
  yanıtlanan kişi çıkarılıyor: kutunun kendi adresini Cc'ye koymak
  gelen kutusuna kendi yanıtımızın kopyasını düşürür, asıl alıcıyı
  koymak ise ona iki kopya gönderir.
*/
export function ccAdaylari(aliciBasligi: string | null, kutuAdresi: string, asilAlici: string): string[] {
  const disarida = new Set([kutuAdresi.toLowerCase(), asilAlici.toLowerCase()]);
  return basliktakiAdresler(aliciBasligi ?? "").filter((adres) => !disarida.has(adres)).slice(0, 20);
}

/*
  Gelen bir başlıktaki adresler (To/Cc). aliciListesi'nden farkı: o
  KULLANICININ yazdığını denetliyor ve tek bir bozuk parçada hata veriyor;
  bu, karşı tarafın gönderdiği başlığı okuyor ve hata vermeden ayıklıyor.

  Virgüle bölmüyor: "Doe, John" <j@x.com> gibi tırnaklı adlar virgül
  içeriyor. Eskiden aliciListesi'yle okunuyordu; böyle bir ad bütün aday
  listesini düşürüyordu.
*/
export function basliktakiAdresler(baslik: string): string[] {
  const adresler: string[] = [];
  for (const eslesme of baslik.replace(/"[^"]*"/g, " ").matchAll(/[^\s<>,;:()"]+@[^\s<>,;:()"]+/g)) {
    const adres = eslesme[0].toLowerCase();
    if (ADRES_DESENI.test(adres) && !adresler.includes(adres)) adresler.push(adres);
  }
  return adresler;
}
