/*
  Pricing page — English copy. NO NUMBERS here: amounts come from
  lib/site/pricing.ts, so the Turkish and English pages can never drift.
  Plan codes must match pricing.ts exactly (tests/unit/fiyatlandirma.test.ts
  fixes this).
*/
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { PricingContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;
const demo = { label: "Request a demo", href: `${R("contact")}?interest=pricing`, variant: "gold" as const };

export const PRICING_EN: PricingContent = {
  id: "pricing",
  meta: {
    title: "Pricing",
    description:
      "Subscription pricing for ArvoOS, ArvoARC, Arvo Randevu and ArvoLab: monthly and annual prices, what each plan includes, add-ons and subscription terms. Priced per organization, not per user.",
  },
  hero: {
    eyebrow: "Pricing",
    title: "Per organization,",
    subtitle: "not per seat.",
    lead: "Monthly and annual prices for all four products, written out in full. Your bill does not multiply as the team grows: plans are priced per organization and every card states how many users are included.",
    actions: [demo, { label: "Subscription terms", href: "#kosullar", variant: "ghost" }],
  },
  cycle: {
    monthly: "Monthly",
    yearly: "Annual",
    badge: "2 months free",
    perMonth: "/mo",
    perYear: "/yr",
    quote: "On request",
    quoteAction: "Request a quote",
  },
  vatNote:
    "All prices are in Turkish lira and exclude VAT. On the annual option you pay for 10 months and use 12; the amount is invoiced once at the start of the period.",

  groups: [
    {
      product: "arvoos",
      tag: "Business operating system",
      lead: "CRM, proposals, e-signed contracts, operations, finance, HR and reporting in one flow. Users are included in the plan.",
      linkLabel: "Explore ArvoOS",
      cards: [
        {
          code: "arvoos-baslangic",
          text: "For teams bringing customer, delivery and finance work into a single order.",
          items: ["5 users included", "Single branch", "CRM and sales pipeline", "Proposals and e-signed contracts", "Operations and task flow", "Finance and collection tracking", "Email support"],
        },
        {
          code: "arvoos-kurumsal",
          text: "For organizations running several teams or branches on connected processes.",
          items: ["25 users included", "Unlimited branches", "All modules", "Customer tracking portal", "Role × module permission matrix", "Advanced reporting", "Priority support"],
        },
        {
          code: "arvoos-ozel",
          text: "For organizations that want ArvoOS on their own operating model and brand.",
          items: ["Unlimited users", "Custom domain", "Custom workflows", "Branded customer experience", "Data migration and team training", "Implementation consulting"],
        },
      ],
    },
    {
      product: "arc",
      tag: "E-commerce and store management",
      lead: "Product (catalogue) and order management in one panel. Self-service setup; each store works in its own workspace.",
      linkLabel: "Explore ArvoARC",
      cards: [
        {
          code: "arc-baslangic",
          text: "For stores moving their catalogue and orders out of scattered spreadsheets.",
          items: ["Up to 500 products", "Single store", "3 users", "Product (catalogue) management", "Order management", "Email support"],
        },
        {
          code: "arc-buyume",
          text: "For brands with a growing catalogue that want to run on their own domain.",
          items: ["Up to 5,000 products", "Single store", "10 users", "Custom domain", "Product and order management", "Priority support"],
        },
        {
          code: "arc-olcek",
          text: "For businesses running several stores in the same order.",
          items: ["Unlimited products", "Up to 5 stores", "Unlimited users", "Custom domain", "Per-store permissions", "Priority support"],
        },
      ],
    },
    {
      product: "randevu",
      tag: "Appointment management",
      lead: "An online booking page, calendar and customer records for hair and beauty salons. Working hours are defined in Türkiye local time.",
      linkLabel: "Open Arvo Randevu",
      cards: [
        {
          code: "randevu-tek",
          text: "For salons at one address still tracking appointments by phone and notebook.",
          items: ["Single branch", "Up to 5 staff", "Online booking page", "Appointment calendar", "Customer records and history", "Email support"],
        },
        {
          code: "randevu-coklu",
          text: "For businesses that want a central view and per-branch permissions.",
          items: ["Up to 5 branches", "Unlimited staff", "Per-branch calendar and permissions", "Central reports", "Priority support"],
        },
        {
          code: "randevu-zincir",
          text: "For chains with more than five branches that want their own brand front.",
          items: ["Unlimited branches", "Custom domain", "Custom workflows", "Implementation and team training"],
        },
      ],
    },
    {
      product: "arvolab",
      tag: "Research workspace",
      lead: "Literature and citations, academic writing, guideline checks and analysis in one workspace.",
      linkLabel: "Explore ArvoLab",
      cards: [
        {
          code: "arvolab-arastirmaci",
          text: "For researchers carrying a thesis, paper or project on their own.",
          items: ["1 user", "Literature and citation management", "Academic writing", "Guideline checks", "Originality pre-check"],
        },
        {
          code: "arvolab-ekip",
          text: "For research teams that need a shared library and a shared writing order.",
          items: ["5 users", "Shared source library", "Analysis centre (quantitative and qualitative)", "Academic editor", "Priority support"],
        },
        {
          code: "arvolab-kurum",
          text: "For departments or universities deploying it more widely.",
          items: ["Department or institution-wide use", "In-house user management", "Custom domain", "Implementation and training"],
        },
      ],
    },
  ],

  addOns: {
    eyebrow: "Not included",
    title: "Items charged separately.",
    lead: "These apply when you pass a plan limit or ask for something specific to your organization. Nothing else is added to the invoice.",
    quote: "On request",
    items: [
      { code: "ek-kullanici", name: "Additional user", text: "For each user beyond the number included in an ArvoOS or ArvoLab plan." },
      { code: "ek-sube", name: "Additional branch", text: "For each branch beyond the five included in the Arvo Randevu Multi-branch plan." },
      { code: "veri-aktarimi", name: "Data migration and setup", text: "Moving data from your current system, defining users and training the team. Charged once, based on scope." },
      { code: "ozel-gelistirme", name: "Custom development", text: "A workflow, screen or report specific to your organization. Quoted once the scope is clear." },
    ],
  },

  policy: {
    eyebrow: "Subscription terms",
    title: "The rules behind the price.",
    lead: "These are the rules we actually apply; the full text is in the distance sales agreement and the cancellation and refund policy.",
    items: [
      { title: "No automatic charge", text: "Your card is never charged on its own. A payment link is sent for each period and you approve the payment." },
      { title: "Cancellation at period end", text: "You can cancel from the panel or by email. Cancellation takes effect at the end of the paid period; the service stays available until then." },
      { title: "Price changes", text: "Your current period is unaffected. Changes are announced by email at least 30 days in advance and apply from the next period only." },
      { title: "Upgrades and downgrades", text: "An upgrade takes effect the same day and only the remaining days of the period are charged. A downgrade applies at the end of the current period." },
      { title: "Cancelling an annual plan early", text: "The months you used are recalculated at the monthly list price and the remaining balance is refunded. The annual discount is only withdrawn for the unused months." },
      { title: "VAT and invoicing", text: "Listed amounts exclude VAT. An invoice is issued for each period and sent to your registered email address." },
    ],
    links: [
      { label: "Distance Sales Agreement", href: R("distance-sales"), variant: "ghost" },
      { label: "Cancellation and Refund Policy", href: R("refund"), variant: "ghost" },
      { label: "Delivery and Performance", href: R("delivery"), variant: "ghost" },
    ],
  },

  faq: {
    eyebrow: "Frequently asked questions",
    title: "About pricing",
    items: [
      { q: "Do the prices include VAT?", a: "No. Amounts on this page exclude VAT; VAT is added on the invoice at the rate in force." },
      { q: "Are we charged per user?", a: "No. Prices are per organization and each plan includes a set number of users. Beyond that number only the additional-user fee applies; the plan price does not multiply." },
      { q: "What does annual billing save?", a: "On the annual option you pay for 10 months and use 12 — two months free. The amount is invoiced once at the start of the period." },
      { q: "Does the subscription renew automatically?", a: "No. Your card is not charged automatically; a payment link is sent for each period and you approve the payment." },
      { q: "Can we change plan later?", a: "Yes. An upgrade takes effect the same day and only the remaining days of the period are charged; a downgrade applies at the end of the current period." },
      { q: "What happens if prices change?", a: "Your current period is unaffected. Changes are announced at least 30 days in advance and apply from the next period." },
      { q: "We paid annually — what if we cancel early?", a: "The months you used are recalculated at the monthly list price and the remaining balance is refunded; the annual discount is only withdrawn for the unused months." },
      { q: "Is there a discount for taking several products?", a: "Yes — organizations using more than one product get a combined quote. Request a demo to go through the scope." },
    ],
  },

  cta: {
    title: "Let's pick the plan that fits your organization.",
    lead: "If you are unsure which step to start on, we map your processes together and recommend the right plan.",
    actions: [demo, { label: "Email us", href: `mailto:${COMPANY.email}`, variant: "ghost" }],
  },
};
