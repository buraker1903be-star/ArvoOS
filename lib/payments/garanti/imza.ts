/*
  GARANTİ BBVA SANAL POS — İMZA (HASH) ÜRETİMİ.

  Saf modül: ağ yok, Supabase yok. Testi tests/unit/garanti-imza.test.ts.

  Tarif bankanın Developer Portal belgesindeki C# örneğinden BİREBİR
  alındı (29.09.2026). Ezberden yazılmadı: sıradaki tek bir kaymanın
  bedeli, her ödemenin "imza hatalı" ile düşmesi ve hatanın banka
  kaynaklıymış gibi görünmesi.

      hashedPassword = SHA1(provizyonŞifresi + "0" + terminalId)
      hashData       = SHA512(terminalId + orderId + amount +
                              currencyCode + successUrl + errorUrl +
                              type + installmentCount + storeKey +
                              hashedPassword)

  İki nokta özellikle dikkat istiyor:

  1. "0" + terminalId, PadLeft(9,'0') DEĞİL. Belgedeki C# gövdesi düz
     bir "0" ekliyor. Terminal numaraları sekiz haneli olduğu için
     ikisi bugün aynı sonucu veriyor; dokuz haneli bir terminalde
     AYRIŞIRLAR. Belgeye uyuyoruz ve beklenmedik uzunluğu sessizce
     geçmek yerine hata veriyoruz (terminalDenetle).

  2. Özet ISO-8859-9 (Latin-5) baytları üzerinden alınıyor, UTF-8
     değil. Alanların çoğu ASCII ama provizyon şifresi ve StoreKey
     bankada kullanıcı tarafından seçiliyor; içinde bir "ş" geçtiğinde
     UTF-8 iki bayt, Latin-5 tek bayt üretir ve imza tutmaz. Bu, aylarca
     "bazen çalışıyor" diye aranacak türden bir kusur.
*/

import { createHash } from "node:crypto";

/*
  ISO-8859-9, ISO-8859-1'in aynısıdır; yalnızca altı kod noktası
  farklıdır (Latin-1'deki Ð Ý Þ ð ý þ yerine Türkçe harfler).
*/
const LATIN5: Record<string, number> = {
  "Ğ": 0xd0, // Ğ
  "İ": 0xdd, // İ
  "Ş": 0xde, // Ş
  "ğ": 0xf0, // ğ
  "ı": 0xfd, // ı
  "ş": 0xfe, // ş
};

export class Iso88599Hatasi extends Error {
  constructor(karakter: string) {
    super(`ISO-8859-9 ile kodlanamayan karakter: ${JSON.stringify(karakter)} (U+${karakter.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`);
    this.name = "Iso88599Hatasi";
  }
}

/**
 * Metni ISO-8859-9 baytlarına çevirir.
 *
 * Kodlanamayan karakterde SESSİZCE "?" koymuyor, HATA veriyor: yerine
 * konan soru işareti imzayı bozar ve banka yalnızca "imza hatalı" der;
 * hangi karakterin kaybolduğunu kimse göremez.
 */
export function iso88599(metin: string): Buffer {
  const baytlar = Buffer.alloc(metin.length);
  for (let i = 0; i < metin.length; i += 1) {
    const karakter = metin[i];
    const kod = karakter.codePointAt(0)!;
    if (kod < 0x100 && !"ÐÝÞðýþ".includes(karakter)) {
      baytlar[i] = kod;
      continue;
    }
    const latin5 = LATIN5[karakter];
    if (latin5 === undefined) throw new Iso88599Hatasi(karakter);
    baytlar[i] = latin5;
  }
  return baytlar;
}

const ozet = (algoritma: "sha1" | "sha512", metin: string) =>
  createHash(algoritma).update(iso88599(metin)).digest("hex").toUpperCase();

/** Belgedeki Sha1(): ISO-8859-9 baytları, büyük harf hex. */
export const sha1 = (metin: string) => ozet("sha1", metin);
/** Belgedeki Sha512(). */
export const sha512 = (metin: string) => ozet("sha512", metin);

/*
  Terminal numarası bekleneni tutuyor mu. Sekiz hane bugünkü tek biçim
  ve "0" ekleme kuralı ona göre yazılmış; başka bir uzunluk gelirse
  imza sessizce yanlış üretilmesin.
*/
function terminalDenetle(terminalId: string): void {
  if (!/^[0-9]{8}$/.test(terminalId)) {
    throw new Error(
      `Terminal numarası sekiz haneli olmalı (gelen: ${JSON.stringify(terminalId)}). `
      + "Banka belgesindeki hash tarifi sekiz hane varsayıyor; farklı bir uzunluk imzayı sessizce bozar.",
    );
  }
}

/**
 * Birinci aşama: provizyon şifresinin açık dolaşmaması için.
 *
 * Belgedeki gövde: Sha1(provisionPassword + "0" + terminalId).
 */
export function hashedPassword(provizyonSifresi: string, terminalId: string): string {
  terminalDenetle(terminalId);
  if (!provizyonSifresi) throw new Error("Provizyon şifresi boş olamaz.");
  return sha1(`${provizyonSifresi}0${terminalId}`);
}

export interface ImzaGirdisi {
  terminalId: string;
  /** Benzersiz işlem numarası. */
  orderId: string;
  /** KURUŞ cinsinden tamsayı: 100,00 TL → 10000. Belgede ulong. */
  amount: number;
  /** ISO 4217 sayısal kod; TRY için 949. Belgede int. */
  currencyCode: number;
  successUrl: string;
  errorUrl: string;
  /**
   * İşlem tipi: "sales", "preauth", "postauth", "void", "refund".
   *
   * Formda bu alanın adı `txntype` — imzadaki adıyla (type) aynı değil.
   * İkisini karıştırmak, formu doğru gönderip imzayı yanlış üretmek
   * demek olurdu.
   */
  type: string;
  /**
   * Taksit sayısı. Belgedeki imza int alıyor, yani tek çekimde metne
   * "0" olarak giriyor. Forma gönderilen değerle İMZADAKİ değerin aynı
   * olması şart; ikisi ayrışırsa banka imzayı reddeder.
   */
  installmentCount: number;
  storeKey: string;
  provizyonSifresi: string;
}

/** İkinci aşama: forma konan hashdata alanı. */
export function hashData(girdi: ImzaGirdisi): string {
  terminalDenetle(girdi.terminalId);
  if (!girdi.orderId) throw new Error("orderId boş olamaz.");
  if (!Number.isInteger(girdi.amount) || girdi.amount <= 0) {
    throw new Error(`Tutar kuruş cinsinden pozitif tamsayı olmalı (gelen: ${girdi.amount}).`);
  }
  if (!Number.isInteger(girdi.currencyCode)) throw new Error("Para birimi kodu tamsayı olmalı (TRY: 949).");
  if (!Number.isInteger(girdi.installmentCount) || girdi.installmentCount < 0) {
    throw new Error(`Taksit sayısı negatif olmayan tamsayı olmalı (gelen: ${girdi.installmentCount}).`);
  }
  if (!girdi.storeKey) throw new Error("StoreKey boş olamaz.");

  const sifre = hashedPassword(girdi.provizyonSifresi, girdi.terminalId);
  /* Sıra belgedeki C# gövdesiyle birebir; değiştirilirse imza tutmaz. */
  return sha512(
    girdi.terminalId
    + girdi.orderId
    + String(girdi.amount)
    + String(girdi.currencyCode)
    + girdi.successUrl
    + girdi.errorUrl
    + girdi.type
    + String(girdi.installmentCount)
    + girdi.storeKey
    + sifre,
  );
}

/** TRY'nin ISO 4217 sayısal kodu; belgedeki örneklerde currencycode. */
export const TRY_KODU = 949;
