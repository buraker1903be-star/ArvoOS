// ArvoOS product page — English. Features follow the verified 13-group
// inventory in lib/site/llms.ts. No payment provider names.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import { HOME_EN } from "./home-en";
import type { ProductContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;

export const ARVOOS_EN: ProductContent = {
  id: "arvoos",
  name: "ArvoOS",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.arvoos.url,
  featureList: ["CRM and sales pipeline", "Proposals with online acceptance", "E-signed contracts and A4 PDF", "Document centre", "Operations, Gantt and calendar", "Customer tracking portal", "Current accounts, instalments and online payment links", "HR and commissions", "Reports and profitability", "Team messaging and notifications", "Role × module permission matrix", "Custom domain and branding", "Installable PWA"],
  meta: {
    title: "ArvoOS — Business Operating System",
    description: "ArvoOS is a multi-tenant business operating system that connects CRM, proposals with online acceptance, e-signed contracts, operations, a customer portal, finance, HR and reports in one flow.",
  },
  hero: {
    eyebrow: "ArvoOS · Business operating system",
    title: "Your whole business.", subtitle: "One flow.",
    lead: "ArvoOS is a multi-tenant, web-based business operating system that runs service businesses and institutions from the first customer request to the final payment in one connected flow.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Sign in", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "What does ArvoOS do?",
    title: "You’re in control. Chaos stays behind.",
    lead: "Bring scattered spreadsheets, disconnected tools and invisible responsibilities into one organized way of working.",
    items: [
      { title: "Proposals", text: "Revisions, VAT options and payment plans; customers accept online in one click.", size: "hero", visual: "s1" },
      { title: "CRM & sales", text: "Pipeline stages, automatic customer history, instant customer lookup and a sales calendar." },
      { title: "E-signed contracts", text: "Templates, drawn signatures and consent statements; content locks after signing, with A4 PDF output." },
      { title: "Operations", text: "Jobs table, Gantt chart, calendar, tasks and owners. Signing starts the workflow automatically." },
      { title: "Finance", text: "Current accounts, instalment plans, online payment links, invoices and per-job profitability." },
      { title: "Customer tracking portal", text: "Customers follow progress, documents and a payment summary on a branded page with a tracking code.", size: "hero", alt: true, visual: "s4" },
      { title: "Human resources", text: "Staff, roles, commission calculation, activity logs and e-signed confidentiality agreements." },
      { title: "Reports", text: "Sales funnel with the weakest step flagged, real profitability, trends and lost reasons." },
      { title: "Communication", text: "Team messaging, a notification centre, management announcements and support tickets.", size: "wide" },
    ],
  },
  flow: {
    eyebrow: "From request to payment",
    title: "Enter it once. Ready at every step.",
    lead: HOME_EN.story.lead,
    steps: HOME_EN.story.steps,
    cta: { label: "See all modules", href: R("arvoos-modules"), variant: "primary" },
  },
  audience: {
    eyebrow: "Who is it for?",
    title: "For every team that sells, delivers and gets paid.",
    lead: "Service businesses and institutions that run sales, delivery and collection across several people, teams or branches.",
    more: "Configured by industry",
    items: [
      { title: "Healthcare institutions", text: "Client requests, appointments, teams and collections in one order.", href: R("arvoos-industries") },
      { title: "Education institutions", text: "From applicant to enrolment, payment plan to paperwork.", href: R("arvoos-industries") },
      { title: "Consulting & services", text: "Turn requests into planned, measurable and profitable projects.", href: R("arvoos-industries") },
      { title: "Multi-branch businesses", text: "Keep central standards while every team moves faster.", href: R("arvoos-industries") },
    ],
  },
  band: {
    eyebrow: "Under your brand",
    title: "Your domain. Your brand.",
    lead: "Every organization works in its own isolated workspace — from the sign-in screen to the final document, your customers see only your brand.",
    items: [
      "Custom domain verified via DNS",
      "Branded sign-in and customer pages",
      "Logo, brand colour, stamp and signature",
      "Legal and bank details filled into proposals and contracts",
      "Role × module permissions and audit history",
      "Installable PWA that works like a mobile app",
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "About ArvoOS",
    items: [
      { q: "What is ArvoOS?", a: "ArvoOS is Arvo’s web-based, multi-tenant business operating system. It connects CRM and sales, proposals, e-signed contracts, operations, a customer tracking portal, finance, HR, reports and team communication in one flow." },
      { q: "How does ArvoOS take a job from request to payment?", a: "A request enters the pipeline and becomes a proposal; the customer accepts it online and signs the contract electronically. Signing starts the job workflow, the customer follows progress in the portal, and instalments are collected through online payment links." },
      { q: "Does ArvoOS support electronic signatures?", a: "Yes. Customers sign with a drawn signature and consent statements; the IP address, timestamp, device and a verification hash are recorded, and the content locks after signing." },
      { q: "Can ArvoOS run on our own domain with our branding?", a: "Yes. You can connect a custom domain verified via DNS and use your logo, brand colour, stamp and signature on sign-in pages, customer pages, proposals and contracts." },
      { q: "Does ArvoOS work on mobile?", a: "Yes. It can be installed as a PWA and works like a mobile app, with a bottom tab bar and bottom sheets." },
      { q: "How much does ArvoOS cost?", a: "There is no public price list. Plans are scoped with each organization based on modules, number of users and branch structure." },
    ],
  },
  cta: {
    eyebrow: "A demo for your organization",
    title: "Let’s design how ArvoOS will work for your business.",
    lead: "Tell us about your needs — we’ll show you ArvoOS through your own workflows.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "See plans", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
