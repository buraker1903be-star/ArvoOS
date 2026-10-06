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
export function yanitMesajiKur(girdi: YanitGirdisi): string {
  const basliklar = [
    `From: ${baslikKodla(girdi.gonderenAd)} <${girdi.gonderenAdres}>`,
    `To: ${girdi.alici}`,
    `Subject: ${baslikKodla(yanitKonusu(girdi.konu))}`,
    ...zincirBasliklari({ sonMesajId: girdi.sonMesajId ?? null, referanslar: girdi.referanslar ?? null }),
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const govde = Buffer.from(girdi.govde, "utf8").toString("base64").replace(/(.{76})/g, "$1\r\n");
  return `${basliklar.join("\r\n")}\r\n\r\n${govde}`;
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
