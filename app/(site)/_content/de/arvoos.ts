// Almanca: arvoos-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import { HOME_DE } from "./home";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;

export const ARVOOS_DE: ProductContent = {
  id: "arvoos",
  name: "ArvoOS",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.arvoos.url,
  featureList: ["CRM und Vertriebspipeline", "Angebote mit Online-Annahme", "Elektronisch signierte Verträge und A4-PDF", "Dokumentenzentrale", "Operations, Phasen-Board und Kalender", "Kunden-Tracking-Portal", "Kundenkonten, Ratenzahlungen und Online-Zahlungslinks", "Personal und Provisionen", "Berichte und Rentabilität", "Team-Messaging und Benachrichtigungen", "Berechtigungsmatrix Rolle × Modul", "Eigene Domain und Branding", "Installierbare PWA"],
  meta: {
    title: "ArvoOS – Betriebssystem für Unternehmen",
    description: "ArvoOS ist ein mandantenfähiges Betriebssystem für Unternehmen, das CRM, Angebote mit Online-Annahme, elektronisch signierte Verträge, Operations, ein Kundenportal, Finanzen, Personal und Berichte in einem Ablauf verbindet.",
  },
  hero: {
    eyebrow: "ArvoOS · Betriebssystem für Unternehmen",
    title: "Ihr ganzes Unternehmen.", subtitle: "Ein Ablauf.",
    lead: "ArvoOS ist ein mandantenfähiges, webbasiertes Betriebssystem für Unternehmen, das Dienstleister und Institutionen von der ersten Kundenanfrage bis zur letzten Zahlung in einem durchgängigen Ablauf steuert.",
    actions: [
      { label: "Demo anfragen", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Anmelden", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Was leistet ArvoOS?",
    title: "Sie behalten die Kontrolle. Das Chaos bleibt zurück.",
    lead: "Verstreute Tabellen, unverbundene Tools und unsichtbare Zuständigkeiten – zusammengeführt in einer geordneten Arbeitsweise.",
    items: [
      { title: "Angebote", text: "Revisionen, MwSt.-Optionen und Zahlungspläne; Kunden nehmen online mit einem Klick an.", size: "hero", visual: "s1" },
      { title: "CRM & Vertrieb", text: "Pipeline-Phasen, automatische Kundenhistorie, sofortige Kundensuche und ein Vertriebskalender." },
      { title: "E-signierte Verträge", text: "Vorlagen, handschriftliche Signatur und Einwilligungserklärungen; nach der Unterschrift ist der Inhalt gesperrt, mit A4-PDF-Ausgabe." },
      { title: "Operations", text: "Auftragstabelle, Phasen-Board, Kalender, Aufgaben und Verantwortliche. Die Unterschrift startet den Workflow automatisch." },
      { title: "Finanzen", text: "Kundenkonten, Ratenpläne, Online-Zahlungslinks, Rechnungen und Rentabilität je Auftrag." },
      { title: "Kunden-Tracking-Portal", text: "Kunden verfolgen Fortschritt, Dokumente und eine Zahlungsübersicht auf einer Seite in Ihrem Branding – per Tracking-Code.", size: "hero", alt: true, visual: "s4" },
      { title: "Personal", text: "Mitarbeitende, Rollen, Provisionsberechnung, Aktivitätsprotokolle und elektronisch signierte Vertraulichkeitsvereinbarungen." },
      { title: "Berichte", text: "Vertriebstrichter mit markiertem schwächstem Schritt, tatsächliche Rentabilität, Trends und Verlustgründe." },
      { title: "Kommunikation", text: "Team-Messaging, eine Benachrichtigungszentrale, Ankündigungen der Geschäftsleitung und Support-Tickets.", size: "wide" },
    ],
  },
  flow: {
    eyebrow: "Von der Anfrage bis zur Zahlung",
    title: "Einmal erfassen. In jedem Schritt bereit.",
    lead: HOME_DE.story.lead,
    steps: HOME_DE.story.steps,
    cta: { label: "Alle Module ansehen", href: R("arvoos-modules"), variant: "primary" },
  },
  audience: {
    eyebrow: "Für wen ist es gedacht?",
    title: "Für jedes Team, das verkauft, liefert und abrechnet.",
    lead: "Dienstleister und Institutionen, bei denen Vertrieb, Leistungserbringung und Inkasso über mehrere Personen, Teams oder Standorte laufen.",
    more: "Nach Branche konfiguriert",
    items: [
      { title: "Gesundheitseinrichtungen", text: "Klientenanfragen, Termine, Teams und Zahlungseingänge in einer Ordnung.", href: R("arvoos-industries") },
      { title: "Bildungseinrichtungen", text: "Von der Bewerbung bis zur Einschreibung, vom Zahlungsplan bis zu den Unterlagen.", href: R("arvoos-industries") },
      { title: "Beratung & Dienstleistung", text: "Machen Sie aus Anfragen geplante, messbare und profitable Projekte.", href: R("arvoos-industries") },
      { title: "Unternehmen mit mehreren Standorten", text: "Zentrale Standards wahren, während jedes Team schneller vorankommt.", href: R("arvoos-industries") },
    ],
  },
  band: {
    eyebrow: "Unter Ihrer Marke",
    title: "Ihre Domain. Ihre Marke.",
    lead: "Jede Organisation arbeitet in einem eigenen, abgeschotteten Arbeitsbereich – vom Anmeldebildschirm bis zum letzten Dokument sehen Ihre Kunden nur Ihre Marke.",
    items: [
      "Eigene Domain, per DNS verifiziert",
      "Anmelde- und Kundenseiten in Ihrem Branding",
      "Logo, Markenfarbe, Stempel und Unterschrift",
      "Rechtliche Angaben und Bankdaten automatisch in Angeboten und Verträgen",
      "Berechtigungen nach Rolle × Modul und Änderungsverlauf",
      "Installierbare PWA, die wie eine mobile App funktioniert",
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Über ArvoOS",
    items: [
      { q: "Was ist ArvoOS?", a: "ArvoOS ist ein webbasiertes, mandantenfähiges Betriebssystem für Unternehmen. Es verbindet CRM und Vertrieb, Angebote, elektronisch signierte Verträge, Operations, ein Kunden-Tracking-Portal, Finanzen, Personal, Berichte und Teamkommunikation in einem Ablauf." },
      { q: "Wie führt ArvoOS einen Auftrag von der Anfrage bis zur Zahlung?", a: "Eine Anfrage gelangt in die Pipeline und wird zum Angebot; der Kunde nimmt es online an und unterschreibt den Vertrag elektronisch. Die Unterschrift startet den Auftragsablauf, der Kunde verfolgt den Fortschritt im Portal, und Raten werden über Online-Zahlungslinks eingezogen." },
      { q: "Unterstützt ArvoOS elektronische Signaturen?", a: "Ja. Kunden unterschreiben handschriftlich am Bildschirm und mit Einwilligungserklärungen; IP-Adresse, Zeitstempel, Gerät und ein Prüfhash werden gespeichert, und der Inhalt wird nach der Unterschrift gesperrt." },
      { q: "Kann ArvoOS unter unserer eigenen Domain und mit unserem Branding laufen?", a: "Ja. Sie können eine per DNS verifizierte eigene Domain verbinden und Ihr Logo, Ihre Markenfarbe, Ihren Stempel und Ihre Unterschrift auf Anmeldeseiten, Kundenseiten, Angeboten und Verträgen verwenden." },
      { q: "Funktioniert ArvoOS auf dem Smartphone?", a: "Ja. ArvoOS lässt sich als PWA installieren und funktioniert wie eine mobile App – mit unterer Tab-Leiste und Bottom Sheets." },
      { q: "Was kostet ArvoOS?", a: `Die monatlichen und jährlichen Preise der Pakete Starter und Business finden Sie unter ${ROUTES.pricing.de}. Abgerechnet wird pro Organisation, nicht pro Nutzer. Für Enterprise wird der Preis mit jeder Organisation anhand der Module, der Nutzerzahl und der Standortstruktur festgelegt.` },
    ],
  },
  cta: {
    eyebrow: "Eine Demo für Ihre Organisation",
    title: "Gestalten wir gemeinsam, wie ArvoOS in Ihrem Unternehmen arbeitet.",
    lead: "Erzählen Sie uns von Ihren Anforderungen – wir zeigen Ihnen ArvoOS anhand Ihrer eigenen Abläufe.",
    actions: [
      { label: "Demo anfragen", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Pakete ansehen", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
