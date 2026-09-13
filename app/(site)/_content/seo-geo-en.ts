// SEO & GEO — English. No ranking / traffic promises.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;
const talk = { label: "Let’s review your site", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SEO_GEO_EN: SubContent = {
  id: "seo-geo",
  parent: { id: "services", name: "Services" },
  meta: { title: "SEO & GEO Content", description: "Arvo SEO & GEO: technical SEO, content architecture, structured data (JSON-LD), llms.txt, content AI answer engines can cite, multilingual setup and performance." },
  hero: {
    eyebrow: "Services · SEO & GEO", title: "Be found when searched.", subtitle: "Be explained when asked.",
    lead: "SEO & GEO content work makes sure your site is indexed correctly by search engines, and understood and citable by AI answer engines such as ChatGPT, Perplexity and Google AI Overviews.",
    actions: [talk, { label: "All services", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "What we do", title: "One foundation for search and AI.",
    lead: "GEO (generative engine optimization) gives your content the clarity, structure and verifiability it needs to be used as a source in AI answers.",
    numbered: true,
    items: [
      { title: "Technical SEO", text: "Crawlability, indexing, sitemaps, robots, canonicals and redirects." },
      { title: "Content architecture", text: "Page hierarchy, clear headings, and every page answering one question well." },
      { title: "Structured data", text: "schema.org JSON-LD for your organization, products, services, FAQs and breadcrumbs." },
      { title: "llms.txt", text: "A machine-readable index that gives AI assistants a summary of your site and its key pages." },
      { title: "Citable content", text: "One-sentence definitions and short, factual FAQs — verifiable, with no invented claims." },
      { title: "Multilingual & performance", text: "Language pairing with hreflang; fast, stable pages built around Core Web Vitals." },
    ],
  },
  steps: {
    eyebrow: "Process", title: "From audit to continuous improvement.",
    items: [
      { title: "Audit", text: "We review your technical setup, content structure and current visibility." },
      { title: "Strategy & content architecture", text: "We define target questions, page hierarchy and priorities." },
      { title: "Technical implementation", text: "We implement sitemaps, structured data, llms.txt, hreflang and performance improvements." },
      { title: "Content editing", text: "We rework copy with clear definitions, question-led headings and short answers." },
      { title: "Measure & improve", text: "We keep going with search console data and regular checks." },
    ],
  },
  band: {
    eyebrow: "In practice", title: "This site was built the same way.",
    lead: "arvo-os.com was built with structured data, llms.txt, hreflang and question-led content.",
    items: ["schema.org JSON-LD on every page", "llms.txt and llms-full.txt", "Turkish–English hreflang pairs", "Pages that open with a definition, plus short FAQs"],
  },
  note: "Search engines and AI services decide with their own algorithms; no specific ranking, traffic or citation is promised.",
  faq: { eyebrow: "FAQ", title: "About SEO & GEO", items: [
    { q: "What is GEO?", a: "GEO (generative engine optimization) is the work of making content understood correctly — and citable as a source — by AI answer engines such as ChatGPT, Perplexity and Google AI Overviews." },
    { q: "What is the difference between SEO and GEO?", a: "SEO focuses on indexing and visibility in search results; GEO on accurate, citable information in AI answers. Both rest on the same solid technical and content foundation." },
    { q: "What is llms.txt?", a: "A plain-text file published at the site root that gives AI assistants a short summary of the site and its key pages." },
    { q: "Do you guarantee rankings?", a: "No. No specific ranking, traffic or citation is promised; we build the right technical foundation and content structure." },
    { q: "Can this be applied to my existing site?", a: "Yes. We start with an audit; technical and content improvements can usually be applied to an existing site." },
  ] },
  cta: { title: "Let’s make your site found when searched — and explained when asked.", actions: [talk, { label: "Web design", href: R("web-design"), variant: "ghost" }] },
  serviceName: "SEO and GEO content",
};
