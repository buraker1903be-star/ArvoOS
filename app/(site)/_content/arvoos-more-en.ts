// ArvoOS Industries, Solutions, Plans — English.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;
const demo = { label: "Request a demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" as const };
const parent = { id: "arvoos" as const, name: "ArvoOS" };

export const INDUSTRIES_EN: SubContent = {
  id: "arvoos-industries", parent,
  meta: { title: "ArvoOS Industries", description: "ArvoOS is configured — modules, screens and permissions — for healthcare institutions, education institutions, consulting and service firms, and multi-branch businesses." },
  hero: {
    eyebrow: "ArvoOS · Industries", title: "Not generic software.", subtitle: "A system that’s yours.",
    lead: "ArvoOS modules, screens and permissions are configured around how healthcare, education, consulting and multi-branch businesses actually work.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Adapted to your industry", title: "One core. Your own order.", cols: "two",
    items: [
      { title: "Healthcare institutions", text: "Manage clients, appointments, teams and collections as a whole.", items: ["Client requests and appointment calendar", "Team, role and permission structure", "Instalment plans and collection tracking"] },
      { title: "Education institutions", text: "Connect education operations from applicant to enrolment, payment plan to paperwork.", items: ["Applicant requests and enrolment", "Proposals, contracts and e-signature", "Payment plans and collections"] },
      { title: "Consulting & services", text: "Turn customer requests into planned, measurable and profitable projects.", items: ["CRM and proposal management", "Project and delivery flows, customer portal", "Contracts, finance and profitability"] },
      { title: "Multi-branch businesses", text: "Keep central standards while every team runs its own operation faster.", items: ["A shared view and reports from the centre", "Role- and module-based permissions", "Record-level access"] },
    ],
  },
  note: "Not on the list? Let’s talk: ArvoOS adapts to any service business with a sell–deliver–collect cycle.",
  faq: { eyebrow: "FAQ", title: "About industries", items: [
    { q: "Which industries is ArvoOS for?", a: "Healthcare institutions, education institutions, consulting and service firms, and multi-branch businesses — broadly, service businesses that sell, deliver and collect across several people." },
    { q: "How is ArvoOS adapted to our industry?", a: "Modules, screens and permissions are configured to how your organization works; contract templates and workflows are set up around your processes." },
    { q: "What does an industry-specific setup involve?", a: "We start with a needs analysis, then prepare a personal demo and a transition plan." },
  ] },
  cta: { title: "Let’s shape ArvoOS for your industry.", actions: [demo, { label: "Solutions", href: R("arvoos-solutions"), variant: "ghost" }] },
};

export const SOLUTIONS_EN: SubContent = {
  id: "arvoos-solutions", parent,
  meta: { title: "ArvoOS Solutions", description: "ArvoOS closes the gaps between sales and customer management, operations, financial control and corporate governance in one flow." },
  hero: {
    eyebrow: "ArvoOS · Solutions", title: "Every bottleneck,", subtitle: "a connected answer.",
    lead: "ArvoOS doesn’t just keep records — it closes the gaps between sales, operations and finance so the right work reaches the right person at the right time.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Business needs", title: "Solve it where it starts.", cols: "two",
    items: [
      { title: "Sales & customer management", text: "Follow every opportunity and speed up proposals and contracts.", items: ["Central customer history", "Online acceptance and e-signature links", "Staged pipeline and lost reasons"] },
      { title: "Operations management", text: "Turn closed deals into a standard flow your teams can deliver.", items: ["Workflow that starts on signature", "Owner, due-date and progress tracking", "Customer tracking portal"] },
      { title: "Financial control", text: "See revenue, collections and costs alongside the work.", items: ["Sales–finance connection", "Instalment and collection view", "Real profitability per job"] },
      { title: "Corporate governance", text: "Set permissions, records and reporting to match your growing structure.", items: ["Role × module permission matrix", "Isolation between organizations", "Auditable activity history"] },
    ],
  },
  faq: { eyebrow: "FAQ", title: "About solutions", items: [
    { q: "What problems does ArvoOS solve?", a: "The gaps between sales, operations and finance: re-entering the same data, proposals nobody follows up, invisible responsibilities and payments disconnected from the work." },
    { q: "How are sales and operations connected?", a: "A contract signed by the customer starts the job workflow automatically, with tasks, owners and due dates ready." },
    { q: "How do I see real profitability?", a: "Cost items are added to each job; reports show real profitability per job alongside sales and collections." },
  ] },
  cta: { title: "Tell us your bottleneck. We’ll build the flow together.", actions: [demo, { label: "Modules", href: R("arvoos-modules"), variant: "ghost" }] },
};

export const PLANS_EN: SubContent = {
  id: "arvoos-plans", parent,
  meta: { title: "ArvoOS Plans", description: "ArvoOS plans are scoped with each organization around the modules, number of users, branch structure and custom workflows it needs." },
  hero: {
    eyebrow: "ArvoOS · Plans", title: "Start with what you need.", subtitle: "Grow as you scale.",
    lead: "ArvoOS plans are scoped together with your organization, based on the modules you need, number of users, branch structure and custom workflows.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Flexible plans", title: "Three starting points.", cols: "three",
    items: [
      { title: "Starter", text: "For teams that want core customer, job and finance processes in one order.", items: ["Selected core modules", "Standard role structure", "Setup and onboarding support"] },
      { title: "Business", text: "For organizations running several teams or branches with connected processes.", items: ["Wide module selection", "Advanced reporting", "Team and permission management"] },
      { title: "Custom", text: "For organizations that want ArvoOS in their own way of working and identity.", items: ["Custom workflows", "Your own domain", "Branded customer experience"] },
    ],
  },
  steps: {
    eyebrow: "How it’s scoped", title: "Let’s build the right plan together.",
    lead: "Invest in business results — not in features you don’t need.",
    items: [
      { title: "Needs analysis", text: "Together we map your processes, team structure and priority modules." },
      { title: "Personal product demo", text: "We show you ArvoOS through your own workflows." },
      { title: "Scalable transition plan", text: "We plan setup, data transfer and team onboarding step by step." },
    ],
  },
  note: "There is no public price list; a proposal is prepared once the scope is clear.",
  faq: { eyebrow: "FAQ", title: "About plans", items: [
    { q: "How much does ArvoOS cost?", a: "There is no public price list. Pricing is scoped with each organization based on modules, number of users and branch structure." },
    { q: "Which plan should I start with?", a: "We decide together after a needs analysis; most organizations start with core modules and extend over time." },
    { q: "Can I change my plan later?", a: "Yes. Your plan can be extended as your modules, users and branch structure change." },
    { q: "Can we use our own domain?", a: "Yes. A custom domain is connected with DNS verification, and branded sign-in and customer pages run on that address." },
  ] },
  cta: { title: "Let’s find the right plan for your organization.", actions: [demo, { label: "Write to us", href: "mailto:info@arvo-os.com", variant: "ghost" }] },
};
