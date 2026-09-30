// arvo-os.com yapılandırılmış veri (schema.org JSON-LD) sözleşmesi.
// Sayfalar yalnızca bu yardımcıları çağırır; SEO/GEO ajanı içeriği
// zenginleştirebilir ama İMZALARI DEĞİŞTİRMEZ.
import { COMPANY, PRODUCT_APPS, ROUTES, SITE_ORIGIN, absoluteUrl, LOCALE_TAGS, resolvePath, type Locale } from "./routes";
import { KDV_HARIC, PARA_BIRIMI, PRICED_PRODUCTS, YILLIK_ODENEN_AY, ldFiyat, planlar, urunAdi, urunAdresi, yillikKurus } from "./pricing";

type Json = Record<string, unknown>;

const LOGO_ID = `${SITE_ORIGIN}/#logo`;

/** Sayfanın /og/{locale}/{id} paylaşım görseli (yol ROUTES'ta yoksa null). */
function ogImageFor(path: string): Json | null {
  const page = resolvePath(path);
  if (!page) return null;
  return { "@type": "ImageObject", url: absoluteUrl(`/og/${page.locale}/${page.id}`), width: 1200, height: 630 };
}

/** <script type="application/ld+json"> — birden çok nesne dizi olarak verilebilir. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  const payload = Array.isArray(data) ? { "@context": "https://schema.org", "@graph": data } : { "@context": "https://schema.org", ...data };
  // "<" kaçışı: içerikteki </script> dizisi betiği kapatamasın
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(payload).replace(/</g, "\\u003c") }} />;
}

export const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${SITE_ORIGIN}/#website`;

export function organizationLd(): Json {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: COMPANY.brand,
    legalName: COMPANY.legalName,
    url: SITE_ORIGIN,
    email: COMPANY.email,
    alternateName: ["ArvoCulture Group", "ArvoCulture"],
    logo: { "@type": "ImageObject", "@id": LOGO_ID, url: absoluteUrl("/icon-512.png"), contentUrl: absoluteUrl("/icon-512.png"), width: 512, height: 512, caption: COMPANY.brand },
    image: { "@id": LOGO_ID },
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address.streetAddress,
      addressLocality: COMPANY.address.district,
      addressRegion: COMPANY.address.city,
      postalCode: COMPANY.address.postalCode,
      addressCountry: COMPANY.address.country,
    },
    // Telefon yok; yalnızca e-posta.
    contactPoint: [
      { "@type": "ContactPoint", contactType: "sales", email: COMPANY.email, availableLanguage: ["tr", "en"] },
      { "@type": "ContactPoint", contactType: "customer support", email: COMPANY.email, availableLanguage: ["tr", "en"] },
    ],
    brand: [
      { "@type": "Brand", name: PRODUCT_APPS.arvoos.name, url: absoluteUrl(ROUTES.arvoos.tr) },
      { "@type": "Brand", name: PRODUCT_APPS.arvolab.name, url: absoluteUrl(ROUTES.arvolab.tr) },
      { "@type": "Brand", name: PRODUCT_APPS.arc.name, url: absoluteUrl(ROUTES.arc.tr) },
      { "@type": "Brand", name: PRODUCT_APPS.randevu.name, url: absoluteUrl(ROUTES.randevu.tr) },
    ],
    knowsAbout: [
      "Business operating system",
      "Customer relationship management (CRM)",
      "Proposal and contract management",
      "Electronic signature",
      "Operations and workflow management",
      "Research workspace software",
      "Academic writing",
      "E-commerce product and order management",
      "Appointment scheduling for salons",
      "Web design",
      "Search engine optimization (SEO)",
      "Generative engine optimization (GEO)",
      "Custom software development",
    ],
    ...(COMPANY.foundingYear ? { foundingDate: String(COMPANY.foundingYear) } : {}),
    ...(COMPANY.sameAs.length ? { sameAs: COMPANY.sameAs } : {}),
  };
}

export function websiteLd(locale: Locale): Json {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_ORIGIN,
    name: COMPANY.brand,
    inLanguage: LOCALE_TAGS[locale],
    publisher: { "@id": ORGANIZATION_ID },
  };
}

/** Yazılım ürünü (ArvoOS, ArvoLab, ArvoARC). Fiyat bilgisi uydurulmaz. */
export function productLd(p: {
  name: string;
  description: string;
  path: string;
  appUrl: string;
  category: string;
  locale: Locale;
  features?: string[];
}): Json {
  return {
    "@type": "SoftwareApplication",
    "@id": `${absoluteUrl(p.path)}#software`,
    name: p.name,
    description: p.description,
    url: absoluteUrl(p.path),
    applicationCategory: p.category,
    operatingSystem: "Web",
    inLanguage: LOCALE_TAGS[p.locale],
    installUrl: p.appUrl,
    brand: { "@type": "Brand", name: p.name },
    publisher: { "@id": ORGANIZATION_ID },
    ...(ogImageFor(p.path) ? { image: ogImageFor(p.path) } : {}),
    ...(p.features?.length ? { featureList: p.features } : {}),
  };
}

export function serviceLd(s: { name: string; description: string; path: string; locale: Locale }): Json {
  return {
    "@type": "Service",
    name: s.name,
    description: s.description,
    url: absoluteUrl(s.path),
    inLanguage: LOCALE_TAGS[s.locale],
    provider: { "@id": ORGANIZATION_ID },
    areaServed: "TR",
  };
}

/** SSS — GEO için kısa, net cevaplar (yapay zekâ motorları alıntılar). */
export function faqLd(items: { q: string; a: string }[]): Json {
  return {
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]): Json {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}

export function webPageLd(p: { name: string; description: string; path: string; locale: Locale }): Json {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(p.path)}#webpage`,
    url: absoluteUrl(p.path),
    name: p.name,
    description: p.description,
    inLanguage: LOCALE_TAGS[p.locale],
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORGANIZATION_ID },
    ...(ogImageFor(p.path) ? { primaryImageOfPage: ogImageFor(p.path) } : {}),
  };
}

/*
  Ücretler sayfasının teklif grafiği. Fiyatlar lib/site/pricing.ts'ten okunur;
  productLd'nin "fiyat uydurulmaz" kuralı bozulmaz — burada uydurma değil
  yayımlanan liste fiyatı vardır.

  `@id` ürün sayfasındaki SoftwareApplication ile AYNIDIR: iki sayfa aynı
  varlığı tanımlar, ayrı iki ürün değil. Bu yüzden burada yalnızca teklifler
  verilir; applicationCategory gibi alanlar ürün sayfasında kalır, iki yerde
  farklı değer yazmak birleştirmeyi bozar.
*/
export function pricingLd(locale: Locale): Json[] {
  const sayfa = absoluteUrl(ROUTES.pricing[locale]);
  return PRICED_PRODUCTS.map((product) => {
    const { href, external } = urunAdresi(product, locale);
    const url = external ? href : absoluteUrl(href);
    const teklifler = planlar(product).flatMap((plan) => {
      const yillik = yillikKurus(plan);
      if (plan.aylikKurus === null || yillik === null) return [];
      const ortak = { priceCurrency: PARA_BIRIMI, valueAddedTaxIncluded: !KDV_HARIC };
      return [{
        "@type": "Offer",
        sku: plan.code,
        name: `${urunAdi(product)} ${plan.ad[locale]}`,
        url: sayfa,
        price: ldFiyat(plan.aylikKurus),
        availability: "https://schema.org/InStock",
        ...ortak,
        // Koltuk başı basamaklarda fiyatın neyin başına olduğu yazılmalı;
        // yazılmazsa arama motoru 1.990 TL'yi kurumun toplam bedeli sanır.
        ...(plan.kisiBasi ? { referenceQuantity: { "@type": "QuantitativeValue", value: 1, unitText: "user" } } : {}),
        ...(plan.enAzKullanici ? { eligibleQuantity: { "@type": "QuantitativeValue", minValue: plan.enAzKullanici, unitText: "user" } } : {}),
        priceSpecification: [
          { "@type": "UnitPriceSpecification", price: ldFiyat(plan.aylikKurus), ...ortak, billingDuration: 1, billingIncrement: 1, unitCode: "MON" },
          // Yıllık bedel 10 aylık: billingDuration 12 ay, tutar dönem başında tek seferde.
          { "@type": "UnitPriceSpecification", price: ldFiyat(yillik), ...ortak, billingDuration: 12, billingIncrement: YILLIK_ODENEN_AY, unitCode: "MON" },
        ],
      }];
    });
    return {
      "@type": "SoftwareApplication",
      "@id": `${url}#software`,
      name: urunAdi(product),
      url,
      publisher: { "@id": ORGANIZATION_ID },
      ...(teklifler.length ? { offers: teklifler } : {}),
    };
  });
}
