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

  KART ALANLARI BURADA YOK. 3D_PAY'de kart bilgisi bankaya gönderiliyor
  ama alan adları henüz elimizde değil; uydurmak yerine dışarıda
  bırakıldı. Ayrıca kartın bizim sayfamızdan geçmesi PCI kapsamı demek —
  sağlayıcı tanımındaki "kart bilgisi bize hiç gelmez" sözü Ortak Ödeme
  Sayfası'na ait. Hangi akışın seçileceği netleşmeden kart alanı
  eklenmemeli.
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
  if (girdi.kartSahibiAdi?.trim()) alanlar.cardholdername = girdi.kartSahibiAdi.trim();
  if (girdi.refreshTime !== undefined) alanlar.refreshtime = String(girdi.refreshTime);

  return { ucAdresi: girdi.kip === "TEST" ? TEST_UCU : girdi.uretimUcu!, alanlar };
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
