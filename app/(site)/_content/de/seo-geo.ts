// Almanca: seo-geo-en.ts'in çevirisi. Sıralama / trafik vaadi yok; yapı ve veriler aynı.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;
const talk = { label: "Lassen Sie uns Ihre Website prüfen", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SEO_GEO_DE: SubContent = {
  id: "seo-geo",
  parent: { id: "services", name: "Leistungen" },
  meta: { title: "SEO- & GEO-Inhalte", description: "SEO & GEO von Arvo: technisches SEO, Inhaltsarchitektur, strukturierte Daten (JSON-LD), llms.txt, Inhalte, die KI-Antwortmaschinen zitieren können, mehrsprachige Einrichtung und Performance." },
  hero: {
    eyebrow: "Leistungen · SEO & GEO", title: "Gefunden werden, wenn gesucht wird.", subtitle: "Erklärt werden, wenn gefragt wird.",
    lead: "Mit SEO- & GEO-Inhalten sorgen wir dafür, dass Ihre Website von Suchmaschinen korrekt indexiert und von KI-Antwortmaschinen wie ChatGPT, Perplexity und Google AI Overviews verstanden und zitiert werden kann.",
    actions: [talk, { label: "Alle Leistungen", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Was wir tun", title: "Eine Grundlage für Suche und KI.",
    lead: "GEO (Generative Engine Optimization) verleiht Ihren Inhalten die Klarheit, Struktur und Überprüfbarkeit, die sie brauchen, um in KI-Antworten als Quelle genutzt zu werden.",
    numbered: true,
    items: [
      { title: "Technisches SEO", text: "Crawlbarkeit, Indexierung, Sitemaps, robots, Canonicals und Weiterleitungen." },
      { title: "Inhaltsarchitektur", text: "Seitenhierarchie, klare Überschriften und jede Seite beantwortet eine Frage richtig gut." },
      { title: "Strukturierte Daten", text: "schema.org-JSON-LD für Ihre Organisation, Produkte, Leistungen, FAQs und Breadcrumbs." },
      { title: "llms.txt", text: "Ein maschinenlesbarer Index, der KI-Assistenten eine Zusammenfassung Ihrer Website und ihrer wichtigsten Seiten liefert." },
      { title: "Zitierfähige Inhalte", text: "Definitionen in einem Satz und kurze, sachliche FAQs – überprüfbar, ohne erfundene Behauptungen." },
      { title: "Mehrsprachigkeit & Performance", text: "Sprachzuordnung mit hreflang; schnelle, stabile Seiten, ausgerichtet an den Core Web Vitals." },
    ],
  },
  steps: {
    eyebrow: "Prozess", title: "Vom Audit zur kontinuierlichen Verbesserung.",
    items: [
      { title: "Audit", text: "Wir prüfen Ihre technische Einrichtung, Ihre Inhaltsstruktur und Ihre aktuelle Sichtbarkeit." },
      { title: "Strategie & Inhaltsarchitektur", text: "Wir legen Zielfragen, Seitenhierarchie und Prioritäten fest." },
      { title: "Technische Umsetzung", text: "Wir setzen Sitemaps, strukturierte Daten, llms.txt, hreflang und Performance-Verbesserungen um." },
      { title: "Inhaltliche Überarbeitung", text: "Wir überarbeiten Texte mit klaren Definitionen, fragebasierten Überschriften und kurzen Antworten." },
      { title: "Messen & verbessern", text: "Wir arbeiten mit Daten aus der Search Console und regelmäßigen Prüfungen weiter." },
    ],
  },
  band: {
    eyebrow: "In der Praxis", title: "Diese Website ist genauso gebaut.",
    lead: "arvo-os.com wurde mit strukturierten Daten, llms.txt, hreflang und fragebasierten Inhalten gebaut.",
    items: ["schema.org-JSON-LD auf jeder Seite", "llms.txt und llms-full.txt", "hreflang-Zuordnung über sechs Sprachversionen", "Seiten, die mit einer Definition beginnen, plus kurze FAQs"],
  },
  note: "Suchmaschinen und KI-Dienste entscheiden nach ihren eigenen Algorithmen; ein bestimmtes Ranking, ein bestimmter Traffic oder eine bestimmte Zitierung wird nicht versprochen.",
  faq: { eyebrow: "FAQ", title: "Über SEO & GEO", items: [
    { q: "Was ist GEO?", a: "GEO (Generative Engine Optimization) bedeutet, Inhalte so aufzubereiten, dass KI-Antwortmaschinen wie ChatGPT, Perplexity und Google AI Overviews sie korrekt verstehen – und als Quelle zitieren können." },
    { q: "Worin unterscheiden sich SEO und GEO?", a: "SEO zielt auf Indexierung und Sichtbarkeit in den Suchergebnissen; GEO auf korrekte, zitierfähige Informationen in KI-Antworten. Beide beruhen auf derselben soliden technischen und inhaltlichen Grundlage." },
    { q: "Was ist llms.txt?", a: "Eine Textdatei im Stammverzeichnis der Website, die KI-Assistenten eine kurze Zusammenfassung der Website und ihrer wichtigsten Seiten liefert." },
    { q: "Garantieren Sie Rankings?", a: "Nein. Ein bestimmtes Ranking, ein bestimmter Traffic oder eine bestimmte Zitierung wird nicht versprochen; wir schaffen die richtige technische Grundlage und Inhaltsstruktur." },
    { q: "Lässt sich das auf meine bestehende Website anwenden?", a: "Ja. Wir beginnen mit einem Audit; technische und inhaltliche Verbesserungen lassen sich in der Regel auf eine bestehende Website anwenden." },
  ] },
  cta: { title: "Sorgen wir dafür, dass Ihre Website gefunden wird – und erklärt, wenn gefragt wird.", actions: [talk, { label: "Webdesign", href: R("web-design"), variant: "ghost" }] },
  serviceName: "SEO- und GEO-Inhalte",
};
