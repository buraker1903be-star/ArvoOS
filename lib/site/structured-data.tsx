// arvo-os.com yapılandırılmış veri (schema.org JSON-LD) sözleşmesi.
// Sayfalar yalnızca bu yardımcıları çağırır; SEO/GEO ajanı içeriği
// zenginleştirebilir ama İMZALARI DEĞİŞTİRMEZ.
import { COMPANY, PRODUCT_APPS, ROUTES, SITE_ORIGIN, absoluteUrl, LOCALE_TAGS, resolvePath, type Locale } from "./routes";

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

/** Yazılım ürünü (ArvoOS, ArvoLab, Arc). Fiyat bilgisi uydurulmaz. */
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
