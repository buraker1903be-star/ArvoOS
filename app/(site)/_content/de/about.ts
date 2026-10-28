// Almanca: about-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;

export const ABOUT_DE: SubContent = {
  id: "about",
  meta: { title: "Über uns", description: `Arvo ist die Softwaremarke von ${COMPANY.legalName}. Arvo entwickelt ArvoOS, ArvoLab und ArvoBook und bietet Website- und E-Commerce-Design sowie Individualsoftware an.` },
  hero: {
    eyebrow: "Über uns", title: "Wir machen komplexe Arbeit", subtitle: "einfach.",
    lead: `Arvo ist die Softwaremarke der ArvoCulture Group mit Sitz in Istanbul, Türkei. Wir gestalten leistungsstarke und zugleich ruhige digitale Arbeitsweisen für Organisationen, Forschende und Salons.`,
    actions: [{ label: "Lernen Sie uns kennen", href: R("contact"), variant: "gold" }],
  },
  cards: {
    eyebrow: "Eine Vision, ein wachsendes Ökosystem", title: "Woran wir glauben.",
    lead: "Mit ArvoOS verändern wir, wie Unternehmen arbeiten, mit ArvoLab, wie Forschung entsteht, und mit ArvoBook, wie Salons ihr Terminbuch führen – alles mit einer Markensprache und einem Qualitätsstandard.",
    items: [
      { title: "Technologie, die den Menschen in den Mittelpunkt stellt", text: "Erlebnisse, die Entscheiden und Gestalten erleichtern, ohne Komplexität an die Nutzer weiterzugeben." },
      { title: "Kompromisslos im Detail", text: "Zuverlässige, verständliche, langlebige Systeme – von der Oberfläche bis zur Infrastruktur." },
      { title: "Produkte, die zusammenwachsen", text: "Ein skalierbares Ökosystem, in das sich neue Produkte und Leistungen natürlich einfügen." },
    ],
  },
  steps: {
    eyebrow: "So arbeiten wir", title: "Wir gestalten neu, wie Arbeit erledigt wird.",
    lead: "Für uns ist Software nicht nur ein Werkzeug, sondern ein System, das Kultur, Tempo und Servicequalität eines Teams stärkt.",
    items: [
      { title: "Zuerst verstehen wir den Prozess", text: "Jedes Projekt beginnt damit, zu lernen, wie die Arbeit tatsächlich abläuft." },
      { title: "Wir gestalten das Ganze", text: "Marke, Nutzererlebnis und Technologie betrachten wir als Einheit." },
      { title: "Wir arbeiten transparent und langfristig", text: "Sichtbare Entscheidungen, klarer Umfang und dauerhafte Zusammenarbeit." },
    ],
  },
  band: {
    eyebrow: "Unternehmensangaben", title: "Das Unternehmen hinter Arvo.",
    items: [COMPANY.legalName, COMPANY.address.displayIntl, COMPANY.email],
  },
  faq: { eyebrow: "FAQ", title: "Über Arvo", items: [
    { q: "Welches Unternehmen steht hinter Arvo?", a: `Arvo ist eine Marke von ${COMPANY.legalName}.` },
    { q: "Wo hat Arvo seinen Sitz?", a: `${COMPANY.address.displayIntl}.` },
    { q: "Worin unterscheiden sich Arvo und ArvoOS?", a: "Arvo ist die Marke (und arvo-os.com ihre Website); ArvoOS ist eines ihrer Produkte. Die anderen sind ArvoLab und ArvoBook." },
    { q: "Wie erreiche ich Arvo?", a: `Nutzen Sie das Formular auf der Kontaktseite oder schreiben Sie an ${COMPANY.email}.` },
  ] },
  cta: { title: "Bauen wir gemeinsam ein besseres System.", actions: [{ label: "Kontakt aufnehmen", href: R("contact"), variant: "gold" }, { label: "Produkte", href: R("arvoos"), variant: "ghost" }] },
  org: true,
};
