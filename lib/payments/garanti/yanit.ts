/*
  GARANTİ BBVA 3D — BANKA YANITININ ALANLARI.

  Saf modül; testi tests/unit/garanti-yanit.test.ts.

  Banka, ödeme sonucunu successurl (ya da errorurl) adresine POST
  ediyor. Aşağıdaki alan listesi bankanın belgesindeki yanıt
  tablosundan BİREBİR alındı (29.09.2026); açıklamalar da oradan.

  BU MODÜL HENÜZ DOĞRULAMA YAPMIYOR ve bilerek yapmıyor. Yanıtın
  gerçekten bankadan geldiği, hash/hashparams/hashparamsval üçlüsüyle
  kanıtlanıyor; o hesabın tarifi (hangi özet, mağaza anahtarı nereye
  ekleniyor) elimizde yok. Tarifi ezberden yazmak, en kötü kusuru
  üretirdi: adresi bilen herkesin sahte bir POST ile bedava sipariş
  oluşturabilmesi. O yüzden burada yalnızca ALANLARIN sözleşmesi var;
  doğrulayıcı ayrı bir işte ve o gelene kadar hiçbir yol bu yanıtı
  "ödendi" saymamalı.
*/

/** Bankanın POST ettiği alanlar ve belgedeki açıklamaları. */
export const YANIT_ALANLARI = {
  mdstatus: "3D cevabı numeric olarak verildiği alan",
  mderrormessage: "3D cevabı işlem durumunun metin olarak açıklaması",
  errmsg: "3D cevabı hatalı işlem durumlarında hata mesajı",
  clientid: "Üye işyerine ait terminal id bilgisi",
  oid: "İşlem yapılırken gönderilen sipariş numarası",
  response: "İşlemin başarılı olup olmadığını gösteren alan",
  procreturncode: "Provizyon cevabı",
  successurl: "Başarılı işlem durumunda dönecek url bilgisi",
  txninstallmentcount: "İşlem yapılırken gönderilen taksit sayısı",
  refreshtime: "İşlem yapılırken gönderilen yenileme süresi",
  orderid: "İşlem yapılırken gönderilen sipariş numarası",
  cardholdername: "İşlem yapılırken gönderilen müşteri adı",
  txntype: "İşlem yapılırken belirtilen işlem tipi",
  terminalmerchantid: "İşlem yapılırken üye işyeri numarası",
  txnamount: "İşlem yapılırken gönderilen toplam tutar bilgisi",
  txntimestamp: "İşlem zamanı",
  terminaluserid: "Üye işyeri kullanıcı adı",
  mode: "İşlem yapılan ortam bilgisi",
  txncurrencycode: "İşlem yapılırken belirtilen para birimi",
  secure3dhash: "İşlem yapılırken hesaplanan hash bilgisi",
  apiversion: "İşlem yapılırken gönderilen API versiyon bilgisi",
  companyname: "Üye işyeri adı",
  errorurl: "İşlem yapılırken gönderilen hatalı işlemlerin dönüleceği url bilgisi",
  secure3dsecuritylevel: "İşlem yapılırken belirtilen 3d model bilgisi",
  customeremailaddress: "İşlem yapılırken gönderilen müşteri eposta bilgisi",
  customeripaddress: "İşlem yapılırken gönderilen müşteri IP adres bilgisi",
  terminalid: "Terminal numarası",
  terminalprovuserid: "İşlem yapılırken gönderilen provizyon kullanıcı bilgisi",
  lang: "İşlem yapılırken gönderilen servis cevap dil tercih bilgisi",
  hash: "İşlem sonrasında oluşan hash verisi",
  hashparams: "İşlem sonrasında kullanılacak hash formül bilgisi",
  hashparamsval: "İşlem sonrasında kullanılacak hash detayları",
} as const;

export type YanitAlani = keyof typeof YANIT_ALANLARI;

export const YANIT_ALAN_ADLARI = Object.keys(YANIT_ALANLARI) as YanitAlani[];

/*
  Doğrulama için gereken üçlü. Biri bile eksikse yanıt doğrulanamaz ve
  doğrulanamayan yanıt "ödendi" sayılamaz — eksikliği sessizce geçmek,
  doğrulamayı hiç yapmamakla aynı kapıya çıkar.
*/
export const DOGRULAMA_ALANLARI: YanitAlani[] = ["hash", "hashparams", "hashparamsval"];

export type GarantiYaniti = Partial<Record<YanitAlani, string>> & {
  /** Bankanın gönderdiği ama belgede listelenmeyen alanlar. */
  ekstra: Record<string, string>;
};

/**
 * Gelen POST gövdesini alanlara ayırır.
 *
 * Tanınmayan alanlar ATILMIYOR, `ekstra`ya konuyor: banka bir alan
 * eklediğinde sessizce kaybolmasın — hash formülü (hashparams) o alanı
 * sayıyor olabilir ve eksik bir alan doğrulamayı sebebi görünmeden
 * düşürür.
 */
export function yanitiAyristir(govde: Record<string, unknown> | URLSearchParams): GarantiYaniti {
  const giris = govde instanceof URLSearchParams
    ? [...govde.entries()]
    : Object.entries(govde);
  const yanit: GarantiYaniti = { ekstra: {} };
  for (const [anahtar, deger] of giris) {
    const metin = typeof deger === "string" ? deger : String(deger ?? "");
    if ((YANIT_ALAN_ADLARI as string[]).includes(anahtar)) {
      (yanit as Record<string, unknown>)[anahtar] = metin;
    } else {
      yanit.ekstra[anahtar] = metin;
    }
  }
  return yanit;
}

/** Doğrulama üçlüsünden eksik olanlar; boş dizi "hepsi var" demek. */
export function eksikDogrulamaAlanlari(yanit: GarantiYaniti): YanitAlani[] {
  return DOGRULAMA_ALANLARI.filter((alan) => !(yanit[alan] ?? "").trim());
}

/**
 * hashparams bir FORMÜL: hangi alanların hangi sırayla birleştirileceği.
 * Belgedeki açıklaması "işlem sonrasında kullanılacak hash formül
 * bilgisi". Ayraç olarak iki nokta kullanılıyor.
 *
 * Formülün kendisi bankadan geliyor, yani DIŞ VERİ: tanınmayan bir alan
 * adı içerebilir ve o alanı boş kabul etmek imzayı sessizce tutturmaya
 * çalışmak olurdu. Çağıran, dönen adların hepsinin yanıtta bulunduğunu
 * doğrulamak zorunda.
 */
export const formuluCoz = (hashparams: string): string[] =>
  hashparams.split(":").map((ad) => ad.trim()).filter((ad) => ad.length > 0);

/**
 * Formüldeki alanların değerlerini yanıttan toplayıp birleştirir.
 *
 * Bankanın gönderdiği hashparamsval ile KARŞILAŞTIRMAK için: ikisi
 * ayrışıyorsa yanıt yolda değişmiş ya da formül tanımadığımız bir alana
 * işaret ediyor demektir. Eksik alan varsa null dönüyor; "boş geç"
 * demek, doğrulamayı kendi elimizle geçersiz kılmak olurdu.
 */
export function formuldenDeger(yanit: GarantiYaniti, hashparams: string): string | null {
  const adlar = formuluCoz(hashparams);
  if (adlar.length === 0) return null;
  const parcalar: string[] = [];
  for (const ad of adlar) {
    const deger = (yanit as Record<string, unknown>)[ad] ?? yanit.ekstra[ad];
    if (typeof deger !== "string") return null;
    parcalar.push(deger);
  }
  return parcalar.join("");
}
