// arvo-os.com pazarlama sitesinin rota sözleşmesi. Sayfalar, menüler,
// SEO (sitemap, hreflang, canonical, JSON-LD), llms.txt, yönlendirmeler ve
// demo formu bu TEK kaynaktan beslenir. Yeni sayfa eklerken önce buraya ekleyin.

export const SITE_ORIGIN = "https://arvo-os.com";

export const LOCALES = ["tr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "tr";
export const LOCALE_TAGS: Record<Locale, string> = { tr: "tr-TR", en: "en-US" };

export type PageId =
  | "home"
  | "arvoos"
  | "arvoos-modules"
  | "arvoos-industries"
  | "arvoos-solutions"
  | "arvoos-plans"
  | "arvolab"
  | "arc"
  | "services"
  | "web-design"
  | "seo-geo"
  | "custom-software"
  | "about"
  | "contact"
  | "privacy";

/** Her sayfanın dil başına yolu. Türkçe kökte, İngilizce /en altında. */
export const ROUTES: Record<PageId, Record<Locale, string>> = {
  home: { tr: "/", en: "/en" },
  arvoos: { tr: "/urunler/arvoos", en: "/en/products/arvoos" },
  "arvoos-modules": { tr: "/urunler/arvoos/moduller", en: "/en/products/arvoos/modules" },
  "arvoos-industries": { tr: "/urunler/arvoos/sektorler", en: "/en/products/arvoos/industries" },
  "arvoos-solutions": { tr: "/urunler/arvoos/cozumler", en: "/en/products/arvoos/solutions" },
  "arvoos-plans": { tr: "/urunler/arvoos/paketler", en: "/en/products/arvoos/plans" },
  arvolab: { tr: "/urunler/arvolab", en: "/en/products/arvolab" },
  arc: { tr: "/urunler/arc", en: "/en/products/arc" },
  services: { tr: "/hizmetler", en: "/en/services" },
  "web-design": { tr: "/hizmetler/web-sitesi-tasarimi", en: "/en/services/web-design" },
  "seo-geo": { tr: "/hizmetler/seo-ve-geo", en: "/en/services/seo-geo" },
  "custom-software": { tr: "/hizmetler/ozel-yazilim", en: "/en/services/custom-software" },
  about: { tr: "/hakkimizda", en: "/en/about" },
  contact: { tr: "/iletisim", en: "/en/contact" },
  privacy: { tr: "/gizlilik", en: "/en/privacy" },
};

/** Sitemap önceliği / değişim sıklığı (arama motorları için ipucu). */
export const PAGE_PRIORITY: Record<PageId, number> = {
  home: 1,
  arvoos: 0.9,
  arvolab: 0.9,
  arc: 0.9,
  "arvoos-modules": 0.8,
  "arvoos-industries": 0.7,
  "arvoos-solutions": 0.7,
  "arvoos-plans": 0.8,
  services: 0.7,
  "web-design": 0.7,
  "seo-geo": 0.7,
  "custom-software": 0.7,
  about: 0.6,
  contact: 0.7,
  privacy: 0.3,
};

/** Eski ArvoOS kurumsal sayfaları → yeni yerleri (kalıcı 301). */
export const LEGACY_REDIRECTS: { from: string; to: string }[] = [
  { from: "/urun", to: ROUTES.arvoos.tr },
  { from: "/moduller", to: ROUTES["arvoos-modules"].tr },
  { from: "/sektorler", to: ROUTES["arvoos-industries"].tr },
  { from: "/cozumler", to: ROUTES["arvoos-solutions"].tr },
  { from: "/paketler", to: ROUTES["arvoos-plans"].tr },
];

/** Ürünlerin kiracılı panelleri (giriş adresleri). */
export const PRODUCT_APPS = {
  arvoos: { name: "ArvoOS", url: "https://app.arvo-os.com/login", host: "app.arvo-os.com" },
  arvolab: { name: "ArvoLab", url: "https://lab.arvo-os.com", host: "lab.arvo-os.com" },
  arc: { name: "Arc", url: "https://arc.arvo-os.com", host: "arc.arvo-os.com" },
} as const;

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
  sameAs: [] as string[],
} as const;

export function pathFor(id: PageId, locale: Locale): string {
  return ROUTES[id][locale];
}

export function absoluteUrl(path: string): string {
  return path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`;
}

/** hreflang eşlemesi: { "tr-TR": url, "en-US": url, "x-default": tr url } */
export function alternatesFor(id: PageId): Record<string, string> {
  return {
    [LOCALE_TAGS.tr]: absoluteUrl(ROUTES[id].tr),
    [LOCALE_TAGS.en]: absoluteUrl(ROUTES[id].en),
    "x-default": absoluteUrl(ROUTES[id].tr),
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
