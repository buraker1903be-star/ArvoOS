/*
  GARANTİ BBVA 3D — BANKA YANITININ DOĞRULANMASI.

  Saf modül; testi tests/unit/garanti-dogrula.test.ts.

  Banka ödeme sonucunu successurl'e POST ediyor. Bu istek DIŞ VERİ:
  adresi bilen herkes benzerini gönderebilir. Doğrulamadan kabul etmek,
  bedava sipariş dağıtmak demek.

  Tarif bankanın belgesindeki örnek koddan (29.09.2026):

    1. procreturncode "00" mı? Banka açıkça "dönüş sadece 00 için
       kontrol edilmelidir, diğer durumlarda hesaplama yapılamaz"
       diyor. 00 değilse ödeme YOK; doğrulamaya da gerek yok.
    2. hashparams boş olmamalı.
    3. hashparams'taki adlar sırayla gezilip DEĞERLERİ GELEN POST'TAN
       okunur, birleştirilir.
    4. Sonuna mağaza anahtarı (3D Key) eklenir.
    5. ISO-8859-9 baytları üzerinden SHA512, büyük harf hex.
    6. Gelen hash ile aynıysa mesaj bankadandır.

  HASHPARAMSVAL KULLANILMIYOR — banka bunu ayrıca uyarıyor:
  "hashparams değeri dönen değerlerden hesaplanmalı, hashparamsval
  kullanılmamalıdır." Sebebi açık: hashparamsval de saldırganın
  gönderdiği bir alan. Ona güvenmek, kilidin anahtarını kapının
  üstünde bırakmak olurdu.
*/

import { timingSafeEqual } from "node:crypto";
import { sha512 } from "./imza";
import { mdDurumu, type MdDurumu } from "./mdstatus";
import { formuldenDeger, type GarantiYaniti } from "./yanit";

/** Provizyonun başarı kodu; bankanın örneğinde tek kabul edilen değer. */
export const BASARILI_KOD = "00";

export type DogrulamaSonucu =
  | { gecerli: true; eksikAlanlar: string[] }
  | { gecerli: false; sebep: string; eksikAlanlar?: string[] };

/* Aynı uzunlukta değilse timingSafeEqual atar; önce uzunluk bakılıyor.
   Sabit zamanlı karşılaştırma, hash'i deneme yanılmayla bulmayı
   zorlaştırıyor. */
function esitMi(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Yanıt gerçekten bankadan mı geldi.
 *
 * `storeKey` mağazanın 3D anahtarı; bu değer olmadan doğrulama YAPILAMAZ
 * ve yapılamıyorsa yanıt kabul edilemez.
 */
export function bankadanMiGeldi(yanit: GarantiYaniti, storeKey: string): DogrulamaSonucu {
  if (!storeKey.trim()) return { gecerli: false, sebep: "3D anahtarı (StoreKey) yok; doğrulama yapılamaz." };

  const gelenHash = (yanit.hash ?? "").trim();
  if (!gelenHash) return { gecerli: false, sebep: "Yanıtta hash yok." };

  const hashparams = (yanit.hashparams ?? "").trim();
  if (!hashparams) return { gecerli: false, sebep: "Yanıtta hashparams yok; formül olmadan doğrulanamaz." };

  const { deger, eksikAlanlar } = formuldenDeger(yanit, hashparams);
  const hesaplanan = sha512(deger + storeKey);

  if (!esitMi(gelenHash.toUpperCase(), hesaplanan)) {
    return { gecerli: false, sebep: "Hash tutmuyor; yanıt bankadan gelmiyor olabilir.", eksikAlanlar };
  }
  return { gecerli: true, eksikAlanlar };
}

export type OdemeSonucu =
  | {
      durum: "odendi";
      orderId: string;
      tutarKurus: number;
      /*
        3D doğrulama düzeyi. Ödemenin gerçekleştiğini procreturncode
        söylüyor; bu alan İTİRAZ SORUMLULUĞUNUN kimde olduğunu söylüyor.
        "yarim" gelirse para alınmıştır ama chargeback riski bizdedir —
        kararı çağıran versin diye açıkta duruyor.
      */
      md: { durum: MdDurumu; aciklama: string };
    }
  | { durum: "basarisiz"; sebep: string; kod: string | null }
  | { durum: "reddedildi"; sebep: string };

export interface Beklenen {
  storeKey: string;
  /** Bizim ürettiğimiz sipariş numarası. */
  orderId: string;
  /** Kendi kaydımızdaki tutar — sepetten ya da sayfadan DEĞİL. */
  tutarKurus: number;
}

/**
 * Yanıtı uçtan uca değerlendirir: "ödendi" demek için hepsi tutmalı.
 *
 * Sıra bankanın saydığı kontrollerle aynı ve her biri ayrı bir saldırıyı
 * kapatıyor:
 *
 *   - Sipariş numarası bizimkiyle aynı mı? Başka bir işlemin geçerli
 *     yanıtını bu siparişe yapıştırmayı engeller.
 *   - procreturncode "00" mı? Başarısız provizyonu "ödendi" saymayı.
 *   - Hash tutuyor mu? Yanıtın tamamen uydurulmasını.
 *   - Tutar bizim kaydımızla aynı mı? Bankanın ayrıca önerdiği kontrol:
 *     "siteden posta edilen tutar, müşterinin gördüğü değil VERİTABANINDAN
 *     çekilen tutar olmalı" ve "dönen tutar ile orijinal tutar
 *     karşılaştırılmalı".
 */
export function odemeSonucu(yanit: GarantiYaniti, beklenen: Beklenen): OdemeSonucu {
  const gelenOrderId = (yanit.oid ?? yanit.orderid ?? "").trim();
  if (!gelenOrderId || gelenOrderId !== beklenen.orderId) {
    return { durum: "reddedildi", sebep: `Sipariş numarası beklenenle aynı değil (gelen: ${gelenOrderId || "yok"}).` };
  }

  const kod = (yanit.procreturncode ?? "").trim() || null;
  if (kod !== BASARILI_KOD) {
    /*
      Banka: "dönüş sadece 00 için kontrol edilmelidir; diğer durumlar
      için gerek olmadığı gibi hesaplama yapılamaz." Yani başarısız
      yanıtta hash doğrulaması beklenmiyor — ama para da hareket
      etmediği için kabul edilecek bir şey yok.
    */
    const mesaj = (yanit.mderrormessage ?? yanit.errmsg ?? "").trim();
    return { durum: "basarisiz", sebep: mesaj || `Provizyon kodu ${kod ?? "yok"}.`, kod };
  }

  const dogrulama = bankadanMiGeldi(yanit, beklenen.storeKey);
  if (!dogrulama.gecerli) return { durum: "reddedildi", sebep: dogrulama.sebep };

  /*
    Tutar denetimi hash'ten SONRA: hash tutmayan bir yanıtın tutarını
    tartışmanın anlamı yok. Tutar hash'in içinde olmayabilir (formül
    bankadan geliyor), o yüzden ayrıca bakılıyor.
  */
  const gelenTutar = Number((yanit.txnamount ?? "").trim());
  if (!Number.isInteger(gelenTutar) || gelenTutar !== beklenen.tutarKurus) {
    return {
      durum: "reddedildi",
      sebep: `Tutar kaydımızla uyuşmuyor (gelen: ${yanit.txnamount ?? "yok"}, beklenen: ${beklenen.tutarKurus}).`,
    };
  }

  return { durum: "odendi", orderId: gelenOrderId, tutarKurus: gelenTutar, md: mdDurumu(yanit.mdstatus) };
}
