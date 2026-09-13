// Services hub + Web design — English.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;
const talk = { label: "Let’s talk about your project", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SERVICES_EN: SubContent = {
  id: "services",
  meta: { title: "Services", description: "Arvo services: web design and development, SEO & GEO content, custom software, process and experience design, corporate digital systems and ongoing development support." },
  hero: {
    eyebrow: "Services", title: "From brand to system.", subtitle: "End-to-end digital.",
    lead: "Arvo designs and builds digital products that look right, work right and are ready to grow — from web design and SEO & GEO to custom software and ongoing development, strategy to launch.",
    actions: [talk],
  },
  cards: {
    eyebrow: "Expertise", title: "Expertise shaped around your needs.",
    lead: "Instead of templates, we build around your organization’s goals, users and operations.",
    items: [
      { title: "Web design & development", text: "Strategy, design, development and launch that turn your brand into a premium digital experience.", href: R("web-design"), size: "hero", visual: "web" },
      { title: "SEO & GEO content", text: "Content and technical foundations that search engines and AI answer engines understand — and can cite.", href: R("seo-geo"), size: "wide", visual: "seo" },
      { title: "Custom software", text: "Panels, portals and workflow software designed around how your organization really works.", href: R("custom-software"), size: "wide", visual: "software" },
      { title: "Process & experience design", text: "Analysing scattered operations and turning them into simpler, measurable, manageable systems." },
      { title: "Corporate digital systems", text: "End-to-end product development for panels, portals, customer areas and management screens." },
      { title: "Ongoing development", text: "Regular improvements to live products in performance, security, content and experience.", size: "wide" },
    ],
  },
  steps: {
    eyebrow: "How we work", title: "The same high standard, every project.",
    lead: "We keep decisions visible, scope clear and delivery sustainable.",
    items: [
      { title: "Discovery & roadmap", text: "We understand your goals, users and constraints, and define the scope together." },
      { title: "Experience & interface", text: "We design user journeys and a premium interface around your brand identity." },
      { title: "Development", text: "We build on a modern, fast, accessible and secure technical foundation." },
      { title: "Launch & improvement", text: "After launch we measure, learn and keep improving the product." },
    ],
  },
  faq: { eyebrow: "FAQ", title: "About our services", items: [
    { q: "What services does Arvo offer?", a: "Web design and development, SEO & GEO content, custom software, process and experience design, corporate digital systems and ongoing development support." },
    { q: "How does a project start?", a: "You share your needs through the contact form; we clarify the scope in a discovery call, then prepare a roadmap and a proposal." },
    { q: "Do you provide support after launch?", a: "Yes. With ongoing development support we keep improving performance, security, content and experience." },
    { q: "How is pricing set?", a: "Each project is priced by scope; a tailored proposal follows the discovery call." },
  ] },
  cta: { eyebrow: "New project", title: "Let’s talk about your next project.", actions: [talk, { label: "Write to us", href: "mailto:info@arvo-os.com", variant: "ghost" }] },
  serviceName: "Arvo digital services",
};

export const WEB_DESIGN_EN: SubContent = {
  id: "web-design",
  parent: { id: "services", name: "Services" },
  meta: { title: "Web Design & Development", description: "Arvo web design: discovery and strategy, content architecture, UX/UI design, fast and accessible development, testing, launch and maintenance in one process." },
  hero: {
    eyebrow: "Services · Web design", title: "Your brand", subtitle: "at its digital best.",
    lead: "Arvo’s web design service delivers brand websites end to end — from discovery and strategy to content architecture, UX/UI design, development, launch and maintenance.",
    actions: [talk, { label: "All services", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Approach", title: "More than design. A complete system.",
    lead: "We treat your site not as a shop window, but as a living product that builds trust, carries the right information and serves your business goals.",
    items: [
      { title: "Distinctive, consistent brand", text: "Colour, typography, visual language and tone of voice come together in one premium identity." },
      { title: "Clear, persuasive experience", text: "Effortless journeys that present strong messages in the right order." },
      { title: "Fast, scalable technology", text: "Mobile-first foundations, ready for search engines and AI answers, that grow easily." },
    ],
  },
  steps: {
    eyebrow: "Process", title: "From idea to launch, in six clear steps.",
    items: [
      { title: "Discovery & strategy", text: "We clarify your brand, audience, competitors and the site’s business goals." },
      { title: "Content architecture", text: "We plan pages, message hierarchy and user journeys around conversion goals." },
      { title: "UX/UI design", text: "We create an original design that carries your identity to every screen size." },
      { title: "Development", text: "We build a fast, accessible, SEO-ready and manageable modern foundation." },
      { title: "Testing & launch", text: "We launch after device, browser, performance and content checks." },
      { title: "Maintenance & growth", text: "We keep adding value with new content, features and improvements." },
    ],
  },
  band: {
    eyebrow: "Deliverables", title: "What you have at the end.",
    items: ["Strategy and content architecture", "Interface design for every screen size", "Fast, accessible, SEO-ready code", "Structured data and multilingual setup (when needed)", "Launch, testing and handover", "Optional post-launch maintenance"],
  },
  faq: { eyebrow: "FAQ", title: "About web design", items: [
    { q: "What steps does a website project include?", a: "Discovery and strategy, content architecture, UX/UI design, development, testing and launch, and maintenance and growth." },
    { q: "Are the sites mobile-friendly?", a: "Yes. Design is mobile-first and tested across screen sizes." },
    { q: "Will my site be ready for search engines?", a: "Yes. Technical SEO foundations are part of development; for deeper work we offer SEO & GEO. No specific ranking is promised." },
    { q: "Can I add content after launch?", a: "Yes. The foundation is built to grow with new pages, and we offer maintenance and growth support." },
  ] },
  cta: { title: "Let’s design your new website together.", actions: [talk, { label: "SEO & GEO", href: R("seo-geo"), variant: "ghost" }] },
  serviceName: "Web design and development",
};
