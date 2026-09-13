// Custom software — English. Proof of capability: the ArvoOS platform itself.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;
const talk = { label: "Tell us what you need", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const CUSTOM_SOFTWARE_EN: SubContent = {
  id: "custom-software",
  parent: { id: "services", name: "Services" },
  meta: { title: "Custom Software", description: "Arvo custom software: tailored panels and portals, workflow software, integrations and automation, customer areas and mobile-friendly PWA applications." },
  hero: {
    eyebrow: "Services · Custom software", title: "When off-the-shelf isn’t enough,", subtitle: "a system of your own.",
    lead: "Arvo’s custom software service designs and builds panels, portals, customer areas and workflow software around how your organization really works. The team that built ArvoOS brings the same care to yours.",
    actions: [talk, { label: "See ArvoOS", href: R("arvoos"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "What we build", title: "Software shaped like your business.",
    items: [
      { title: "Tailored panels & portals", text: "Management screens for your teams, secure self-service areas for your customers." },
      { title: "Workflow software", text: "Flows that automate requests, approvals, tasks and deliveries under your own rules." },
      { title: "Integrations & automation", text: "Data flows that connect the tools you use and cut repetitive work." },
      { title: "Document & signature flows", text: "Branded documents, PDF output and electronic acceptance steps." },
      { title: "Mobile-friendly PWA", text: "Web applications that install to the home screen and work like mobile apps." },
      { title: "Multi-tenant SaaS architecture", text: "Scalable structures where every customer works in their own space, under their own brand." },
    ],
  },
  band: {
    eyebrow: "Proof of capability", title: "We built ArvoOS.",
    lead: "The problems we solved on our own platform become ready experience on your project.",
    items: ["Multi-tenant structure with DNS-verified custom domains", "Electronic acceptance with drawn signature and A4 PDF documents", "Customer portal with payment-gated file delivery", "Role × module permissions and row-level security", "Installable, mobile-first PWA interface"],
  },
  steps: {
    eyebrow: "Process", title: "From discovery to continuous development.",
    items: [
      { title: "Discovery", text: "Together we map your processes, users and priorities." },
      { title: "Architecture & design", text: "We design the data model, permission structure and interface with you." },
      { title: "Development", text: "We build in short cycles, in working pieces, and validate them with you." },
      { title: "Launch & onboarding", text: "We launch the system and get your team up and running." },
      { title: "Continuous development", text: "We improve performance, security and experience based on feedback." },
    ],
  },
  faq: { eyebrow: "FAQ", title: "About custom software", items: [
    { q: "What kind of custom software does Arvo build?", a: "Tailored panels and portals, workflow software, integrations and automation, document and signature flows, and mobile-friendly PWA applications." },
    { q: "Why custom software instead of a ready-made product?", a: "If your processes don’t fit ready-made products, or you want a branded experience for your customers, custom software may be the better fit. We first check together whether ArvoOS already covers your needs." },
    { q: "How is a project priced?", a: "By scope. A roadmap and proposal follow the discovery call." },
    { q: "Do you provide support after launch?", a: "Yes. With ongoing development support we continue maintenance, security and new features." },
  ] },
  cta: { title: "Let’s build a system that’s yours.", actions: [talk, { label: "All services", href: R("services"), variant: "ghost" }] },
  serviceName: "Custom software development",
};
