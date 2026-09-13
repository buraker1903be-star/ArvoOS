// ARC-İÇERİK: Arc ile ilgili TÜM site metni burada (TR + EN).
// Kaynak: kullanıcının verdiği tanım (lead ajan → lib/site/llms.ts ile aynı):
// e-ticaret siteleri ve mağazalar için ürün (katalog) + sipariş yönetimini tek
// panelde toplayan self servis SaaS; bulut tabanlı, tarayıcıda, çok kiracılı.
// Entegrasyon, ödeme, kargo, pazaryeri veya stok senkronu İDDİASI YAZMAYIN.
import { PRODUCT_APPS, ROUTES, type Locale } from "@/lib/site/routes";
import type { ProductContent } from "./types";

export type ArcContent = {
  name: string; host: string; url: string;
  category: string; eyebrow: string; title: string; subtitle: string; definition: string; short: string;
  audienceTitle: string; audience: { title: string; text: string }[];
  featuresTitle: string; featuresLead: string; features: { title: string; text: string }[];
  howTitle: string; how: { title: string; text: string }[];
  diffTitle: string; diff: string;
  faq: { q: string; a: string }[];
  cardChips: string[];
};

export const ARC_CONTENT: Record<Locale, ArcContent> = {
  tr: {
    name: "Arc", host: PRODUCT_APPS.arc.host, url: PRODUCT_APPS.arc.url,
    category: "E-ticaret ve mağaza yönetimi",
    eyebrow: "Arc · E-ticaret ve mağaza yönetimi",
    title: "Ürünleriniz ve siparişleriniz.", subtitle: "Tek, sade bir panelde.",
    definition: "Arc, e-ticaret siteleri ve mağazalar için ürün (katalog) yönetimini ve sipariş yönetimini tek panelde toplayan self servis bir SaaS hizmetidir.",
    short: "E-ticaret siteleri ve mağazalar için self servis ürün ve sipariş yönetimi.",
    audienceTitle: "Arc kimler için?",
    audience: [
      { title: "E-ticaret işletmeleri", text: "Çevrim içi satış yapan, ürün bilgisini ve siparişleri tek yerden yönetmek isteyen ekipler." },
      { title: "Fiziksel mağazalar ve perakendeciler", text: "Mağaza ürünlerini ve siparişlerini düzenli bir panelde takip etmek isteyen işletmeler." },
      { title: "Büyüyen markalar", text: "Katalogu ve sipariş akışı büyüdükçe dağınık tablolar yerine tek bir düzen arayan markalar." },
    ],
    featuresTitle: "Mağazanın iki temel işi. Tek yerde.",
    featuresLead: "Arc; katalog ve sipariş yönetimini aynı, sakin bir çalışma alanına taşır.",
    features: [
      { title: "Ürün (katalog) yönetimi", text: "Ürünlerinizi ve ürün bilgilerinizi tek bir katalogda düzenleyin." },
      { title: "Sipariş yönetimi", text: "Siparişleri aynı panelde görün ve takip edin." },
      { title: "Self servis kurulum", text: "Mağazalar Arc’a kendileri kaydolur ve kurulumu kendileri yapar." },
      { title: "Bulut tabanlı", text: "Kurulum gerektirmez; tarayıcıda çalışır." },
      { title: "Her mağazaya kendi alanı", text: "Çok kiracılı yapı: her mağaza kendi çalışma alanında çalışır." },
    ],
    howTitle: "Arc nasıl çalışır?",
    how: [
      { title: "Kaydolun", text: `Mağazanız için ${PRODUCT_APPS.arc.host} üzerinden hesabınızı oluşturun.` },
      { title: "Katalogunuzu kurun", text: "Ürünlerinizi ve ürün bilgilerinizi panele ekleyin." },
      { title: "Siparişleri yönetin", text: "Siparişleri ürünlerinizle aynı yerde takip edin." },
    ],
    diffTitle: "Arc ile ArvoOS arasındaki fark",
    diff: "ArvoOS bir şirketin operasyonunu (CRM, teklif, sözleşme, iş takibi, finans, İK) yönetir. Arc ise e-ticaret ve mağazalar içindir: ürünleri ve siparişleri tek panelde yönetir.",
    faq: [
      { q: "Arc nedir?", a: "Arc, e-ticaret siteleri ve mağazalar için ürün (katalog) yönetimini ve sipariş yönetimini tek panelde toplayan self servis SaaS hizmetidir." },
      { q: "Arc kimler için?", a: "E-ticaret işletmeleri, fiziksel mağazalar ve perakendeciler ile büyüyen markalar için." },
      { q: "Arc’ı kullanmak için kurulum gerekir mi?", a: "Hayır. Arc bulut tabanlıdır ve tarayıcıda çalışır; mağazalar kaydolup kurulumu kendileri yapar." },
      { q: "Arc ile ArvoOS arasındaki fark nedir?", a: "ArvoOS bir şirketin operasyonunu yönetir: CRM, teklif, sözleşme, iş takibi, finans ve İK. Arc ise mağazaların ürünlerini ve siparişlerini yönetir." },
      { q: "Arc’a nereden giriş yapılır?", a: `Arc ${PRODUCT_APPS.arc.url} adresinde çalışır.` },
    ],
    cardChips: ["Ürün kataloğu", "Sipariş yönetimi", "Self servis"],
  },
  en: {
    name: "Arc", host: PRODUCT_APPS.arc.host, url: PRODUCT_APPS.arc.url,
    category: "E-commerce and store management",
    eyebrow: "Arc · E-commerce & store management",
    title: "Your products and orders.", subtitle: "In one calm panel.",
    definition: "Arc is a self-service SaaS platform for online stores and retail shops that brings product (catalog) management and order management into one panel.",
    short: "Self-service product and order management for online stores and retail shops.",
    audienceTitle: "Who is Arc for?",
    audience: [
      { title: "E-commerce businesses", text: "Teams selling online that want product information and orders managed in one place." },
      { title: "Physical stores and retailers", text: "Shops that want their products and orders organized in a clear panel." },
      { title: "Growing brands", text: "Brands whose catalog and order flow have outgrown scattered spreadsheets." },
    ],
    featuresTitle: "A store’s two core jobs. In one place.",
    featuresLead: "Arc brings catalog and order management into the same calm workspace.",
    features: [
      { title: "Product (catalog) management", text: "Organize your products and product information in a single catalog." },
      { title: "Order management", text: "See and follow orders in the same panel." },
      { title: "Self-service setup", text: "Stores sign up and set up Arc themselves." },
      { title: "Cloud-based", text: "Nothing to install — it runs in the browser." },
      { title: "A space for every store", text: "Multi-tenant by design: each store works in its own space." },
    ],
    howTitle: "How does Arc work?",
    how: [
      { title: "Sign up", text: `Create your store’s account at ${PRODUCT_APPS.arc.host}.` },
      { title: "Set up your catalog", text: "Add your products and product information to the panel." },
      { title: "Manage orders", text: "Follow orders right next to your products." },
    ],
    diffTitle: "Arc vs. ArvoOS",
    diff: "ArvoOS runs a company’s operations (CRM, proposals, contracts, jobs, finance, HR). Arc is built for e-commerce and stores: managing products and orders in one panel.",
    faq: [
      { q: "What is Arc?", a: "Arc is a self-service SaaS platform for online stores and retail shops that brings product (catalog) management and order management into one panel." },
      { q: "Who is Arc for?", a: "E-commerce businesses, physical stores and retailers, and growing brands." },
      { q: "Do I need to install anything?", a: "No. Arc is cloud-based and runs in the browser; stores sign up and set it up themselves." },
      { q: "What is the difference between Arc and ArvoOS?", a: "ArvoOS runs a company’s operations: CRM, proposals, contracts, jobs, finance and HR. Arc manages a store’s products and orders." },
      { q: "Where do I sign in to Arc?", a: `Arc runs at ${PRODUCT_APPS.arc.url}.` },
    ],
    cardChips: ["Product catalog", "Order management", "Self-service"],
  },
};

// Arc ürün sayfası: yukarıdaki içerikten, ürün şablonunun şekline eşlenir.
const PAGE_LABELS: Record<Locale, { metaTitle: string; demo: string; open: string; features: string; flow: string; faq: string; ctaEyebrow: string; ctaTitle: string; ctaLead: string }> = {
  tr: { metaTitle: "Arc — E-ticaret ve Mağaza Yönetimi", demo: "Bilgi alın", open: "Arc’ı açın", features: "Özellikler", flow: "Nasıl çalışır?", faq: "Arc hakkında", ctaEyebrow: "Arc", ctaTitle: "Mağazanızı Arc ile düzene sokun.", ctaLead: "Arc’ı hemen açın ya da sorularınız için ekibimize yazın." },
  en: { metaTitle: "Arc — E-commerce & Store Management", demo: "Ask us about Arc", open: "Open Arc", features: "Features", flow: "How it works", faq: "About Arc", ctaEyebrow: "Arc", ctaTitle: "Bring order to your store with Arc.", ctaLead: "Open Arc now, or write to our team with any questions." },
};

export function arcPage(locale: Locale): ProductContent {
  const c = ARC_CONTENT[locale];
  const l = PAGE_LABELS[locale];
  const contact = `${ROUTES.contact[locale]}?${locale === "tr" ? "ilgi" : "interest"}=arc`;
  const actions = [
    { label: l.open, href: c.url, external: true, variant: "gold" as const },
    { label: l.demo, href: contact, variant: "ghost" as const },
  ];
  return {
    id: "arc", name: c.name, category: "BusinessApplication", appUrl: c.url,
    featureList: c.features.map((f) => f.title),
    meta: { title: l.metaTitle, description: c.definition },
    hero: { eyebrow: c.eyebrow, title: c.title, subtitle: c.subtitle, lead: c.definition, actions },
    features: { eyebrow: l.features, title: c.featuresTitle, lead: c.featuresLead, items: c.features },
    flow: { eyebrow: l.flow, title: c.howTitle, steps: c.how },
    audience: { title: c.audienceTitle, items: c.audience },
    band: { eyebrow: "Arc · ArvoOS", title: c.diffTitle, lead: c.diff, items: [] },
    faq: { title: l.faq, items: c.faq },
    cta: { eyebrow: l.ctaEyebrow, title: l.ctaTitle, lead: l.ctaLead, actions },
  };
}
