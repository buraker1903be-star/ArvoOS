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

  1. Terminal numarası DOKUZ HANEYE tamamlanıyor. Bankanın belgesindeki
     C# düz bir "0" ekliyor (pw + "0" + terminalId); GOSAS.VirtualPos
     ise IsRequireZero(terminalId, 9) ile dokuz haneye dolduruyor.
     Sekiz haneli terminalde İKİSİ AYNI SONUCU VERİYOR — bizim
     terminallerimiz sekiz haneli, yani bugün fark yok. Yedi haneli bir
     terminalde ayrışırlar ve dokuza tamamlama daha savunulabilir
     okuma: alanın dokuz karakter olması amaçlanmış. İki kaynak da
     sekiz hanede aynı dediği için riski olmayan tarafı seçtik.

  2. Özet ISO-8859-9 (Latin-5) baytları üzerinden alınıyor, UTF-8
     değil. Alanların çoğu ASCII ama provizyon şifresi ve StoreKey
     bankada kullanıcı tarafından seçiliyor; içinde bir "ş" geçtiğinde
     UTF-8 iki bayt, Latin-5 tek bayt üretir ve imza tutmaz. Bu, aylarca
     "bazen çalışıyor" diye aranacak türden bir kusur.
*/

import { createHash } from "node:crypto";

/*
  İŞLEM TİPLERİ. Değerler GOSAS.VirtualPos'un GVPOSTransactionTypes
  tanımından; bankanın beklediği dizgelerin birebir kendisi.

  Serbest metin DEĞİL, çünkü tip hem forma hem imzaya giriyor: "sale"
  yazan biri geçerli GÖRÜNEN bir imza üretir, banka reddeder ve hata
  "imza hatalı" olarak döner — bir harfin yüzünden günler gider.
  Derleyici burada yakalasın.

  Listede yalnızca bizim kullanacaklarımız var; bankanın tam listesi
  çok daha uzun (cepbank, gsmunitsales, utilitypayment …) ve
  kullanmadığımız bir tipi buraya yazmak, denenmemiş bir yolu açık
  bırakmak olurdu.
*/
export const ISLEM_TIPLERI = [
  "sales",
  "preauth",
  "postauth",
  "void",
  "partialvoid",
  "refund",
  /* Bankanın her işlemden sonra önerdiği teyit sorgusu. */
  "orderinq",
  "orderhistoryinq",
  /* Tekrarlayan ödemenin bekleyen çekimlerini iptal eder. */
  "recurringvoid",
] as const;

export type IslemTipi = (typeof ISLEM_TIPLERI)[number];

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
  Terminal numarası bekleneni tutuyor mu. Dokuzdan uzun bir numara,
  doldurma kuralını anlamsız kılar ve imzayı sessizce bozardı.
*/
function terminalDenetle(terminalId: string): void {
  if (!/^[0-9]{1,9}$/.test(terminalId)) {
    throw new Error(
      `Terminal numarası en fazla dokuz haneli rakam olmalı (gelen: ${JSON.stringify(terminalId)}). `
      + "Hash tarifi numarayı dokuz haneye tamamlıyor; daha uzun bir değer imzayı sessizce bozar.",
    );
  }
}

/** Belgedeki "0" ekleme ile GOSAS'ın IsRequireZero(id, 9)'unun ortak hâli. */
export const dokuzHane = (terminalId: string) => terminalId.padStart(9, "0");

/**
 * Birinci aşama: provizyon şifresinin açık dolaşmaması için.
 *
 * Belgedeki gövde Sha1(provisionPassword + "0" + terminalId),
 * GOSAS.VirtualPos'unki Sha1(userPassword + IsRequireZero(terminalId, 9));
 * sekiz haneli terminalde ikisi aynı.
 */
export function hashedPassword(provizyonSifresi: string, terminalId: string): string {
  terminalDenetle(terminalId);
  if (!provizyonSifresi) throw new Error("Provizyon şifresi boş olamaz.");
  return sha1(`${provizyonSifresi}${dokuzHane(terminalId)}`);
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
   * İşlem tipi. Formda bu alanın adı `txntype` — imzadaki adıyla
   * (type) aynı değil. İkisini karıştırmak, formu doğru gönderip
   * imzayı yanlış üretmek demek olurdu.
   */
  type: IslemTipi;
  /**
   * Taksit sayısının METİN hâli. Sayı değil metin alıyoruz çünkü tek
   * çekimde "0" mı yoksa boş dizge mi gittiği belgeler arasında
   * çelişiyor (bkz. form.ts). Forma yazılan metnin AYNISI imzaya
   * girmeli; ayrışırlarsa banka imzayı reddeder ve sebebi görünmez.
   */
  installmentMetni: string;
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
  if (!/^[0-9]*$/.test(girdi.installmentMetni)) {
    throw new Error(`Taksit alanı yalnızca rakam ya da boş olmalı (gelen: ${JSON.stringify(girdi.installmentMetni)}).`);
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
    + girdi.installmentMetni
    + girdi.storeKey
    + sifre,
  );
}

/** TRY'nin ISO 4217 sayısal kodu; belgedeki örneklerde currencycode. */
export const TRY_KODU = 949;
