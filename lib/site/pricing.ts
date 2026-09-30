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
import { PRODUCT_APPS, ROUTES, type Locale } from "./routes";

/** Fiyatı yayımlanan ürünler. Arvo Randevu'nun tanıtım sayfası henüz yok;
 *  kendi adresine bağlanır (PRODUCT_APPS.randevu). */
export const PRICED_PRODUCTS = ["arvoos", "arc", "randevu", "arvolab"] as const;
export type PricedProduct = (typeof PRICED_PRODUCTS)[number];

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
  /** Kartta öne çıkan basamak (ürün başına en fazla bir tane). */
  oneCikan?: true;
};

/*
  Konumlandırma (30.09.2026): rakiplerin çoğu KULLANICI BAŞINA satıyor
  (Zoho CRM €14–40/kullanıcı/ay). Arvo KURUM BAŞINA satar; 10 kişilik bir
  ekipte fark belirgindir ve fiyat kartındaki "kullanıcı dahil" satırı bu
  yüzden vardır. E-ticaret tarafında ikas'ın ücretli paketleri ~3.300–3.900
  TL/ay bandındadır; ArvoARC'ın Büyüme basamağı bilerek bunun altındadır.
*/
export const PLANS: Plan[] = [
  { code: "arvoos-baslangic", ad: { tr: "Başlangıç", en: "Starter" }, product: "arvoos", aylikKurus: tl(2990) },
  { code: "arvoos-kurumsal", ad: { tr: "Kurumsal", en: "Business" }, product: "arvoos", aylikKurus: tl(6990), oneCikan: true },
  { code: "arvoos-ozel", ad: { tr: "Özel kurum", en: "Enterprise" }, product: "arvoos", aylikKurus: null },

  { code: "arc-baslangic", ad: { tr: "Başlangıç", en: "Starter" }, product: "arc", aylikKurus: tl(1290) },
  { code: "arc-buyume", ad: { tr: "Büyüme", en: "Growth" }, product: "arc", aylikKurus: tl(2990), oneCikan: true },
  { code: "arc-olcek", ad: { tr: "Ölçek", en: "Scale" }, product: "arc", aylikKurus: tl(5990) },

  { code: "randevu-tek", ad: { tr: "Tek salon", en: "Single salon" }, product: "randevu", aylikKurus: tl(749), oneCikan: true },
  { code: "randevu-coklu", ad: { tr: "Çok şube", en: "Multi-branch" }, product: "randevu", aylikKurus: tl(1490) },
  { code: "randevu-zincir", ad: { tr: "Zincir", en: "Chain" }, product: "randevu", aylikKurus: null },

  { code: "arvolab-arastirmaci", ad: { tr: "Araştırmacı", en: "Researcher" }, product: "arvolab", aylikKurus: tl(399), oneCikan: true },
  { code: "arvolab-ekip", ad: { tr: "Ekip", en: "Team" }, product: "arvolab", aylikKurus: tl(1490) },
  { code: "arvolab-kurum", ad: { tr: "Kurum", en: "Institution" }, product: "arvolab", aylikKurus: null },
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

const BICIM: Record<Locale, string> = { tr: "tr-TR", en: "en-US" };

/** "2.990" / "2,990" — birim ayrı yazılır, kartta punto farklı. */
export function tutarYaz(kurus: number, locale: Locale): string {
  return new Intl.NumberFormat(BICIM[locale], { maximumFractionDigits: 0 }).format(kurus / 100);
}

/** JSON-LD `price` alanı: ondalık noktalı, ayırıcısız ("2990.00"). */
export const ldFiyat = (kurus: number): string => (kurus / 100).toFixed(2);

/** Ürünün tanıtım sayfası; Arvo Randevu'da henüz sayfa yok, panel adresi verilir. */
export function urunAdresi(product: PricedProduct, locale: Locale): { href: string; external: boolean } {
  if (product === "randevu") return { href: PRODUCT_APPS.randevu.url, external: true };
  const id = product === "arc" ? "arc" : product === "arvolab" ? "arvolab" : "arvoos";
  return { href: ROUTES[id][locale], external: false };
}

export const urunAdi = (product: PricedProduct): string =>
  product === "arc" ? PRODUCT_APPS.arc.name : PRODUCT_APPS[product].name;
