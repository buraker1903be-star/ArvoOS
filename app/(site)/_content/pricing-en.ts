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
      "Subscription pricing for ArvoOS, ArvoCal and ArvoLab: monthly and annual prices, what each plan includes, add-ons and subscription terms. Priced per organization, not per user.",
  },
  hero: {
    eyebrow: "Pricing",
    title: "For business products, per organization —",
    subtitle: "not per seat.",
    lead: "ArvoOS and ArvoCal are priced per organization: your bill does not multiply as the team grows, and every card states how many users are included. ArvoLab is the exception — its value sits with the person doing the writing, not in the organization's flow, so it is priced per researcher.",
    actions: [demo, { label: "Subscription terms", href: "#kosullar", variant: "ghost" }],
  },
  cycle: {
    monthly: "Monthly",
    yearly: "Annual",
    badge: "2 months free",
    perMonth: "/mo",
    perYear: "/yr",
    perMonthUser: "/user/mo",
    perYearUser: "/user/yr",
    quote: "On request",
    quoteAction: "Request a quote",
  },
  vatNote:
    "Prices are in US dollars and exclude VAT and sales tax; customers in Turkey are billed in Turkish lira at the prices on the Turkish page, which include VAT. On the annual option you pay for 10 months and use 12; the amount is invoiced once at the start of the period.",

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
          items: ["3 users included", "Single branch", "CRM and sales pipeline", "Proposals and e-signed contracts", "Operations and task flow", "Finance and collection tracking", "Email support"],
        },
        {
          code: "arvoos-kurumsal",
          text: "For organizations running several teams or branches on connected processes.",
          items: ["15 users included", "Unlimited branches", "All modules", "Customer tracking portal", "Role × module permission matrix", "Advanced reporting", "Priority support"],
        },
        {
          code: "arvoos-ozel",
          text: "For organizations that want ArvoOS on their own operating model and brand.",
          items: ["Unlimited users", "Custom domain", "Custom workflows", "Branded customer experience", "Data migration and team training", "Implementation consulting"],
        },
      ],
    },
    {
      product: "randevu",
      tag: "Appointment management",
      lead: "An online booking page, calendar and customer records for hair and beauty salons. Working hours are defined in Türkiye local time.",
      linkLabel: "Explore ArvoCal",
      cards: [
        {
          code: "randevu-tek",
          text: "For salons at one address still tracking appointments by phone and notebook.",
          items: ["Single branch", "Up to 5 staff", "Online booking page", "Appointment calendar", "Customer records and history", "Email support"],
        },
        {
          code: "randevu-coklu",
          text: "For businesses that want a central view and per-branch permissions.",
          items: ["Up to 3 branches", "Unlimited staff", "Per-branch calendar and permissions", "Central reports", "Priority support"],
        },
        {
          code: "randevu-zincir",
          text: "For chains with more than three branches that want their own brand front.",
          items: ["Unlimited branches", "Custom domain", "Custom workflows", "Implementation and team training"],
        },
      ],
    },
    {
      product: "arvolab",
      tag: "Research workspace",
      lead: "Literature and citations, academic writing, guideline checks, analysis and originality pre-checks — the whole research process in one workspace, without a separate tool and a separate subscription for every step. Priced per researcher.",
      linkLabel: "Explore ArvoLab",
      cards: [
        {
          code: "arvolab-arastirmaci",
          text: "For researchers carrying a thesis, paper or project on their own.",
          items: ["A single researcher", "Literature and citation management", "Academic writing", "Guideline checks", "Analysis centre (quantitative and qualitative)", "Originality pre-check"],
        },
        {
          // Ekip paketi 28.10.2026'da satıştan kalktı (kurucu kararı): ArvoLab bireysel
          // araştırmacıya satılıyor, kurum lisansı yalnızca üniversite ve eğitim
          // kurumlarına teklifle veriliyor. Kart geri eklenirse lib'deki plan da gerekir.
          code: "arvolab-kurum",
          text: "Only for universities and educational institutions: a site licence for a department or the whole university, priced on request.",
          items: ["Unlimited researchers", "Department or university-wide site licence", "In-house user management", "Custom domain", "Implementation and training", "Invoiced to the institution"],
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
      { code: "ek-kullanici", name: "Additional user", text: "For each user beyond the number included in an ArvoOS plan. It does not apply to ArvoLab, which is already priced per researcher." },
      { code: "ek-sube", name: "Additional branch", text: "For each branch beyond the three included in the ArvoCal Multi-branch plan." },
      { code: "veri-aktarimi", name: "Data migration and setup", text: "Moving data from your current system, defining users and training the team. Charged once, based on scope." },
      { code: "ozel-gelistirme", name: "Custom development", text: "A workflow, screen or report specific to your organization. Quoted once the scope is clear." },
    ],
  },

  policy: {
    eyebrow: "Subscription terms",
    title: "The rules behind the price.",
    lead: "These are the rules we actually apply; the full text is in the distance sales agreement and the cancellation and refund policy.",
    items: [
      { title: "No charge without your consent", text: "Your card is never charged without your explicit consent. By default, a payment link is sent for each period and you approve the payment. If you save your card and choose automatic renewal at checkout, you are notified at least 3 days before each charge and can switch automatic renewal off at any time." },
      { title: "Cancellation at period end", text: "You can cancel from the panel or by email. Cancellation takes effect at the end of the paid period; the service stays available until then." },
      { title: "Price changes", text: "Your current period is unaffected. Changes are announced by email at least 30 days in advance and apply from the next period only." },
      { title: "Upgrades and downgrades", text: "An upgrade takes effect the same day and only the remaining days of the period are charged. A downgrade applies at the end of the current period." },
      { title: "Cancelling an annual plan early", text: "The months you used are recalculated at the monthly list price and the remaining balance is refunded. The annual discount is only withdrawn for the unused months." },
      { title: "VAT and invoicing", text: "Listed US-dollar amounts exclude VAT and sales tax, which are applied on the invoice according to the rules in force; Turkish-lira prices on the Turkish page include VAT. An invoice is issued for each period and sent to your registered email address." },
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
      { q: "Do the prices include VAT?", a: "No. US-dollar amounts on this page exclude VAT and sales tax; these are applied on the invoice according to the rules in force. Turkish-lira prices on the Turkish page include VAT." },
      { q: "Are we charged per user?", a: "For ArvoOS and ArvoCal, no: prices are per organization and each plan includes a set number of users; beyond that number only the additional-user fee applies and the plan price does not multiply. For ArvoLab, yes: it is priced per researcher, because there the value is produced directly by the person using it." },
      { q: "Can a team or a company buy ArvoLab?", a: "ArvoLab is sold to individual researchers. Institutional licences are offered only to universities and educational institutions, on request." },
      { q: "What does annual billing save?", a: "On the annual option you pay for 10 months and use 12 — two months free. The amount is invoiced once at the start of the period." },
      { q: "Does the subscription renew automatically?", a: "Not unless you choose it. By default your card is not charged automatically; a payment link is sent for each period. You can save your card and choose automatic renewal at checkout; you are notified at least 3 days before each charge and can switch automatic renewal off at any time from the payment screen in your account." },
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
