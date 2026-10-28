// Home page — English.
import { COMPANY, PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { HomeContent } from "./home";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;

export const HOME_EN: HomeContent = {
  meta: {
    title: "ArvoOS | Better systems for better work",
    description: "ArvoOS builds a business operating system for companies, ArvoLab for researchers and ArvoBook for salons — and delivers website and e-commerce design, SEO & GEO and custom software services.",
  },
  hero: {
    eyebrow: "The ArvoOS product family",
    title: "Better systems", subtitle: "for better work.",
    lead: "ArvoOS is a software brand: a business operating system for companies, ArvoLab for researchers and ArvoBook for salons. It turns complex work into calm, powerful and connected experiences.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Explore the products", href: "#products", variant: "ghost" },
    ],
    familyLabel: "ArvoOS products",
  },
  statement: ["Complexity stays in the background.", "All that’s left is progress.", "Every ArvoOS product follows one principle:", "even the most demanding process should feel natural."],
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
    book: {
      label: "Salon appointment management", title: "Keep the phone free of the appointment book.",
      text: "Customers pick the service, the stylist and the time themselves, and the booking lands in your calendar instantly. Per-staff calendars, working hours and time off, no double bookings.",
      chips: ["Online booking page", "Staff calendar", "Working hours & time off", "Customer records"],
      cta: { label: "Explore ArvoBook", href: R("randevu"), variant: "gold" },
      signIn: { label: "Sign in", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    },
  },
  global: {
    badges: ["6 languages", "USD · EUR · TRY", "Any browser, any device"],
    eyebrow: "Works everywhere",
    title: "Wherever you work.",
    lead: "ArvoOS products are web applications that run in the browser: nothing to install, no servers to run, the same system wherever your team is.",
    items: [
      { title: "Six languages", text: "English, Türkçe, Deutsch, Español, Français and العربية — including right-to-left." },
      { title: "Prices in USD, EUR and TRY", text: "A fixed list price in each currency; no amounts that drift with the exchange rate." },
      { title: "Any browser, any device", text: "The same experience on desktop, tablet and phone. Nothing to install on your servers." },
      { title: "Your data, your space", text: "Every organization works in its own separate space; roles decide who sees what." },
    ],
    from: "From {price}", perMonth: "/mo", perUserMonth: "/user/mo", onRequest: "On request",
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
      { title: "Workflow", text: "Signing starts the job workflow automatically: tasks, owners, due dates, a stage board and a calendar." },
      { title: "Tracking portal", text: "With a tracking code, the customer follows progress and documents on a branded page, and messages your team." },
      { title: "Online payment", text: "Instalments are collected through online payment links; deliverables stay locked until payment." },
      { title: "Reports", text: "Sales funnel, the weakest step and real profitability per job — on one screen." },
    ],
  },
  eco: {
    eyebrow: "Ecosystem",
    title: "Three products. One ecosystem.",
    lead: "ArvoOS, ArvoLab and ArvoBook are separate web applications, each on its own arvo-os.com subdomain, built by the same team to one brand and quality standard.",
    roles: ["Operations", "Research", "Salons"],
    principles: [
      { title: "A space of your own", text: "Every organization, team or salon works in its own workspace." },
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
    all: { title: "And more", text: "End-to-end digital services, from strategy to launch.", items: ["Process & experience design", "Corporate digital systems", "Ongoing development"] },
  },
  refs: { eyebrow: "References", title: "Brands we build with.", lead: "A family of brands that share the same standard of quality, and create value together.", culture: "Visit the website", akademik: "Visit the website" },
  faq: {
    eyebrow: "FAQ",
    title: "Questions about ArvoOS",
    items: [
      { q: "What is ArvoOS?", a: `ArvoOS is the software brand of ${COMPANY.legalName}. It builds the ArvoOS business operating system for companies, ArvoLab for researchers and ArvoBook for salons, and also offers website and e-commerce design and custom software services.` },
      { q: "What is the difference between ArvoOS, ArvoLab and ArvoBook?", a: "ArvoOS runs a business’s operations from request to payment. ArvoLab supports academic research and writing. ArvoBook runs a salon’s appointment book: customers book themselves and the calendar opens by staff member." },
      { q: "Where do I sign in to ArvoOS products?", a: `ArvoOS runs at ${PRODUCT_APPS.arvoos.host}, ArvoLab at ${PRODUCT_APPS.arvolab.host} and ArvoBook at ${PRODUCT_APPS.randevu.host}. All three are web applications that run in the browser.` },
      { q: "How much does ArvoOS cost?", a: `Monthly and annual list prices are published at ${ROUTES.pricing.en}; pricing is per organization, not per user. For Enterprise, the fee is scoped together with each organization.` },
      { q: "How do I request a demo?", a: `Fill in the form on the contact page or write to ${COMPANY.email}; your request goes to the relevant product team.` },
    ],
  },
  cta: {
    eyebrow: "A demo for your organization",
    title: "Let’s build the systems of tomorrow, together.",
    lead: "Let us show you how ArvoOS, ArvoLab or ArvoBook would work for you.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Meet us", href: R("about"), variant: "ghost" },
    ],
    note: "or write to us directly:",
  },
};
