/*
  GARANTİ BBVA — 3D PEŞİN SATIŞ FORMU (3D_PAY).

  Saf modül; testi tests/unit/garanti-form.test.ts. Ağ yok: burada
  yalnızca bankaya POST edilecek alan haritası üretiliyor.

  ALAN ADLARI UYDURULMADI. Hepsi bankanın yanıt tablosundan doğrulandı:
  tablo bu alanları "işlem yapılırken gönderilen …" diye tarif ediyor,
  yani istekte de aynı adla gidiyorlar (lib/payments/garanti/yanit.ts).

  XML YOLUNU YAZACAK OLANA NOT. Provizyon/tekrarlayan ödeme XML'i
  yazıldığında CardholderPresentCode alanı 3D işlemlerde 0 DEĞİL 13
  olmalı (GOSAS: "Normal işlemler için 0, 3D güvenli işlemler için
  13"). GOSAS'ın kendi Sales() gövdesi 0 kullanıyor çünkü orası 3D'siz
  satış; oradan kopyalayan biri 3D işleme 0 gönderir ve işlem 3D'siz
  sayılır — para geçer ama itiraz sorumluluğu üstümüzde kalır.
  Tekrarlayan ödemenin sıklığı da ayrı bir alan: GOSAS'ta D/W/M/Y
  (aylık abonelik "M").

  KART ALANLARI AYRI BİR FONKSİYONDA (kartliPesinSatisFormu) ve bu
  bilerek: kartın bizim sayfamızdan geçmesi PCI kapsamına girmek
  demek. Sağlayıcı tanımındaki "kart bilgisi bize hiç gelmez" sözü
  Ortak Ödeme Sayfası'na ait; kart taşıyan yolu ayrı bir adla
  çağırmak, o kararın sessizce alınmasını engelliyor ve "PAN nereden
  geçiyor" sorusunun cevabını tek bir grep'e indiriyor.
*/

import { TRY_KODU, hashData, type ParaBirimi } from "./imza";

export type GarantiKipi = "TEST" | "PROD";

/* Belgedeki örnekte apiversion 512. */
export const API_SURUMU = "512";

/*
  Test ucu bankanın güncel belgesinden.

  ÜRETİM UCU BİLEREK SABİT DEĞİL. İki kaynak var ve ayrışıyorlar:
  bankanın güncel portalı garantibbva.com.tr alan adını kullanıyor,
  GOSAS.VirtualPos ise eski garanti.com.tr'yi (test
  sanalposprovtest.garanti.com.tr, üretim sanalposprov.garanti.com.tr).
  Desen belli — "provtest" yerine "prov" — ama alan adı taşındığı için
  üretim adresini bu desenden ÜRETMEK tahmin olurdu ve canlıda yanlış
  bir sunucuya ödeme göndermeye çalışmak demekti. Adres Sanal POS
  yönetim ekranından doğrulanıp açıkça verilmeli.
*/
export const TEST_UCU = "https://sanalposprovtest.garantibbva.com.tr/servlet/gt3dengine";

export interface FormGirdisi {
  kip: GarantiKipi;
  /** PROD'da zorunlu: bankanın verdiği üretim gt3dengine adresi. */
  uretimUcu?: string;
  terminalId: string;
  terminalMerchantId: string;
  /** Sanal POS panelindeki provizyon kullanıcısı (genelde PROVAUT). */
  terminalProvUserId: string;
  /*
    Belgedeki örnekte "GARANTI". Sağlayıcı kimlik kümemizde böyle bir
    alan YOK; varsayılanla geçmek yerine çağırandan isteniyor ki
    panelde yanlış bir değer sessizce kalmasın.
  */
  terminalUserId: string;
  provizyonSifresi: string;
  storeKey: string;
  orderId: string;
  /** KURUŞ cinsinden tamsayı: 100,00 TL → 10000. */
  tutarKurus: number;
  paraBirimi?: ParaBirimi;
  successUrl: string;
  errorUrl: string;
  /**
   * Taksit sayısı; tek çekim için 0.
   *
   * ÇÖZÜLMEMİŞ ÇELİŞKİ — test terminalinde İLK SINANACAK ŞEY BU.
   * Bankanın 3D hash örneği int alıyor, yani tek çekimde metne "0"
   * giriyor. GOSAS.VirtualPos'un XML yolu ise tek çekimde BOŞ DİZGE
   * gönderiyor (installment <= 0 ? string.Empty : ...). İkisi farklı
   * yollar ama hangisinin 3D formunda geçerli olduğu belgeden
   * anlaşılmıyor.
   *
   * Bankanın kendi 3D örneğine uyuyoruz ("0"). Yanlışsa banka imzayı
   * reddeder — yani sessiz değil, gürültülü bir hata; test
   * terminalinde hemen görülür ve tekCekimBosGitsin ile çevrilir.
   */
  taksit?: number;
  /** Tek çekimde taksit alanı boş dizge gitsin (yukarıdaki çelişki). */
  tekCekimBosGitsin?: boolean;
  companyName: string;
  musteriEposta?: string;
  musteriIp?: string;
  kartSahibiAdi?: string;
  /** Banka sayfasının yenileme süresi (saniye). */
  refreshTime?: number;
  lang?: "tr" | "en";
}

export interface GarantiFormu {
  /** Formun action adresi. */
  ucAdresi: string;
  /** name → value; hepsi hidden input olarak gönderilir. */
  alanlar: Record<string, string>;
}

/**
 * 3D peşin satış formunu kurar.
 *
 * İmza ile formun AYNI değerleri taşıması şart: taksit sayısı, tutar ve
 * para birimi iki yerde ayrı hesaplanırsa banka imzayı reddeder ve hata
 * "imza hatalı" olarak döner — sebebi görünmez. Bu yüzden ikisini de
 * burada, tek bir yerden üretiyoruz.
 */
export function pesinSatisFormu(girdi: FormGirdisi): GarantiFormu {
  const paraBirimi = girdi.paraBirimi ?? TRY_KODU;
  const taksit = girdi.taksit ?? 0;
  /* Aynı metin hem forma hem imzaya gidiyor; ayrışırlarsa banka reddeder. */
  const taksitMetni = taksit <= 0 && girdi.tekCekimBosGitsin ? "" : String(taksit);
  const tip = "sales";

  if (girdi.kip === "PROD" && !girdi.uretimUcu) {
    throw new Error(
      "Üretim kipinde gt3dengine adresi açıkça verilmeli. "
      + "Adresi tahmin etmek, canlıda yanlış bir sunucuya ödeme göndermeye çalışmak olurdu.",
    );
  }
  for (const [ad, deger] of [
    ["terminalMerchantId", girdi.terminalMerchantId],
    ["terminalProvUserId", girdi.terminalProvUserId],
    ["terminalUserId", girdi.terminalUserId],
    ["companyName", girdi.companyName],
    ["successUrl", girdi.successUrl],
    ["errorUrl", girdi.errorUrl],
  ] as const) {
    if (!String(deger ?? "").trim()) throw new Error(`${ad} boş olamaz.`);
  }

  /* İmza, formdakiyle birebir aynı değerlerden üretiliyor. */
  const imza = hashData({
    terminalId: girdi.terminalId,
    orderId: girdi.orderId,
    amount: girdi.tutarKurus,
    currencyCode: paraBirimi,
    successUrl: girdi.successUrl,
    errorUrl: girdi.errorUrl,
    type: tip,
    installmentMetni: taksitMetni,
    storeKey: girdi.storeKey,
    provizyonSifresi: girdi.provizyonSifresi,
  });

  const alanlar: Record<string, string> = {
    mode: girdi.kip,
    apiversion: API_SURUMU,
    secure3dsecuritylevel: "3D_PAY",
    terminalprovuserid: girdi.terminalProvUserId,
    terminaluserid: girdi.terminalUserId,
    terminalmerchantid: girdi.terminalMerchantId,
    terminalid: girdi.terminalId,
    orderid: girdi.orderId,
    successurl: girdi.successUrl,
    errorurl: girdi.errorUrl,
    txntype: tip,
    txnamount: String(girdi.tutarKurus),
    txncurrencycode: String(paraBirimi),
    txninstallmentcount: taksitMetni,
    companyname: girdi.companyName,
    secure3dhash: imza,
    lang: girdi.lang ?? "tr",
  };

  /*
    İsteğe bağlı alanlar yalnızca DOLUYSA konuyor. Boş bir alan
    göndermek, göndermemekle aynı değil: boş dizge de imzaya girmediği
    hâlde bankanın beklediği kümeyi değiştirebiliyor.
  */
  if (girdi.musteriEposta?.trim()) alanlar.customeremailaddress = girdi.musteriEposta.trim();
  if (girdi.musteriIp?.trim()) alanlar.customeripaddress = girdi.musteriIp.trim();
  /*
    ÇELİŞKİ, TEST TERMİNALİNDE SINANACAK: bankanın yanıt tablosu bu
    alanı "cardholdername" diye sayıyor ("işlem yapılırken gönderilen
    müşteri adı"), GOSAS'ın GVPOSCard'ı ise [FormElement("cardholder")]
    diyor. Bankanın kendi tablosuna uyuyoruz; yanlışsa banka alanı yok
    sayar (imza tutmaya devam eder, çünkü ad imzaya girmiyor) ve
    ekstrede kart sahibi adı boş görünür.
  */
  if (girdi.kartSahibiAdi?.trim()) alanlar.cardholdername = girdi.kartSahibiAdi.trim();
  if (girdi.refreshTime !== undefined) alanlar.refreshtime = String(girdi.refreshTime);

  return { ucAdresi: girdi.kip === "TEST" ? TEST_UCU : girdi.uretimUcu!, alanlar };
}

/*
  KART ALANLARI. Adlar GOSAS.VirtualPos'un GVPOSCard sınıfındaki
  [FormElement] özniteliklerinden: cardnumber, cardexpiredatemonth,
  cardexpiredateyear, cardcvv2.

  Son kullanma tarihi FORMDA İKİ AYRI ALAN, tek bir MMYY değil.
  Dört haneli yıl iki haneye indiriliyor (2027 → "27"), ay ve yıl
  sıfırla iki haneye tamamlanıyor — GOSAS'ın IsRequireZero'su da
  bunu yapıyor.
*/
export interface KartBilgisi {
  /** Kart numarası; 15-19 rakam. */
  numara: string;
  /** Son kullanma ayı, 1-12. */
  ay: number;
  /** Son kullanma yılı; 27 ya da 2027. */
  yil: number;
  /** 3 ya da 4 (AMEX) rakam. */
  cvv: string;
}

const ikiHane = (deger: number) => String(deger).padStart(2, "0");

/*
  Kart hatalarında DEĞER YAZILMIYOR, yalnızca hangi alan olduğu.
  Kart numarasını bir istisna mesajına koymak, onu günlüklere,
  hata izleyicisine ve destek ekranlarına taşımak demek.
*/
function kartAlanlari(kart: KartBilgisi): Record<string, string> {
  const numara = kart.numara.replace(/\s/g, "");
  if (!/^[0-9]{15,19}$/.test(numara)) throw new Error("Kart numarası 15-19 rakam olmalı.");
  if (!Number.isInteger(kart.ay) || kart.ay < 1 || kart.ay > 12) throw new Error("Son kullanma ayı 1-12 olmalı.");
  if (!/^[0-9]{3,4}$/.test(kart.cvv)) throw new Error("CVV 3 ya da 4 rakam olmalı.");
  const yil = kart.yil > 2000 ? kart.yil - 2000 : kart.yil;
  if (!Number.isInteger(yil) || yil < 0 || yil > 99) throw new Error("Son kullanma yılı iki haneye indirilemedi.");
  return {
    cardnumber: numara,
    cardexpiredatemonth: ikiHane(kart.ay),
    cardexpiredateyear: ikiHane(yil),
    cardcvv2: kart.cvv,
  };
}

/**
 * Kart bilgisi TAŞIYAN 3D peşin satış formu.
 *
 * Ayrı bir ad taşıyor çünkü ayrı bir karar: bu yolda kart numarası
 * bizim sayfamızdan geçer ve PCI kapsamına gireriz. Ortak Ödeme
 * Sayfası'na geçilirse bu fonksiyon hiç çağrılmaz.
 *
 * Dönen alanlar KAYDEDİLMEMELİ ve GÜNLÜĞE YAZILMAMALI: yalnızca
 * bankaya gönderilecek formu doldurmak için.
 */
export function kartliPesinSatisFormu(girdi: FormGirdisi, kart: KartBilgisi): GarantiFormu {
  const form = pesinSatisFormu(girdi);
  return { ucAdresi: form.ucAdresi, alanlar: { ...form.alanlar, ...kartAlanlari(kart) } };
}

/**
 * Benzersiz sipariş numarası.
 *
 * Belgedeki örnek 32 haneli hex (tireleri atılmış UUID); aynı biçimi
 * kullanıyoruz. HER DENEME YENİ NUMARA ALIR: banka aynı orderid'yi
 * ikinci kez kabul etmiyor, yani 3D'den düşen bir ödemenin tekrarı
 * eski numarayla gönderilemez. Faturayla bağ orderid'de değil, bizim
 * kendi kaydımızda tutulmalı.
 */
export const siparisNumarasi = (uuid: string) => uuid.replace(/-/g, "").toLowerCase();
