// Home page — English.
import { COMPANY, PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { HomeContent } from "./home";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;

export const HOME_EN: HomeContent = {
  meta: {
    title: "Arvo | ArvoOS, ArvoLab and Arc — better systems for better work",
    description: "Arvo builds ArvoOS for businesses, ArvoLab for researchers and Arc for stores — and delivers web design, SEO & GEO and custom software services.",
  },
  hero: {
    eyebrow: "The Arvo product family",
    title: "Better systems", subtitle: "for better work.",
    lead: "Arvo is a software brand that builds ArvoOS for businesses, ArvoLab for researchers and Arc for stores. It turns complex work into calm, powerful and connected experiences.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Explore the products", href: "#products", variant: "ghost" },
    ],
    familyLabel: "Arvo products",
  },
  statement: ["Complexity stays in the background.", "All that’s left is progress.", "Every Arvo product follows one principle:", "even the most demanding process should feel natural."],
  products: {
    eyebrow: "The product family",
    title: "Powerful today. Ready for tomorrow.",
    lead: "Three products, each an expert in its field. Together, an ecosystem that covers the way you work.",
    os: {
      label: "Business operating system", title: "Your whole business. One flow.",
      text: "From CRM and sales to e-signed contracts, from operations to finance, HR and reporting — every step connected in a single system.",
      chips: ["CRM & sales", "Proposals & e-signature", "Operations", "Customer portal", "Finance", "HR & reports"],
      cta: { label: "Explore ArvoOS", href: R("arvoos"), variant: "gold" },
      signIn: { label: "Sign in", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    },
    lab: {
      label: "Research workspace", title: "A stronger workspace for research.",
      text: "From literature to academic writing, from guideline checks to analysis — the core steps of research in one calm workspace.",
      chips: ["Literature & citations", "Academic writing", "Guideline checks", "Analysis"],
      cta: { label: "Explore ArvoLab", href: R("arvolab"), variant: "primary" },
      signIn: { label: "Sign in", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    },
    arcCta: { label: "Explore Arc", href: R("arc"), variant: "gold" },
    arcSignIn: { label: "Sign in", href: PRODUCT_APPS.arc.url, external: true, variant: "ghost" },
  },
  band: {
    words: ["CRM", "Proposals", "E-signature", "Operations", "Customer portal", "Finance", "People", "Reports"],
    caption: "One core. Thirteen connected capability areas.",
  },
  story: {
    eyebrow: "ArvoOS",
    title: "From request to payment. One flow.",
    lead: "Data entered once travels through every step on its own. Nobody types the same thing twice.",
    cta: { label: "See the modules", href: R("arvoos-modules"), variant: "primary" },
    steps: [
      { title: "Request", text: "A request lands in the CRM pipeline; the customer’s history appears automatically and a sales rep is assigned." },
      { title: "Proposal", text: "A proposal with VAT options and a payment plan is shared via WhatsApp or e-mail; the customer accepts it online in one click." },
      { title: "E-signature", text: "The accepted proposal becomes a contract in one step; the customer signs with a drawn signature. The content locks with a timestamp and verification hash." },
      { title: "Workflow", text: "Signing starts the job workflow automatically: tasks, owners, due dates, a Gantt chart and a calendar." },
      { title: "Tracking portal", text: "With a tracking code, the customer follows progress and documents on a branded page, and messages your team." },
      { title: "Online payment", text: "Instalments are collected through online payment links; deliverables stay locked until payment." },
      { title: "Reports", text: "Sales funnel, the weakest step and real profitability per job — on one screen." },
    ],
  },
  eco: {
    eyebrow: "Ecosystem",
    title: "Three products. One ecosystem.",
    lead: "ArvoOS, ArvoLab and Arc are separate web applications, each on its own arvo-os.com subdomain, built by the same team to one brand and quality standard.",
    roles: ["Operations", "Research", "Stores"],
    principles: [
      { title: "A space of your own", text: "Every organization, team or store works in its own workspace." },
      { title: "One design language", text: "The same calm interface and the same care, in every product." },
      { title: "Products that grow with you", text: "As your organization grows, the product family grows with it." },
    ],
  },
  values: {
    eyebrow: "Our principles",
    title: "How we design.",
    items: [
      { title: "Simple.", text: "Nothing unnecessary. Everything you need, exactly where it belongs." },
      { title: "Powerful.", text: "Reliable, controlled and scalable foundations for critical work." },
      { title: "Whole.", text: "A seamless way of working across products, teams and data." },
    ],
  },
  services: {
    eyebrow: "Services",
    title: "The team behind our products builds for you, too.",
    lead: "From websites to custom software, we bring your brand and your processes to their strongest digital form.",
    items: [
      { tag: "Design & development", title: "Web design", text: "Strategy, content architecture, UX/UI design, development and launch in one process.", href: R("web-design") },
      { tag: "Visibility", title: "SEO & GEO", text: "Content and technical foundations that search engines and AI answer engines understand — and can cite.", href: R("seo-geo") },
      { tag: "Software", title: "Custom software", text: "Tailored panels, portals and workflow software; integrations and automation.", href: R("custom-software") },
    ],
    more: "Learn more",
    cta: { label: "All services", href: R("services"), variant: "ghost" },
  },
  refs: { eyebrow: "References", title: "Brands we build with.", lead: "A family of brands that share the same standard of quality, and create value together.", culture: "About the group", akademik: "Visit the website" },
  faq: {
    eyebrow: "FAQ",
    title: "Questions about Arvo",
    items: [
      { q: "What is Arvo?", a: `Arvo is the software brand of ${COMPANY.legalName}. It builds ArvoOS for businesses, ArvoLab for researchers and Arc for stores, and also offers web design and custom software services.` },
      { q: "What is the difference between ArvoOS, ArvoLab and Arc?", a: "ArvoOS runs a business’s operations from request to payment. ArvoLab supports academic research and writing. Arc brings a store’s products and orders into one panel." },
      { q: "Where do I sign in to Arvo products?", a: `ArvoOS runs at ${PRODUCT_APPS.arvoos.host}, ArvoLab at ${PRODUCT_APPS.arvolab.host} and Arc at ${PRODUCT_APPS.arc.host}. All three are web applications that run in the browser.` },
      { q: "How much does ArvoOS cost?", a: "There is no public price list. Plans are scoped with each organization based on modules, number of users and branch structure." },
      { q: "How do I request a demo?", a: `Fill in the form on the contact page or write to ${COMPANY.email}; your request goes to the relevant product team.` },
    ],
  },
  cta: {
    eyebrow: "A demo for your organization",
    title: "Let’s build the systems of tomorrow, together.",
    lead: "Let us show you how ArvoOS, ArvoLab or Arc would work for you.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Meet us", href: R("about"), variant: "ghost" },
    ],
    note: "or write to us directly:",
  },
};
