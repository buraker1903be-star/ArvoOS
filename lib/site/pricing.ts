/*
  Arvo abonelik ücretleri — TEK KAYNAK.

  Rakamlar YALNIZCA burada durur. Türkçe ve İngilizce sayfalar, llms.txt,
  JSON-LD ve sözleşme metinleri bu modülden okur. Eskiden paket içerikleri
  iki ayrı içerik dosyasına (TR/EN) elle yazılıyordu; fiyat da öyle
  yazılsaydı iki dilin rakamı sessizce ayrışırdı — yayımlanmış bir fiyat
  listesinde bu, yanlış fiyat göstermek demek.

  Para kuruş cinsinden tamsayıdır (depo değişmezi). Fiyatlar tam lira
  olduğu için `tl()` ile yazılır; yıllık bedel aylığın tam katı olduğundan
  bölme ve yuvarlama hiç yoktur.
*/
import { ARC_APP, PRODUCT_APPS, ROUTES, type Locale } from "./routes";

/*
  İki liste, çünkü iki ayrı soru:
   - PRICED_PRODUCTS: fiyat kaydı olan ürünler. Kurucu Konsolu (Ücret ve
     Paketler, lisans formu) bunları okur; ArvoARC'ın basamakları burada
     KALIYOR — e-ticaret sitesi yaptıran kurumların paneli lisansla
     açılıyor ve kurulumda liste fiyatı buradan uygulanıyor.
   - SITE_PRODUCTS: arvo-os.com'da satılanlar. ArvoARC 28.10.2026'da
     satıştan kalktı (kiralama yok); ücretler sayfası, JSON-LD ve llms.txt
     yalnızca bunları yayımlar.
*/
export const PRICED_PRODUCTS = ["arvoos", "arc", "randevu", "arvolab"] as const;
export type PricedProduct = (typeof PRICED_PRODUCTS)[number];
export const SITE_PRODUCTS = ["arvoos", "randevu", "arvolab"] as const satisfies readonly PricedProduct[];
export type SiteProduct = (typeof SITE_PRODUCTS)[number];

/** Liste fiyatları KDV hariçtir; B2B karşılaştırmasında rakiplerin listesi de öyle. */
export const KDV_HARIC = true;
export const PARA_BIRIMI = "TRY";

/*
  Yıllık ödeme: "12 ay kullan, 10 ay öde" (≈ %17). Oran yerine AY SAYISI
  tutuluyor: yüzdeyle çarpmak küsuratlı bedeller üretiyor, ay sayısı hem
  müşteriye anlatılabilir hem de tam tutar verir.
*/
export const YILLIK_ODENEN_AY = 10;
export const YILLIK_BEDAVA_AY = 12 - YILLIK_ODENEN_AY;

const tl = (lira: number) => lira * 100;

export type Plan = {
  /** Kararlı kimlik: JSON-LD `sku`, testler ve içerik eşlemesi bunu kullanır. */
  code: string;
  product: PricedProduct;
  /*
    Basamak adı da burada: llms.txt ve JSON-LD adı rakamla birlikte yazıyor.
    İçerik dosyasında kalsaydı lib katmanının app içeriğini import etmesi
    ya da adın iki yerde durması gerekirdi — ikisi de ayrışma demek.
  */
  ad: Record<Locale, string>;
  /** Aylık liste fiyatı (kuruş). null = teklif usulü, rakam yayımlanmaz. */
  aylikKurus: number | null;
  /*
    ArvoLab KİŞİ BAŞI fiyatlanır, ötekiler kurum başına. Sebep: ArvoOS,
    ArvoARC ve Randevu'da değer kurumun akışındadır, ArvoLab'de değer
    doğrudan yazan kişidedir — ikinci bir araştırmacı ikinci bir tez
    demektir. Bu alan hem ekrandaki birimi ("/kullanıcı/ay") hem JSON-LD
    referenceQuantity'sini belirler.
  */
  kisiBasi?: true;
  /** Koltuk başı basamaklarda en az kullanıcı sayısı (hacim indiriminin şartı). */
  enAzKullanici?: number;
  /** Kartta öne çıkan basamak (ürün başına en fazla bir tane). */
  oneCikan?: true;
};

/*
  Konumlandırma (30.09.2026): rakiplerin çoğu KULLANICI BAŞINA satıyor
  (Zoho CRM €14–40/kullanıcı/ay). Arvo KURUM BAŞINA satar; 10 kişilik bir
  ekipte fark belirgindir ve fiyat kartındaki "kullanıcı dahil" satırı bu
  yüzden vardır. E-ticaret tarafında ikas'ın ücretli paketleri ~3.300–3.900
  TL/ay bandındadır; ArvoARC'ın Büyüme basamağı bilerek bunun altındadır.

  ArvoLab ayrı durur: Türkiye'de literatür + akademik yazım + kılavuz
  kontrolü + analiz + özgünlük ön kontrolünü tek pakette veren bir sistem
  yok. Karşılaştırma yurt dışı araç yığınıdır (Jenni ~$29/ay, Elicit
  $10-49, Scite $12-20, Paperpile ~$4 — dördü ayrı hesap, Türkçe kılavuz
  kontrolü yok) ve alıcının kaçındığı gerçek harcamadır (tez yazdırma
  yüksek lisansta 30.000-70.000 TL). Bu yüzden fiyat 399'dan 1.490'a
  çıkarıldı, ardından koltuk başına 1.990'a taşındı (30.09.2026):
  kategoride tek olan ürünü rakip fiyatına göre değil, yerine geçtiği
  harcamaya göre fiyatlıyoruz.

  "Ekip" basamağı eskiden 5 kullanıcılık sabit bir paketti ve Kurum'dan
  farkı yalnızca sayıydı — iki basamak aynı şeyi anlatıyordu. Artık Ekip
  koltuk başı hacim indirimi (en az 3 kullanıcı, koltuk %25 ucuz), Kurum
  ise sınırsız kullanıcılı site lisansıdır. İkisi artık farklı şeyler
  satıyor.

  Öğrenci indirimi YOK: ödeyen kitle zaten lisansüstü öğrencidir, indirim
  gelirin kendisini keserdi. Onlara dönük teklif yıllık pakettir — 10 ay
  bedeliyle 12 ay, yani bir tez dönemini kapsayan tek ödeme.

  ArvoOS merdiveni 13.10.2026'da düzeltildi. Eskiden Başlangıç 2.990 TL /
  5 kullanıcı (598 TL/kullanıcı), Kurumsal 6.990 TL / 25 kullanıcı
  (280 TL/kullanıcı) idi: sayfanın bütün iddiası "kullanıcı başına değil"
  iken KÜÇÜK müşteri kullanıcı başına iki katını ödüyordu. Hacmin tamamı
  giriş basamağında ve giriş en pahalı yer olmamalı. Dahil kullanıcı
  sayıları gerçekçi ekip büyüklüğüne çekildi (3 ve 15), fiyat da onunla
  indi; aradaki fark ek kullanıcı kalemiyle kapanıyor. 20 kişilik bir
  kurum eskiden 6.990 ödüyordu, şimdi 5.990 + 5 ek kullanıcı = 7.235:
  üstte gelir korunuyor, girişte eşik 2.990'dan 1.990'a iniyor.

  Ek kullanıcı kalemi 13.10.2026'dan beri gerçekten işliyor: ödeme
  bağlantısı dahil sayıyı aşan her etkin kullanıcı için kalemi ekliyor
  (lib/license-checkout). Birim bedel kiracının lisansında
  (extra_user_fee); kurulumda "liste fiyatını uygula" onu da bu listeden
  yazıyor.

  TUTAR KONSOLDAN DA DEĞİŞİR (14.10.2026): buradaki rakamlar varsayılan;
  Kurucu Konsolu → Ücret ve Paketler'de yayımlanan tutar üstüne
  yazar (lib/site/fiyat-kaynagi). Basamak eklemek, adı ve birimi hâlâ
  burada.

  ArvoARC'ın Ölçek basamağı 5.990'dan 3.990'a indi: ödeme, kargo,
  pazaryeri ve stok senkronu YOK (bu iddialar arc.ts'te yasak), yani 5
  mağazalık bir işletmeye ikas bandına yakın bir fiyat veriliyordu.
  Entegrasyonlar geldiğinde yeniden bakılır.
*/
export const PLANS: Plan[] = [
  { code: "arvoos-baslangic", ad: { en: "Starter", tr: "Başlangıç", de: "Starter", es: "Starter", fr: "Essentiel", ar: "الأساسية" }, product: "arvoos", aylikKurus: tl(1990) },
  { code: "arvoos-kurumsal", ad: { en: "Business", tr: "Kurumsal", de: "Business", es: "Business", fr: "Entreprise", ar: "الأعمال" }, product: "arvoos", aylikKurus: tl(5990), oneCikan: true },
  { code: "arvoos-ozel", ad: { en: "Enterprise", tr: "Özel kurum", de: "Enterprise", es: "Enterprise", fr: "Sur mesure", ar: "المؤسسات" }, product: "arvoos", aylikKurus: null },

  { code: "arc-baslangic", ad: { en: "Starter", tr: "Başlangıç", de: "Starter", es: "Inicial", fr: "Essentiel", ar: "الأساسية" }, product: "arc", aylikKurus: tl(1290) },
  { code: "arc-buyume", ad: { en: "Growth", tr: "Büyüme", de: "Wachstum", es: "Crecimiento", fr: "Croissance", ar: "النمو" }, product: "arc", aylikKurus: tl(2990), oneCikan: true },
  { code: "arc-olcek", ad: { en: "Scale", tr: "Ölçek", de: "Scale", es: "Escala", fr: "Échelle", ar: "التوسع" }, product: "arc", aylikKurus: tl(3990) },

  { code: "randevu-tek", ad: { en: "Single salon", tr: "Tek salon", de: "Ein Salon", es: "Un salón", fr: "Un salon", ar: "صالون واحد" }, product: "randevu", aylikKurus: tl(749), oneCikan: true },
  { code: "randevu-coklu", ad: { en: "Multi-branch", tr: "Çok şube", de: "Mehrere Filialen", es: "Varias sucursales", fr: "Multi-sites", ar: "فروع متعددة" }, product: "randevu", aylikKurus: tl(1490) },
  { code: "randevu-zincir", ad: { en: "Chain", tr: "Zincir", de: "Kette", es: "Cadena", fr: "Réseau", ar: "سلسلة" }, product: "randevu", aylikKurus: null },

  { code: "arvolab-arastirmaci", ad: { en: "Researcher", tr: "Araştırmacı", de: "Forschende", es: "Investigador", fr: "Chercheur", ar: "باحث" }, product: "arvolab", aylikKurus: tl(1990), kisiBasi: true, oneCikan: true },
  { code: "arvolab-ekip", ad: { en: "Team", tr: "Ekip", de: "Team", es: "Equipo", fr: "Équipe", ar: "فريق" }, product: "arvolab", aylikKurus: tl(1490), kisiBasi: true, enAzKullanici: 3 },
  { code: "arvolab-kurum", ad: { en: "Institution", tr: "Kurum", de: "Institution", es: "Institución", fr: "Institution", ar: "مؤسسة" }, product: "arvolab", aylikKurus: null },
];

/** Pakete dahil olmayan, ayrıca ücretlendirilen kalemler. */
export type AddOn = { code: string; aylikKurus: number | null };
export const ADD_ONS: AddOn[] = [
  { code: "ek-kullanici", aylikKurus: tl(249) },
  { code: "ek-sube", aylikKurus: tl(349) },
  { code: "veri-aktarimi", aylikKurus: null },
  { code: "ozel-gelistirme", aylikKurus: null },
];

export const planlar = (product: PricedProduct): Plan[] => PLANS.filter((p) => p.product === product);

export const yillikKurus = (plan: Plan): number | null =>
  plan.aylikKurus === null ? null : plan.aylikKurus * YILLIK_ODENEN_AY;

/** Yıllık ödemede kalan tutar (iletişimde "yılda X TL tasarruf"). */
export const yillikKazancKurus = (plan: Plan): number | null =>
  plan.aylikKurus === null ? null : plan.aylikKurus * YILLIK_BEDAVA_AY;

const BICIM: Record<Locale, string> = { en: "en-US", tr: "tr-TR", de: "de-DE", es: "es-ES", fr: "fr-FR", ar: "ar-u-nu-latn" };

/** "2.990" / "2,990" / "2 990" — birim ayrı yazılır, kartta punto farklı. */
export function tutarYaz(kurus: number, locale: Locale): string {
  return new Intl.NumberFormat(BICIM[locale], { maximumFractionDigits: 0 }).format(kurus / 100);
}

/** JSON-LD `price` alanı: ondalık noktalı, ayırıcısız ("2990.00"). */
export const ldFiyat = (kurus: number): string => (kurus / 100).toFixed(2);

/* Sitede satılan her ürünün tanıtım sayfası var. ArvoARC'ınki
   28.10.2026'da kalktı; ürün sitede listelenmediği için adresi de yok. */
export function urunAdresi(product: SiteProduct, locale: Locale): { href: string; external: boolean } {
  return { href: ROUTES[product][locale], external: false };
}

export const urunAdi = (product: PricedProduct): string =>
  product === "arc" ? ARC_APP.name : PRODUCT_APPS[product].name;
