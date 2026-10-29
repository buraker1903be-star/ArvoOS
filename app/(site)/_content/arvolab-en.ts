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
      { label: "Start free trial", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Sign in to ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Capabilities",
    title: "A clearer process. Stronger output.",
    lead: "Move disconnected research tools and checks into one connected space where you can see the whole of your work.",
    items: [
      { title: "Literature & citations", text: "Paste a DOI and the reference fills in from Crossref and OpenAlex. APA 7, Harvard, Chicago, MLA 9, IEEE and Vancouver — in-text citations and the reference list are written together." },
      { title: "Academic writing", text: "Develop research texts with a sound structure and a consistent way of working." },
      { title: "Guideline checks", text: "Upload your thesis guideline as a PDF or link: page layout, required sections, citation style and limits are extracted, and the rules you confirm are applied to the editor. Reads guidelines in English and Turkish." },
      { title: "Analysis hub", text: "Organize quantitative and qualitative research processes in one workspace." },
      { title: "Academic editor", text: "Submission-ready Word and PDF on A4 or US Letter, with table of contents, footnotes and heading numbers. A submission checklist shows what is still missing in one place." },
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
    title: "Built for the individual researcher.",
    lead: "ArvoLab is designed to fit different scales of academic work.",
    items: [
      { title: "Individual researchers", text: "For theses, papers and projects run in one calm workspace." },
      { title: "Graduate students", text: "For a master’s or doctoral thesis carried from start to finish on one subscription." },
      { title: "Universities", text: "Institutional licences are offered only to universities and educational institutions, on request." },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "About ArvoLab",
    items: [
      { q: "What is ArvoLab?", a: "ArvoLab is the ArvoOS brand’s research workspace for literature and citation management, academic writing, guideline checks, quantitative and qualitative analysis, academic editing and an originality pre-check." },
      { q: "Who is ArvoLab for?", a: "Individual researchers. Institutional licences are offered only to universities and educational institutions, on request." },
      { q: "How do I get access to ArvoLab?", a: "Create an account on the sign-up page and start right away with a free trial; afterwards the subscription is paid by card. For an institutional licence, use the contact form or write to info@arvo-os.com." },
      { q: "Does the originality pre-check replace an official report?", a: "No. It is a pre-check that helps you spot risks before submission; your institution may still require its own official originality report." },
      { q: "What is the difference between ArvoLab and ArvoOS?", a: "ArvoOS runs a business’s operations; ArvoLab is a workspace that supports academic research and writing." },
    ],
  },
  cta: {
    eyebrow: "Access",
    title: "Try ArvoLab today.",
    lead: "Create your account and start with a free trial; pay by card, automatic renewal is optional. Contact us for an institutional licence.",
    actions: [
      { label: "Start free trial", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Sign in to ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
      { label: "Institutional licence", href: `${R("contact")}?interest=arvolab`, variant: "ghost" },
    ],
  },
};
