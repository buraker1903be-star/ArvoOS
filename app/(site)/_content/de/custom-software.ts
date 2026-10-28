// Almanca: custom-software-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;
const talk = { label: "Schildern Sie uns Ihren Bedarf", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const CUSTOM_SOFTWARE_DE: SubContent = {
  id: "custom-software",
  parent: { id: "services", name: "Leistungen" },
  meta: { title: "Individualsoftware", description: "Individualsoftware von Arvo: maßgeschneiderte Panels und Portale, Workflow-Software, Integrationen und Automatisierung, Kundenbereiche und mobilfreundliche PWA-Anwendungen." },
  hero: {
    eyebrow: "Leistungen · Individualsoftware", title: "Wenn Standardlösungen nicht reichen,", subtitle: "ein System, das Ihnen gehört.",
    lead: "Mit dem Individualsoftware-Service von Arvo entstehen Panels, Portale, Kundenbereiche und Workflow-Software, die sich nach der tatsächlichen Arbeitsweise Ihrer Organisation richten. Das Team, das ArvoOS entwickelt hat, bringt dieselbe Sorgfalt in Ihr Projekt ein.",
    actions: [talk, { label: "ArvoOS ansehen", href: R("arvoos"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Was wir entwickeln", title: "Software, die zu Ihrem Geschäft passt.",
    items: [
      { title: "Maßgeschneiderte Panels & Portale", text: "Management-Ansichten für Ihre Teams, sichere Self-Service-Bereiche für Ihre Kunden." },
      { title: "Workflow-Software", text: "Abläufe, die Anfragen, Freigaben, Aufgaben und Lieferungen nach Ihren eigenen Regeln automatisieren." },
      { title: "Integrationen & Automatisierung", text: "Datenflüsse, die Ihre Tools verbinden und wiederkehrende Arbeit reduzieren." },
      { title: "Dokument- & Signaturabläufe", text: "Dokumente in Ihrem Branding, PDF-Ausgabe und Schritte zur elektronischen Annahme." },
      { title: "Mobilfreundliche PWA", text: "Webanwendungen, die sich auf dem Startbildschirm installieren lassen und wie mobile Apps funktionieren." },
      { title: "Mandantenfähige SaaS-Architektur", text: "Skalierbare Strukturen, in denen jeder Kunde in seinem eigenen Raum und unter seiner eigenen Marke arbeitet." },
    ],
  },
  band: {
    eyebrow: "Nachweis unserer Kompetenz", title: "Wir haben ArvoOS entwickelt.",
    lead: "Die Probleme, die wir auf unserer eigenen Plattform gelöst haben, werden in Ihrem Projekt zu fertiger Erfahrung.",
    items: ["Mandantenfähige Struktur mit per DNS verifizierten eigenen Domains", "Elektronische Annahme mit handschriftlicher Signatur und A4-PDF-Dokumenten", "Kundenportal mit Dateiübergabe erst nach Zahlung", "Berechtigungen nach Rolle × Modul und zeilenbasierte Sicherheit", "Installierbare Mobile-first-PWA-Oberfläche"],
  },
  steps: {
    eyebrow: "Prozess", title: "Von der Discovery zur kontinuierlichen Weiterentwicklung.",
    items: [
      { title: "Discovery", text: "Gemeinsam erfassen wir Ihre Prozesse, Nutzer und Prioritäten." },
      { title: "Architektur & Design", text: "Datenmodell, Berechtigungsstruktur und Oberfläche gestalten wir mit Ihnen." },
      { title: "Entwicklung", text: "Wir entwickeln in kurzen Zyklen, in funktionsfähigen Teilen, und stimmen sie mit Ihnen ab." },
      { title: "Launch & Onboarding", text: "Wir nehmen das System in Betrieb und machen Ihr Team startklar." },
      { title: "Kontinuierliche Weiterentwicklung", text: "Wir verbessern Performance, Sicherheit und Nutzererlebnis auf Basis von Feedback." },
    ],
  },
  faq: { eyebrow: "FAQ", title: "Über Individualsoftware", items: [
    { q: "Welche Art von Individualsoftware entwickelt Arvo?", a: "Maßgeschneiderte Panels und Portale, Workflow-Software, Integrationen und Automatisierung, Dokument- und Signaturabläufe sowie mobilfreundliche PWA-Anwendungen." },
    { q: "Warum Individualsoftware statt eines fertigen Produkts?", a: "Wenn Ihre Prozesse nicht zu fertigen Produkten passen oder Sie Ihren Kunden ein Erlebnis in Ihrem Branding bieten wollen, kann Individualsoftware die bessere Wahl sein. Wir prüfen zunächst gemeinsam, ob ArvoOS Ihren Bedarf bereits abdeckt." },
    { q: "Wie wird ein Projekt kalkuliert?", a: "Nach Umfang. Nach dem Discovery-Gespräch erhalten Sie eine Roadmap und ein Angebot." },
    { q: "Bieten Sie nach dem Launch Support?", a: "Ja. Im Rahmen der laufenden Weiterentwicklung kümmern wir uns weiter um Wartung, Sicherheit und neue Funktionen." },
  ] },
  cta: { title: "Bauen wir ein System, das Ihnen gehört.", actions: [talk, { label: "Alle Leistungen", href: R("services"), variant: "ghost" }] },
  serviceName: "Entwicklung von Individualsoftware",
};
