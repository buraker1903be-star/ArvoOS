// ArvoOS Modules — English. 13 groups = verified inventory in llms.ts.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;

export const MODULES_EN: SubContent = {
  id: "arvoos-modules",
  parent: { id: "arvoos", name: "ArvoOS" },
  meta: {
    title: "ArvoOS Modules",
    description: "ArvoOS modules: CRM and sales, proposals, contracts, document centre, operations, customer tracking portal, finance, HR, reports, communication, governance, branding and mobile experience.",
  },
  hero: {
    eyebrow: "ArvoOS · Modules",
    title: "Not separate tools.", subtitle: "Modules that work together.",
    lead: "ArvoOS modules are 13 capability areas working on the same data: work that starts in one module moves to the next without anyone re-entering it.",
    actions: [{ label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" }],
  },
  cards: {
    eyebrow: "Capability areas",
    title: "Every corner of your business. One core.",
    lead: "Start with the modules you need; extend the system as your team and processes grow.",
    cols: "two", numbered: true,
    items: [
      { title: "CRM & sales", text: "The sales flow that turns requests into customers, and customers into revenue.", items: ["Staged pipeline with lost reasons", "Automatic customer history on new requests", "Instant customer lookup by phone or name", "Sales rep assignment and sales calendar"] },
      { title: "Proposals", text: "The commercial process, from drafting to acceptance.", items: ["Revisions; VAT included, excluded or exempt", "Single payment or instalment plan", "Share links via WhatsApp and e-mail", "Online acceptance recorded with date-time, IP and device"] },
      { title: "Contracts", text: "A signature-ready contract from a proposal in one step.", items: ["Contract templates", "E-signature with drawn signature and consent statements", "IP, timestamp, device and verification hash", "Content locked after signing, A4 PDF"] },
      { title: "Document centre", text: "Every deal’s documents on one timeline.", items: ["Request → proposal → contract → operations → payment", "Document access logs", "Preview and PDF"] },
      { title: "Operations", text: "Turn sold work into a flow your teams can deliver.", items: ["New, in-progress and due-soon jobs", "Jobs table, Gantt chart and job calendar", "Tasks, steps, owners and progress", "Workflow that starts on signature, plus archive"] },
      { title: "Customer tracking portal", text: "A branded page where your customer follows their own job.", items: ["Progress and stages via a tracking code", "Payment summary, proposal and contract documents", "Messaging with the operations team", "Payment-gated file delivery via short-lived secure links"] },
      { title: "Finance", text: "An up-to-date financial picture tied to sales and operations.", items: ["Current accounts and ledger entries", "Collections, refunds and extra services", "Instalment plans with an online payment link per instalment", "Invoices, per-job costs and real profitability"] },
      { title: "Human resources", text: "Team structure and staff processes in one order.", items: ["Staff, departments and e-mail invitations", "Roles and commissions with rate history", "Staff activity and session logs", "E-signed staff confidentiality agreements (NDA)"] },
      { title: "Reports", text: "Turn data from every module into decisions.", items: ["Sales funnel with the weakest step flagged", "Sales and real profitability", "Six-month trends and lost reasons", "Print and PDF"] },
      { title: "Communication", text: "Team conversations right next to the work.", items: ["Direct messages with attachments", "Notification centre with a live counter", "Management announcements", "Support centre"] },
      { title: "Governance & security", text: "Who sees what — clear and auditable.", items: ["Role × module permission matrix", "Record-level access", "Row-level security in the database", "Audit history"] },
      { title: "Multi-tenant & branding", text: "Every organization in its own space, under its own brand.", items: ["Isolated workspace per organization", "Custom domain with DNS verification", "Logo, brand colour, stamp and signature", "Legal and bank details filled into documents"] },
      { title: "Experience", text: "Powerful on desktop, as easy as an app on your phone.", items: ["Installable PWA", "Bottom tab bar and bottom sheets", "Dark and light themes", "Turkish interface"] },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "About the modules",
    items: [
      { q: "Which modules does ArvoOS include?", a: "CRM and sales, proposals, contracts, document centre, operations, customer tracking portal, finance, human resources, reports and communication — supported by governance, branding and a mobile experience." },
      { q: "How are the modules connected?", a: "They all work on the same data: an accepted proposal becomes a contract in one step, a signed contract automatically becomes a job workflow, and payments and profitability stay tied to the same job." },
      { q: "Do we have to use every module?", a: "No. Your plan is built around the modules you need and can be extended as the system grows." },
      { q: "Who can see which module?", a: "That is set by the role × module permission matrix; roles such as sales reps can be limited to their own records." },
    ],
  },
  cta: {
    title: "Let’s decide which modules to start with.",
    actions: [
      { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Plans", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
