// About — English.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;

export const ABOUT_EN: SubContent = {
  id: "about",
  meta: { title: "About", description: `ArvoOS is the software brand of ${COMPANY.legalName}. It builds the business operating system of the same name, ArvoLab and ArvoBook, and delivers website and e-commerce design and custom software services.` },
  hero: {
    eyebrow: "About", title: "We make complex work", subtitle: "simple.",
    lead: `ArvoOS is the software brand of ArvoCulture Group, based in Istanbul, Türkiye. It designs powerful yet calm digital ways of working for organizations, researchers and salons.`,
    actions: [{ label: "Meet us", href: R("contact"), variant: "gold" }],
  },
  cards: {
    eyebrow: "One vision, a growing ecosystem", title: "What we believe.",
    lead: "With ArvoOS we transform how businesses operate, with ArvoLab how research gets done, and with ArvoBook how salons run their appointment book — all with one brand language and quality standard.",
    items: [
      { title: "Technology centred on people", text: "Experiences that make deciding and creating easier, without passing complexity on to the user." },
      { title: "Uncompromising detail", text: "Reliable, understandable, long-lived systems — from interface to infrastructure." },
      { title: "Products that grow together", text: "A scalable ecosystem where new products and services fit naturally." },
    ],
  },
  steps: {
    eyebrow: "How we work", title: "We redesign the way work gets done.",
    lead: "We see software not just as a tool, but as a system that strengthens a team’s culture, pace and quality of service.",
    items: [
      { title: "We understand the process first", text: "Every project starts by learning how the work really happens." },
      { title: "We design the whole", text: "Brand, experience and technology are treated as one." },
      { title: "We work transparently, for the long term", text: "Visible decisions, clear scope and lasting collaboration." },
    ],
  },
  band: {
    eyebrow: "Company details", title: "The company behind ArvoOS.",
    items: [COMPANY.legalName, COMPANY.address.displayIntl, COMPANY.email],
  },
  faq: { eyebrow: "FAQ", title: "About ArvoOS", items: [
    { q: "Which company is behind ArvoOS?", a: `ArvoOS is a brand of ${COMPANY.legalName}.` },
    { q: "Where is ArvoOS based?", a: `${COMPANY.address.displayIntl}.` },
    { q: "Is ArvoOS a company or a product?", a: "ArvoOS is the brand of the company (arvo-os.com is its website) and also the name of its business operating system. ArvoLab and ArvoBook are its other products." },
    { q: "How do I contact ArvoOS?", a: `Use the form on the contact page or write to ${COMPANY.email}.` },
  ] },
  cta: { title: "Let’s build a better system together.", actions: [{ label: "Get in touch", href: R("contact"), variant: "gold" }, { label: "Products", href: R("arvoos"), variant: "ghost" }] },
  org: true,
};
