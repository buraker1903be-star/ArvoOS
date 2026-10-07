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
export function baslikKodla(deger: string): string {
  if (/^[\x00-\x7F]*$/.test(deger)) return deger;
  return `=?UTF-8?B?${Buffer.from(deger, "utf8").toString("base64")}?=`;
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
function mesajiKur(girdi: {
  gonderenAd: string;
  gonderenAdres: string;
  alici: string;
  konu: string;
  govde: string;
  zincir?: string[];
}): string {
  const basliklar = [
    `From: ${baslikKodla(girdi.gonderenAd)} <${girdi.gonderenAdres}>`,
    `To: ${girdi.alici}`,
    `Subject: ${baslikKodla(girdi.konu)}`,
    ...(girdi.zincir ?? []),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const govde = Buffer.from(girdi.govde, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${basliklar.join("\r\n")}\r\n\r\n${govde}`;
}

export function yanitMesajiKur(girdi: YanitGirdisi): string {
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
}): string {
  return mesajiKur({
    gonderenAd: girdi.gonderenAd,
    gonderenAdres: girdi.gonderenAdres,
    alici: girdi.alicilar.join(", "),
    konu: girdi.konu,
    govde: girdi.govde,
  });
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
