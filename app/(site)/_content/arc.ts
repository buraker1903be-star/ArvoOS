// ArvoARC-İÇERİK: ArvoARC ile ilgili TÜM site metni burada (TR + EN).
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
    name: "ArvoARC", host: PRODUCT_APPS.arc.host, url: PRODUCT_APPS.arc.url,
    category: "E-ticaret ve mağaza yönetimi",
    eyebrow: "ArvoARC · E-ticaret ve mağaza yönetimi",
    title: "Ürünleriniz ve siparişleriniz.", subtitle: "Tek, sade bir panelde.",
    definition: "ArvoARC, e-ticaret siteleri ve mağazalar için ürün (katalog) yönetimini ve sipariş yönetimini tek panelde toplayan self servis bir SaaS hizmetidir.",
    short: "E-ticaret siteleri ve mağazalar için self servis ürün ve sipariş yönetimi.",
    audienceTitle: "ArvoARC kimler için?",
    audience: [
      { title: "E-ticaret işletmeleri", text: "Çevrim içi satış yapan, ürün bilgisini ve siparişleri tek yerden yönetmek isteyen ekipler." },
      { title: "Fiziksel mağazalar ve perakendeciler", text: "Mağaza ürünlerini ve siparişlerini düzenli bir panelde takip etmek isteyen işletmeler." },
      { title: "Büyüyen markalar", text: "Katalogu ve sipariş akışı büyüdükçe dağınık tablolar yerine tek bir düzen arayan markalar." },
    ],
    featuresTitle: "Mağazanın iki temel işi. Tek yerde.",
    featuresLead: "ArvoARC; katalog ve sipariş yönetimini aynı, sakin bir çalışma alanına taşır.",
    features: [
      { title: "Ürün (katalog) yönetimi", text: "Ürünlerinizi ve ürün bilgilerinizi tek bir katalogda düzenleyin." },
      { title: "Sipariş yönetimi", text: "Siparişleri aynı panelde görün ve takip edin." },
      { title: "Self servis kurulum", text: "Mağazalar ArvoARC’a kendileri kaydolur ve kurulumu kendileri yapar." },
      { title: "Bulut tabanlı", text: "Kurulum gerektirmez; tarayıcıda çalışır." },
      { title: "Her mağazaya kendi alanı", text: "Çok kiracılı yapı: her mağaza kendi çalışma alanında çalışır." },
    ],
    howTitle: "ArvoARC nasıl çalışır?",
    how: [
      { title: "Kaydolun", text: `Mağazanız için ${PRODUCT_APPS.arc.host} üzerinden hesabınızı oluşturun.` },
      { title: "Katalogunuzu kurun", text: "Ürünlerinizi ve ürün bilgilerinizi panele ekleyin." },
      { title: "Siparişleri yönetin", text: "Siparişleri ürünlerinizle aynı yerde takip edin." },
    ],
    diffTitle: "ArvoARC ile ArvoOS arasındaki fark",
    diff: "ArvoOS bir şirketin operasyonunu (CRM, teklif, sözleşme, iş takibi, finans, İK) yönetir. ArvoARC ise e-ticaret ve mağazalar içindir: ürünleri ve siparişleri tek panelde yönetir.",
    faq: [
      { q: "ArvoARC nedir?", a: "ArvoARC, e-ticaret siteleri ve mağazalar için ürün (katalog) yönetimini ve sipariş yönetimini tek panelde toplayan self servis SaaS hizmetidir." },
      { q: "ArvoARC kimler için?", a: "E-ticaret işletmeleri, fiziksel mağazalar ve perakendeciler ile büyüyen markalar için." },
      { q: "ArvoARC’ı kullanmak için kurulum gerekir mi?", a: "Hayır. ArvoARC bulut tabanlıdır ve tarayıcıda çalışır; mağazalar kaydolup kurulumu kendileri yapar." },
      { q: "ArvoARC ile ArvoOS arasındaki fark nedir?", a: "ArvoOS bir şirketin operasyonunu yönetir: CRM, teklif, sözleşme, iş takibi, finans ve İK. ArvoARC ise mağazaların ürünlerini ve siparişlerini yönetir." },
      { q: "ArvoARC’a nereden giriş yapılır?", a: `ArvoARC ${PRODUCT_APPS.arc.url} adresinde çalışır.` },
    ],
    cardChips: ["Ürün kataloğu", "Sipariş yönetimi", "Self servis"],
  },
  en: {
    name: "ArvoARC", host: PRODUCT_APPS.arc.host, url: PRODUCT_APPS.arc.url,
    category: "E-commerce and store management",
    eyebrow: "ArvoARC · E-commerce & store management",
    title: "Your products and orders.", subtitle: "In one calm panel.",
    definition: "ArvoARC is a self-service SaaS platform for online stores and retail shops that brings product (catalog) management and order management into one panel.",
    short: "Self-service product and order management for online stores and retail shops.",
    audienceTitle: "Who is ArvoARC for?",
    audience: [
      { title: "E-commerce businesses", text: "Teams selling online that want product information and orders managed in one place." },
      { title: "Physical stores and retailers", text: "Shops that want their products and orders organized in a clear panel." },
      { title: "Growing brands", text: "Brands whose catalog and order flow have outgrown scattered spreadsheets." },
    ],
    featuresTitle: "A store’s two core jobs. In one place.",
    featuresLead: "ArvoARC brings catalog and order management into the same calm workspace.",
    features: [
      { title: "Product (catalog) management", text: "Organize your products and product information in a single catalog." },
      { title: "Order management", text: "See and follow orders in the same panel." },
      { title: "Self-service setup", text: "Stores sign up and set up ArvoARC themselves." },
      { title: "Cloud-based", text: "Nothing to install — it runs in the browser." },
      { title: "A space for every store", text: "Multi-tenant by design: each store works in its own space." },
    ],
    howTitle: "How does ArvoARC work?",
    how: [
      { title: "Sign up", text: `Create your store’s account at ${PRODUCT_APPS.arc.host}.` },
      { title: "Set up your catalog", text: "Add your products and product information to the panel." },
      { title: "Manage orders", text: "Follow orders right next to your products." },
    ],
    diffTitle: "ArvoARC vs. ArvoOS",
    diff: "ArvoOS runs a company’s operations (CRM, proposals, contracts, jobs, finance, HR). ArvoARC is built for e-commerce and stores: managing products and orders in one panel.",
    faq: [
      { q: "What is ArvoARC?", a: "ArvoARC is a self-service SaaS platform for online stores and retail shops that brings product (catalog) management and order management into one panel." },
      { q: "Who is ArvoARC for?", a: "E-commerce businesses, physical stores and retailers, and growing brands." },
      { q: "Do I need to install anything?", a: "No. ArvoARC is cloud-based and runs in the browser; stores sign up and set it up themselves." },
      { q: "What is the difference between ArvoARC and ArvoOS?", a: "ArvoOS runs a company’s operations: CRM, proposals, contracts, jobs, finance and HR. ArvoARC manages a store’s products and orders." },
      { q: "Where do I sign in to ArvoARC?", a: `ArvoARC runs at ${PRODUCT_APPS.arc.url}.` },
    ],
    cardChips: ["Product catalog", "Order management", "Self-service"],
  },
};

// ArvoARC ürün sayfası: yukarıdaki içerikten, ürün şablonunun şekline eşlenir.
const PAGE_LABELS: Record<Locale, { metaTitle: string; demo: string; open: string; features: string; flow: string; faq: string; ctaEyebrow: string; ctaTitle: string; ctaLead: string }> = {
  tr: { metaTitle: "ArvoARC — E-ticaret ve Mağaza Yönetimi", demo: "Bilgi alın", open: "ArvoARC’ı açın", features: "Özellikler", flow: "Nasıl çalışır?", faq: "ArvoARC hakkında", ctaEyebrow: "ArvoARC", ctaTitle: "Mağazanızı ArvoARC ile düzene sokun.", ctaLead: "ArvoARC’ı hemen açın ya da sorularınız için ekibimize yazın." },
  en: { metaTitle: "ArvoARC — E-commerce & Store Management", demo: "Ask us about ArvoARC", open: "Open ArvoARC", features: "Features", flow: "How it works", faq: "About ArvoARC", ctaEyebrow: "ArvoARC", ctaTitle: "Bring order to your store with ArvoARC.", ctaLead: "Open ArvoARC now, or write to our team with any questions." },
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
    band: { eyebrow: "ArvoARC · ArvoOS", title: c.diffTitle, lead: c.diff, items: [] },
    faq: { title: l.faq, items: c.faq },
    cta: { eyebrow: l.ctaEyebrow, title: l.ctaTitle, lead: l.ctaLead, actions },
  };
}
