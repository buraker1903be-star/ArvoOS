// Almanca: services-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;
const talk = { label: "Sprechen wir über Ihr Projekt", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SERVICES_DE: SubContent = {
  id: "services",
  meta: { title: "Leistungen", description: "Leistungen von Arvo: Webdesign und -entwicklung, SEO- & GEO-Inhalte, Individualsoftware, Prozess- und Experience-Design, digitale Unternehmenssysteme und laufende Weiterentwicklung." },
  hero: {
    eyebrow: "Leistungen", title: "Von der Marke zum System.", subtitle: "Digital aus einer Hand.",
    lead: "Arvo gestaltet und entwickelt digitale Produkte, die richtig aussehen, richtig funktionieren und bereit zum Wachsen sind – von Webdesign und SEO & GEO bis zu Individualsoftware und laufender Weiterentwicklung, von der Strategie bis zum Launch.",
    actions: [talk],
  },
  cards: {
    eyebrow: "Expertise", title: "Expertise, zugeschnitten auf Ihren Bedarf.",
    lead: "Statt Vorlagen bauen wir rund um die Ziele, Nutzer und Abläufe Ihrer Organisation.",
    items: [
      { title: "Webdesign & -entwicklung", text: "Strategie, Design, Entwicklung und Launch, die Ihre Marke in ein hochwertiges digitales Erlebnis verwandeln.", href: R("web-design"), size: "hero", visual: "web" },
      { title: "SEO- & GEO-Inhalte", text: "Inhaltliche und technische Grundlagen, die Suchmaschinen und KI-Antwortmaschinen verstehen – und zitieren können.", href: R("seo-geo"), size: "wide", visual: "seo" },
      { title: "Individualsoftware", text: "Panels, Portale und Workflow-Software, gestaltet nach der tatsächlichen Arbeitsweise Ihrer Organisation.", href: R("custom-software"), size: "wide", visual: "software" },
      { title: "Prozess- & Experience-Design", text: "Verstreute Abläufe analysieren und in einfachere, messbare und steuerbare Systeme überführen." },
      { title: "Digitale Unternehmenssysteme", text: "Produktentwicklung aus einer Hand für Panels, Portale, Kundenbereiche und Management-Ansichten." },
      { title: "Laufende Weiterentwicklung", text: "Regelmäßige Verbesserungen an Live-Produkten bei Performance, Sicherheit, Inhalten und Nutzererlebnis.", size: "wide" },
    ],
  },
  steps: {
    eyebrow: "So arbeiten wir", title: "Derselbe hohe Anspruch, in jedem Projekt.",
    lead: "Wir halten Entscheidungen sichtbar, den Umfang klar und die Umsetzung nachhaltig.",
    items: [
      { title: "Discovery & Roadmap", text: "Wir verstehen Ihre Ziele, Nutzer und Rahmenbedingungen und legen den Umfang gemeinsam fest." },
      { title: "Experience & Oberfläche", text: "Wir gestalten Nutzerwege und eine hochwertige Oberfläche rund um Ihre Markenidentität." },
      { title: "Entwicklung", text: "Wir bauen auf einer modernen, schnellen, barrierearmen und sicheren technischen Grundlage." },
      { title: "Launch & Verbesserung", text: "Nach dem Launch messen wir, lernen und verbessern das Produkt kontinuierlich." },
    ],
  },
  faq: { eyebrow: "FAQ", title: "Über unsere Leistungen", items: [
    { q: "Welche Leistungen bietet Arvo an?", a: "Webdesign und -entwicklung, SEO- & GEO-Inhalte, Individualsoftware, Prozess- und Experience-Design, digitale Unternehmenssysteme und laufende Weiterentwicklung." },
    { q: "Wie beginnt ein Projekt?", a: "Sie schildern Ihren Bedarf über das Kontaktformular; in einem Discovery-Gespräch klären wir den Umfang und erstellen anschließend eine Roadmap und ein Angebot." },
    { q: "Bieten Sie nach dem Launch Support?", a: "Ja. Im Rahmen der laufenden Weiterentwicklung verbessern wir Performance, Sicherheit, Inhalte und Nutzererlebnis kontinuierlich." },
    { q: "Wie wird der Preis festgelegt?", a: "Jedes Projekt wird nach Umfang kalkuliert; nach dem Discovery-Gespräch erhalten Sie ein individuelles Angebot." },
  ] },
  cta: { eyebrow: "Neues Projekt", title: "Sprechen wir über Ihr nächstes Projekt.", actions: [talk, { label: "Schreiben Sie uns", href: "mailto:info@arvo-os.com", variant: "ghost" }] },
  serviceName: "Digitale Leistungen von Arvo",
};

export const WEB_DESIGN_DE: SubContent = {
  id: "web-design",
  parent: { id: "services", name: "Leistungen" },
  meta: { title: "Webdesign & -entwicklung", description: "Website- und E-Commerce-Design von Arvo: Discovery und Strategie, Inhaltsarchitektur, UX/UI-Design, schnelle und barrierearme Entwicklung, Tests, Launch und Wartung in einem Prozess." },
  hero: {
    eyebrow: "Leistungen · Webdesign", title: "Ihre Marke", subtitle: "digital in Bestform.",
    lead: "Mit dem Webdesign-Service von Arvo entstehen Markenwebsites aus einer Hand – von Discovery und Strategie über Inhaltsarchitektur, UX/UI-Design und Entwicklung bis zu Launch und Wartung.",
    actions: [talk, { label: "Alle Leistungen", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Ansatz", title: "Mehr als Design. Ein vollständiges System.",
    lead: "Wir verstehen Ihre Website nicht als Schaufenster, sondern als lebendiges Produkt, das Vertrauen schafft, die richtigen Informationen transportiert und Ihren Geschäftszielen dient.",
    items: [
      { title: "Unverwechselbare, stimmige Marke", text: "Farbe, Typografie, Bildsprache und Tonalität verbinden sich zu einer hochwertigen Identität." },
      { title: "Klares, überzeugendes Erlebnis", text: "Mühelose Nutzerwege, die starke Botschaften in der richtigen Reihenfolge präsentieren." },
      { title: "Schnelle, skalierbare Technik", text: "Mobile-first-Grundlagen, bereit für Suchmaschinen und KI-Antworten, die leicht mitwachsen." },
      { title: "E-Commerce-Website mit eigenem Panel", text: "Wir gestalten und entwickeln Ihren Onlineshop; das Panel zur Verwaltung Ihrer Produkte und Bestellungen wird mit der Website ausgeliefert." },
    ],
  },
  steps: {
    eyebrow: "Prozess", title: "Von der Idee zum Launch, in sechs klaren Schritten.",
    items: [
      { title: "Discovery & Strategie", text: "Wir klären Ihre Marke, Zielgruppe, Wettbewerber und die Geschäftsziele der Website." },
      { title: "Inhaltsarchitektur", text: "Wir planen Seiten, Botschaftshierarchie und Nutzerwege rund um Ihre Conversion-Ziele." },
      { title: "UX/UI-Design", text: "Wir schaffen ein eigenständiges Design, das Ihre Identität auf jede Bildschirmgröße überträgt." },
      { title: "Entwicklung", text: "Wir bauen eine schnelle, barrierearme, SEO-fähige und gut pflegbare moderne Grundlage." },
      { title: "Tests & Launch", text: "Wir gehen live nach Prüfungen auf Geräten und Browsern, bei Performance und Inhalten." },
      { title: "Wartung & Wachstum", text: "Mit neuen Inhalten, Funktionen und Verbesserungen schaffen wir laufend Mehrwert." },
    ],
  },
  band: {
    eyebrow: "Ergebnisse", title: "Was Sie am Ende in der Hand haben.",
    items: ["Strategie und Inhaltsarchitektur", "Oberflächendesign für jede Bildschirmgröße", "Schneller, barrierearmer, SEO-fähiger Code", "Strukturierte Daten und mehrsprachige Einrichtung (bei Bedarf)", "Panel zur Produkt- und Bestellverwaltung für E-Commerce-Websites", "Launch, Tests und Übergabe", "Optionale Wartung nach dem Launch"],
  },
  faq: { eyebrow: "FAQ", title: "Über Webdesign", items: [
    { q: "Welche Schritte umfasst ein Website-Projekt?", a: "Discovery und Strategie, Inhaltsarchitektur, UX/UI-Design, Entwicklung, Tests und Launch sowie Wartung und Wachstum." },
    { q: "Sind die Websites für Mobilgeräte optimiert?", a: "Ja. Das Design ist mobile-first und wird auf verschiedenen Bildschirmgrößen getestet." },
    { q: "Ist meine Website für Suchmaschinen gerüstet?", a: "Ja. Technische SEO-Grundlagen sind Teil der Entwicklung; für tiefergehende Arbeit bieten wir SEO & GEO an. Ein bestimmtes Ranking wird nicht versprochen." },
    { q: "Entwickeln Sie auch E-Commerce-Websites?", a: "Ja. Wir gestalten und entwickeln den Onlineshop, und das Panel zur Verwaltung Ihrer Produkte (Katalog) und Bestellungen wird mit der Website ausgeliefert. Das Panel wird nicht separat gemietet; es ist Teil der Website." },
    { q: "Kann ich nach dem Launch Inhalte hinzufügen?", a: "Ja. Die Grundlage ist darauf ausgelegt, mit neuen Seiten zu wachsen, und wir bieten Unterstützung bei Wartung und Wachstum an." },
  ] },
  cta: { title: "Gestalten wir gemeinsam Ihre neue Website.", actions: [talk, { label: "SEO & GEO", href: R("seo-geo"), variant: "ghost" }] },
  serviceName: "Webdesign und -entwicklung",
};
