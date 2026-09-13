// ArvoLab product page — English.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].en;

export const ARVOLAB_EN: ProductContent = {
  id: "arvolab",
  name: "ArvoLab",
  category: "EducationalApplication",
  appUrl: PRODUCT_APPS.arvolab.url,
  featureList: ["Literature and citation management", "Academic writing", "Guideline checks", "Quantitative and qualitative analysis", "Academic editor", "Originality pre-check"],
  meta: {
    title: "ArvoLab — Research Workspace",
    description: "ArvoLab brings literature and citation management, academic writing, guideline checks, quantitative and qualitative analysis, an academic editor and an originality pre-check into one workspace.",
  },
  hero: {
    eyebrow: "ArvoLab · Research workspace",
    title: "A stronger workspace", subtitle: "for research.",
    lead: "ArvoLab is a web-based research workspace that brings the core steps of academic work — from literature to writing, from document checks to analysis — into one place.",
    actions: [
      { label: "Request access", href: `${R("contact")}?interest=arvolab`, variant: "gold" },
      { label: "Sign in to ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Capabilities",
    title: "A clearer process. Stronger output.",
    lead: "Move disconnected research tools and checks into one connected space where you can see the whole of your work.",
    items: [
      { title: "Literature & citations", text: "Organize your sources and manage your literature and citation flow systematically." },
      { title: "Academic writing", text: "Develop research texts with a sound structure and a consistent way of working." },
      { title: "Guideline checks", text: "Compare document structure and formatting requirements against guidelines faster." },
      { title: "Analysis hub", text: "Organize quantitative and qualitative research processes in one workspace." },
      { title: "Academic editor", text: "Build text review and improvement steps into your research flow." },
      { title: "Originality pre-check", text: "Review your text before submission to spot potential risks earlier." },
    ],
  },
  flow: {
    eyebrow: "The research flow",
    title: "With you at every stage of research.",
    lead: "A whole-picture way of working that keeps the researcher focused on quality output, not on tools.",
    steps: [
      { title: "Gather sources", text: "Organize your literature and citations in one place." },
      { title: "Write", text: "Develop your text in a consistent structure and bring editing steps into the flow." },
      { title: "Check", text: "Run guideline checks and the originality pre-check before you submit." },
      { title: "Analyse", text: "Run quantitative and qualitative analysis in the same workspace." },
    ],
  },
  audience: {
    eyebrow: "Who is it for?",
    title: "From individual researchers to institutions.",
    lead: "ArvoLab is designed to fit different scales of academic work.",
    items: [
      { title: "Individual researchers", text: "For theses, papers and projects run in one calm workspace." },
      { title: "Academic teams", text: "For teams keeping sources, texts and checks in a shared order." },
      { title: "Institutions", text: "For institutions offering a complete research environment." },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "About ArvoLab",
    items: [
      { q: "What is ArvoLab?", a: "ArvoLab is Arvo’s research workspace for literature and citation management, academic writing, guideline checks, quantitative and qualitative analysis, academic editing and an originality pre-check." },
      { q: "Who is ArvoLab for?", a: "Individual researchers, academic teams and institutions." },
      { q: "How do I get access to ArvoLab?", a: `Request access through the contact form or at info@arvo-os.com. Sign in at ${PRODUCT_APPS.arvolab.url}.` },
      { q: "Does the originality pre-check replace an official report?", a: "No. It is a pre-check that helps you spot risks before submission; your institution may still require its own official originality report." },
      { q: "What is the difference between ArvoLab and ArvoOS?", a: "ArvoOS runs a business’s operations; ArvoLab is a workspace that supports academic research and writing." },
    ],
  },
  cta: {
    eyebrow: "Access",
    title: "Get in touch for ArvoLab access.",
    lead: "Whether for individual or institutional use, our team will guide you.",
    actions: [
      { label: "Request access", href: `${R("contact")}?interest=arvolab`, variant: "gold" },
      { label: "Sign in to ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
};
