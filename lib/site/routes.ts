// arvo-os.com pazarlama sitesinin rota sözleşmesi. Sayfalar, menüler,
// SEO (sitemap, hreflang, canonical, JSON-LD), llms.txt, yönlendirmeler ve
// demo formu bu TEK kaynaktan beslenir. Yeni sayfa eklerken önce buraya ekleyin.

export const SITE_ORIGIN = "https://arvo-os.com";

/* Sıra dil menüsündeki sıradır: varsayılan (İngilizce) başta. Almanca,
   İspanyolca ve Fransızca 28.10.2026'da eklendi (global site). */
export const LOCALES = ["en", "tr", "de", "es", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];
/* Varsayılan dil İngilizce (28.10.2026): kök adres ve hreflang x-default.
   Türkçe ziyaretçi köke geldiğinde tarayıcı diline göre /tr'ye
   yönlenir (lib/site/dil-secimi.ts); arama motoru botları yönlenmez. */
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_TAGS: Record<Locale, string> = { en: "en-US", tr: "tr-TR", de: "de-DE", es: "es-ES", fr: "fr-FR", ar: "ar" };
/** Dil menüsünde her dilin KENDİ dilindeki adı (ziyaretçi kendi dilini arar). */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", tr: "Türkçe", de: "Deutsch", es: "Español", fr: "Français", ar: "العربية" };

export type PageId =
  | "home"
  | "arvoos"
  | "arvoos-modules"
  | "arvoos-industries"
  | "arvoos-solutions"
  | "arvoos-plans"
  | "pricing"
  | "arvolab"
  | "randevu"
  | "services"
  | "web-design"
  | "seo-geo"
  | "custom-software"
  | "about"
  | "contact"
  | "privacy"
  | "distance-sales"
  | "refund"
  | "delivery";

/*
  Her sayfanın dil başına yolu. İNGİLİZCE KÖKTE, Türkçe /tr altında
  (28.10.2026, global site). Eskiden tersiydi: Türkçe kökte, İngilizce
  /en altındaydı. Eski adreslerin hepsi LEGACY_REDIRECTS'te kalıcı
  yönlendirmeyle yeni yerine iner — tablo eskiTr/eskiEn ile türetiliyor,
  elle yazılmıyor, yani yeni sayfa eklemek eski adres listesini bozmaz.
*/
export const ROUTES: Record<PageId, Record<Locale, string>> = {
  home: { en: "/", tr: "/tr", de: "/de", es: "/es", fr: "/fr", ar: "/ar" },
  arvoos: { en: "/products/arvoos", tr: "/tr/urunler/arvoos", de: "/de/produkte/arvoos", es: "/es/productos/arvoos", fr: "/fr/produits/arvoos", ar: "/ar/products/arvoos" },
  "arvoos-modules": { en: "/products/arvoos/modules", tr: "/tr/urunler/arvoos/moduller", de: "/de/produkte/arvoos/module", es: "/es/productos/arvoos/modulos", fr: "/fr/produits/arvoos/modules", ar: "/ar/products/arvoos/modules" },
  "arvoos-industries": { en: "/products/arvoos/industries", tr: "/tr/urunler/arvoos/sektorler", de: "/de/produkte/arvoos/branchen", es: "/es/productos/arvoos/sectores", fr: "/fr/produits/arvoos/secteurs", ar: "/ar/products/arvoos/industries" },
  "arvoos-solutions": { en: "/products/arvoos/solutions", tr: "/tr/urunler/arvoos/cozumler", de: "/de/produkte/arvoos/loesungen", es: "/es/productos/arvoos/soluciones", fr: "/fr/produits/arvoos/solutions", ar: "/ar/products/arvoos/solutions" },
  "arvoos-plans": { en: "/products/arvoos/plans", tr: "/tr/urunler/arvoos/paketler", de: "/de/produkte/arvoos/pakete", es: "/es/productos/arvoos/planes", fr: "/fr/produits/arvoos/offres", ar: "/ar/products/arvoos/plans" },
  // Ücretler tek sayfada: dört ürünün fiyatı ayrı sayfalara dağılırsa
  // karşılaştırma yapılamıyor ve arama motoru hangisini göstereceğini seçemiyor.
  pricing: { en: "/pricing", tr: "/tr/ucretler", de: "/de/preise", es: "/es/precios", fr: "/fr/tarifs", ar: "/ar/pricing" },
  arvolab: { en: "/products/arvolab", tr: "/tr/urunler/arvolab", de: "/de/produkte/arvolab", es: "/es/productos/arvolab", fr: "/fr/produits/arvolab", ar: "/ar/products/arvolab" },
  /* Kimlik "randevu" kalıyor: lisans, köprü ve fiyat kodları bu adla
     (randevu-tek …). Ürünün adı 28.10.2026'dan beri ArvoBook. */
  randevu: { en: "/products/arvobook", tr: "/tr/urunler/arvobook", de: "/de/produkte/arvobook", es: "/es/productos/arvobook", fr: "/fr/produits/arvobook", ar: "/ar/products/arvobook" },
  services: { en: "/services", tr: "/tr/hizmetler", de: "/de/leistungen", es: "/es/servicios", fr: "/fr/services", ar: "/ar/services" },
  "web-design": { en: "/services/web-design", tr: "/tr/hizmetler/web-sitesi-tasarimi", de: "/de/leistungen/webdesign", es: "/es/servicios/diseno-web", fr: "/fr/services/creation-de-site-web", ar: "/ar/services/web-design" },
  "seo-geo": { en: "/services/seo-geo", tr: "/tr/hizmetler/seo-ve-geo", de: "/de/leistungen/seo-geo", es: "/es/servicios/seo-geo", fr: "/fr/services/seo-geo", ar: "/ar/services/seo-geo" },
  "custom-software": { en: "/services/custom-software", tr: "/tr/hizmetler/ozel-yazilim", de: "/de/leistungen/individualsoftware", es: "/es/servicios/software-a-medida", fr: "/fr/services/logiciel-sur-mesure", ar: "/ar/services/custom-software" },
  about: { en: "/about", tr: "/tr/hakkimizda", de: "/de/ueber-uns", es: "/es/sobre-nosotros", fr: "/fr/a-propos", ar: "/ar/about" },
  contact: { en: "/contact", tr: "/tr/iletisim", de: "/de/kontakt", es: "/es/contacto", fr: "/fr/contact", ar: "/ar/contact" },
  privacy: { en: "/privacy", tr: "/tr/gizlilik", de: "/de/datenschutz", es: "/es/privacidad", fr: "/fr/confidentialite", ar: "/ar/privacy" },
  // Mesafeli satış mevzuatı ve ödeme kuruluşunun canlı mod incelemesi bu üç
  // metni ayrı ayrı arıyor; tek "şartlar" sayfası yeterli sayılmıyor.
  "distance-sales": { en: "/distance-sales-agreement", tr: "/tr/mesafeli-satis-sozlesmesi", de: "/de/fernabsatzvertrag", es: "/es/contrato-de-venta-a-distancia", fr: "/fr/contrat-de-vente-a-distance", ar: "/ar/distance-sales-agreement" },
  refund: { en: "/cancellation-and-refund", tr: "/tr/iptal-ve-iade", de: "/de/widerruf-und-erstattung", es: "/es/cancelacion-y-reembolso", fr: "/fr/annulation-et-remboursement", ar: "/ar/cancellation-and-refund" },
  delivery: { en: "/delivery", tr: "/tr/teslimat", de: "/de/lieferung", es: "/es/entrega", fr: "/fr/livraison", ar: "/ar/delivery" },
};

/** Sitemap önceliği / değişim sıklığı (arama motorları için ipucu). */
export const PAGE_PRIORITY: Record<PageId, number> = {
  home: 1,
  arvoos: 0.9,
  arvolab: 0.9,
  randevu: 0.9,
  "arvoos-modules": 0.8,
  "arvoos-industries": 0.7,
  "arvoos-solutions": 0.7,
  "arvoos-plans": 0.8,
  pricing: 0.9,
  services: 0.7,
  "web-design": 0.7,
  "seo-geo": 0.7,
  "custom-software": 0.7,
  about: 0.6,
  contact: 0.7,
  privacy: 0.3,
  "distance-sales": 0.2,
  refund: 0.2,
  delivery: 0.2,
};

/*
  28.10.2026'ya kadarki adres düzeni: Türkçe kökte, İngilizce /en altında.
  Yeni düzenden türetiliyor (öneki çıkar/ekle); eski kök "/" hariç — o
  adres artık İngilizce ana sayfa, Türkçe ziyaretçiyi dil seçimi taşıyor.
*/
const eskiTr = (yeni: string) => (yeni === "/tr" ? "/" : yeni.slice(3));
const eskiEn = (yeni: string) => (yeni === "/" ? "/en" : `/en${yeni}`);

/** Eski adresler → yeni yerleri (kalıcı 301). */
/*
  İki ana sayfa bu tabloda YOK:
   - eski Türkçe kök "/" artık İngilizce ana sayfa (dil seçimi taşıyor);
   - eski İngilizce kök "/en" ara katmanda yönlenir (lib/site/dil-secimi.ts
     → ESKI_INGILIZCE_KOK): "/"e inerken İngilizce seçimini çereze yazar.
     Buradan yönlenseydi Türkçe tarayıcı "/"de dil seçimine takılıp "/tr"ye
     giderdi; eski İngilizce adres dilini korumazdı (Codex incelemesi,
     28.10.2026).
*/
export const LEGACY_REDIRECTS: { from: string; to: string }[] = [
  ...(Object.keys(ROUTES) as PageId[]).flatMap((id) =>
    id === "home" ? [] : [
      { from: eskiTr(ROUTES[id].tr), to: ROUTES[id].tr },
      { from: eskiEn(ROUTES[id].en), to: ROUTES[id].en },
    ]),
  // ArvoOS'un eski kurumsal sayfaları (Türkçe).
  { from: "/urun", to: ROUTES.arvoos.tr },
  { from: "/moduller", to: ROUTES["arvoos-modules"].tr },
  { from: "/sektorler", to: ROUTES["arvoos-industries"].tr },
  { from: "/cozumler", to: ROUTES["arvoos-solutions"].tr },
  { from: "/paketler", to: ROUTES["arvoos-plans"].tr },
  /*
    ArvoARC 28.10.2026'da satıştan kalktı: kiralama yok, yalnızca e-ticaret
    sitesini Arvo'ya yaptıranlara sitenin yanında panel olarak veriliyor.
    Eski adres dizinde ve paylaşılmış bağlantılarda yaşıyor; 404 yerine
    bu işin bugünkü karşılığı olan web sitesi hizmetine iner.
  */
  { from: "/urunler/arc", to: ROUTES["web-design"].tr },
  { from: "/en/products/arc", to: ROUTES["web-design"].en },
  // Arvo Randevu → ArvoBook (28.10.2026).
  { from: "/urunler/randevu", to: ROUTES.randevu.tr },
  { from: "/en/products/randevu", to: ROUTES.randevu.en },
];

/** Ürünlerin kiracılı panelleri (giriş adresleri). */
export const PRODUCT_APPS = {
  arvoos: { name: "ArvoOS", url: "https://app.arvo-os.com/login", host: "app.arvo-os.com" },
  arvolab: { name: "ArvoLab", url: "https://lab.arvo-os.com", host: "lab.arvo-os.com" },
  randevu: { name: "ArvoBook", url: "https://randevu.arvo-os.com", host: "randevu.arvo-os.com" },
} as const;

/*
  ArvoARC sitede ÜRÜN OLARAK YOK (28.10.2026) ama paneli yaşıyor: e-ticaret
  sitesini Arvo'ya yaptıran kurum mağazasını onunla yönetiyor ve giriş
  adresine ihtiyacı var. Bu yüzden PRODUCT_APPS'te değil — orada olsaydı
  ürün listesine, hukuki metinlere ve llms.txt'ye kendiliğinden girerdi.
*/
export const ARC_APP = { name: "ArvoARC", url: "https://arc.arvo-os.com", host: "arc.arvo-os.com" } as const;

/*
  Hukuki metinler (mesafeli satış, iptal-iade, teslimat) tek bir ürünün değil
  Arvo'nun bütün abonelik ürünlerinin sözleşmesidir. Listeyi elle yazmıyoruz:
  yeni ürün PRODUCT_APPS'e eklendiğinde metinlere de kendiliğinden girsin.
*/
export const PRODUCT_NAMES: string[] = Object.values(PRODUCT_APPS).map((p) => p.name);

/** "ArvoOS, ArvoLab ve ArvoBook" — cümle içinde ürün listesi. */
export function productList(locale: Locale): string {
  const names = [...PRODUCT_NAMES];
  const last = names.pop()!;
  // Bağlaç dile göre (ve / and / und / y / et); Intl her dilin kuralını biliyor.
  return names.length ? new Intl.ListFormat(LOCALE_TAGS[locale], { type: "conjunction" }).format([...names, last]) : last;
}

/** Pazarlama sitesinin sunulduğu alan adları; diğer hostlarda (panel, kurum
 *  alan adları) bu sayfalar dizine alınmaz / arvo-os.com'a yönlendirilir. */
export const MARKETING_HOSTS = ["arvo-os.com", "www.arvo-os.com"] as const;

/** Şirket kimliği (Organization JSON-LD, alt bilgi, iletişim, gizlilik metni).
 *  Adres kullanıcı tarafından doğrulandı (2026-09-13); posta kodu şirket
 *  kaşesinden. Telefon verilmedi — doğrulanmamış bilgi EKLEMEYİN. */
export const COMPANY = {
  brand: "Arvo",
  legalName: "ArvoCulture Group Teknoloji Sanayi ve Ticaret Limited Şirketi",
  email: "info@arvo-os.com",
  country: "TR",
  city: "İstanbul",
  address: {
    streetAddress: "Yakuplu Mah. Hürriyet Bulvarı Skyport Residence No:1 D:113",
    district: "Beylikdüzü",
    city: "İstanbul",
    postalCode: "34524",
    country: "TR",
    /** Tek satır gösterim (alt bilgi, iletişim, gizlilik metni) */
    display: "Yakuplu Mah. Hürriyet Bulvarı Skyport Residence No:1 D:113, 34524 Beylikdüzü / İstanbul",
  },
  foundingYear: null as number | null,
  /* Sosyal hesap tek yerde: alt bilgideki bağlantı da, schema.org
     Organization'ın sameAs'ı da buradan okuyor (lib/site/structured-data).
     İki yere ayrı yazmak, hesap adı değişince birinin eski kalması
     demekti. */
  instagram: "arvoos.official",
  get instagramUrl() { return `https://www.instagram.com/${this.instagram}/`; },
  get sameAs(): string[] { return [this.instagramUrl]; },
  /*
    Künye alanları: mesafeli satış sözleşmesi ve ödeme kuruluşunun canlı mod
    incelemesi bunları arıyor. Boş bırakılan alan sayfalarda hiç gösterilmez —
    uydurulmuş bir vergi numarası göstermektense satırı hiç yazmamak doğru.
  */
  /* Kurum kaydındaki değerler (organizations: contact_phone, tax_office,
     tax_number, mersis_no). MERSİS kurum kaydında boştu, ticaret sicilinden
     alındı; 16 hane kuralı ve VKN ile uyumu doğrulandı. */
  phone: "+90 507 437 05 07",
  taxOffice: "Beylikdüzü",
  taxNumber: "0861785335",
  mersis: "0086178533500001",
} as const;

export function pathFor(id: PageId, locale: Locale): string {
  return ROUTES[id][locale];
}

export function absoluteUrl(path: string): string {
  return path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`;
}

/** hreflang eşlemesi: her dil + "x-default" (varsayılan dil, İngilizce). */
export function alternatesFor(id: PageId): Record<string, string> {
  return {
    ...Object.fromEntries(LOCALES.map((l) => [LOCALE_TAGS[l], absoluteUrl(ROUTES[id][l])])),
    "x-default": absoluteUrl(ROUTES[id][DEFAULT_LOCALE]),
  };
}

/** Verilen yolun hangi sayfa/dil olduğunu bulur (dil değiştirici, sitemap). */
export function resolvePath(path: string): { id: PageId; locale: Locale } | null {
  const clean = path.length > 1 ? path.replace(/\/+$/, "") : path;
  for (const id of Object.keys(ROUTES) as PageId[]) {
    for (const locale of LOCALES) {
      if (ROUTES[id][locale] === clean) return { id, locale };
    }
  }
  return null;
}
