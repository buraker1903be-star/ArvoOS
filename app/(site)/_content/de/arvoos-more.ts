// Almanca: arvoos-more-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;
const demo = { label: "Demo anfragen", href: `${R("contact")}?interest=arvoos`, variant: "gold" as const };
const parent = { id: "arvoos" as const, name: "ArvoOS" };

export const INDUSTRIES_DE: SubContent = {
  id: "arvoos-industries", parent,
  meta: { title: "ArvoOS-Branchen", description: "ArvoOS wird – mit Modulen, Ansichten und Berechtigungen – für Gesundheitseinrichtungen, Bildungseinrichtungen, Beratungs- und Dienstleistungsunternehmen sowie Unternehmen mit mehreren Standorten konfiguriert." },
  hero: {
    eyebrow: "ArvoOS · Branchen", title: "Keine Software von der Stange.", subtitle: "Ein System, das zu Ihnen passt.",
    lead: "Module, Ansichten und Berechtigungen von ArvoOS werden danach konfiguriert, wie Gesundheitswesen, Bildung, Beratung und Unternehmen mit mehreren Standorten tatsächlich arbeiten.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Auf Ihre Branche zugeschnitten", title: "Ein Kern. Ihre eigene Ordnung.", cols: "two",
    items: [
      { title: "Gesundheitseinrichtungen", text: "Klienten, Termine, Teams und Zahlungseingänge als Ganzes steuern.", items: ["Klientenanfragen und Terminkalender", "Team-, Rollen- und Berechtigungsstruktur", "Ratenpläne und Verfolgung der Zahlungseingänge"] },
      { title: "Bildungseinrichtungen", text: "Bildungsabläufe verbinden – von der Bewerbung bis zur Einschreibung, vom Zahlungsplan bis zu den Unterlagen.", items: ["Bewerbungsanfragen und Einschreibung", "Angebote, Verträge und E-Signatur", "Zahlungspläne und Zahlungseingänge"] },
      { title: "Beratung & Dienstleistung", text: "Machen Sie aus Kundenanfragen geplante, messbare und profitable Projekte.", items: ["CRM und Angebotsmanagement", "Projekt- und Lieferabläufe, Kundenportal", "Verträge, Finanzen und Rentabilität"] },
      { title: "Unternehmen mit mehreren Standorten", text: "Zentrale Standards wahren, während jedes Team seinen eigenen Betrieb schneller führt.", items: ["Gemeinsame Übersicht und Berichte aus der Zentrale", "Berechtigungen nach Rolle und Modul", "Zugriff auf Datensatzebene"] },
    ],
  },
  note: "Ihre Branche ist nicht dabei? Sprechen wir darüber: ArvoOS passt sich jedem Dienstleistungsunternehmen mit einem Zyklus aus Verkaufen, Liefern und Abrechnen an.",
  faq: { eyebrow: "FAQ", title: "Über die Branchen", items: [
    { q: "Für welche Branchen ist ArvoOS gedacht?", a: "Für Gesundheitseinrichtungen, Bildungseinrichtungen, Beratungs- und Dienstleistungsunternehmen sowie Unternehmen mit mehreren Standorten – allgemein für Dienstleister, die über mehrere Personen hinweg verkaufen, liefern und abrechnen." },
    { q: "Wie wird ArvoOS an unsere Branche angepasst?", a: "Module, Ansichten und Berechtigungen werden so konfiguriert, wie Ihre Organisation arbeitet; Vertragsvorlagen und Workflows werden um Ihre Prozesse herum eingerichtet." },
    { q: "Was umfasst eine branchenspezifische Einrichtung?", a: "Wir beginnen mit einer Bedarfsanalyse und bereiten dann eine persönliche Demo und einen Umstellungsplan vor." },
  ] },
  cta: { title: "Gestalten wir ArvoOS für Ihre Branche.", actions: [demo, { label: "Lösungen", href: R("arvoos-solutions"), variant: "ghost" }] },
};

export const SOLUTIONS_DE: SubContent = {
  id: "arvoos-solutions", parent,
  meta: { title: "ArvoOS-Lösungen", description: "ArvoOS schließt die Lücken zwischen Vertrieb und Kundenmanagement, Operations, Finanzkontrolle und Unternehmensführung in einem Ablauf." },
  hero: {
    eyebrow: "ArvoOS · Lösungen", title: "Jeder Engpass,", subtitle: "eine vernetzte Antwort.",
    lead: "ArvoOS verwaltet nicht nur Datensätze – es schließt die Lücken zwischen Vertrieb, Operations und Finanzen, damit die richtige Arbeit zur richtigen Zeit bei der richtigen Person ankommt.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Geschäftliche Anforderungen", title: "Lösen Sie es dort, wo es entsteht.", cols: "two",
    items: [
      { title: "Vertrieb & Kundenmanagement", text: "Jede Verkaufschance verfolgen und Angebote sowie Verträge beschleunigen.", items: ["Zentrale Kundenhistorie", "Links für Online-Annahme und E-Signatur", "Phasenbasierte Pipeline und Verlustgründe"] },
      { title: "Operations-Management", text: "Abgeschlossene Geschäfte werden zu einem Standardablauf, den Ihre Teams umsetzen können.", items: ["Workflow, der mit der Unterschrift startet", "Verfolgung von Verantwortlichen, Fristen und Fortschritt", "Kunden-Tracking-Portal"] },
      { title: "Finanzkontrolle", text: "Umsatz, Zahlungseingänge und Kosten direkt neben der Arbeit sehen.", items: ["Verknüpfung von Vertrieb und Finanzen", "Übersicht über Raten und Zahlungseingänge", "Tatsächliche Rentabilität je Auftrag"] },
      { title: "Unternehmensführung", text: "Berechtigungen, Datensätze und Reporting passend zu Ihrer wachsenden Struktur festlegen.", items: ["Berechtigungsmatrix Rolle × Modul", "Abschottung zwischen Organisationen", "Nachprüfbarer Aktivitätsverlauf"] },
    ],
  },
  faq: { eyebrow: "FAQ", title: "Über die Lösungen", items: [
    { q: "Welche Probleme löst ArvoOS?", a: "Die Lücken zwischen Vertrieb, Operations und Finanzen: dieselben Daten mehrfach erfassen, Angebote, die niemand nachverfolgt, unsichtbare Zuständigkeiten und Zahlungen ohne Bezug zur Arbeit." },
    { q: "Wie sind Vertrieb und Operations verbunden?", a: "Ein vom Kunden unterschriebener Vertrag startet den Auftragsablauf automatisch – mit fertigen Aufgaben, Verantwortlichen und Fristen." },
    { q: "Wie sehe ich die tatsächliche Rentabilität?", a: "Jedem Auftrag werden Kostenpositionen hinzugefügt; Berichte zeigen die tatsächliche Rentabilität je Auftrag neben Umsatz und Zahlungseingängen." },
  ] },
  cta: { title: "Nennen Sie uns Ihren Engpass. Wir bauen den Ablauf gemeinsam.", actions: [demo, { label: "Module", href: R("arvoos-modules"), variant: "ghost" }] },
};

export const PLANS_DE: SubContent = {
  id: "arvoos-plans", parent,
  meta: { title: "ArvoOS-Pakete", description: "ArvoOS-Pakete werden mit jeder Organisation anhand der benötigten Module, der Nutzerzahl, der Standortstruktur und individueller Workflows festgelegt." },
  hero: {
    eyebrow: "ArvoOS · Pakete", title: "Starten Sie mit dem, was Sie brauchen.", subtitle: "Wachsen Sie mit.",
    lead: "ArvoOS-Pakete werden gemeinsam mit Ihrer Organisation festgelegt – anhand der benötigten Module, der Nutzerzahl, der Standortstruktur und individueller Workflows.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Flexible Pakete", title: "Drei Ausgangspunkte.", cols: "three",
    items: [
      { title: "Starter", text: "Für Teams, die zentrale Kunden-, Auftrags- und Finanzprozesse in eine Ordnung bringen wollen.", items: ["Ausgewählte Kernmodule", "Standard-Rollenstruktur", "Unterstützung bei Einrichtung und Onboarding"] },
      { title: "Business", text: "Für Organisationen, die mehrere Teams oder Standorte mit vernetzten Prozessen führen.", items: ["Breite Modulauswahl", "Erweitertes Reporting", "Team- und Berechtigungsverwaltung"] },
      { title: "Individuell", text: "Für Organisationen, die ArvoOS in ihrer eigenen Arbeitsweise und Identität nutzen wollen.", items: ["Individuelle Workflows", "Ihre eigene Domain", "Kundenerlebnis in Ihrem Branding"] },
    ],
  },
  steps: {
    eyebrow: "So wird der Umfang festgelegt", title: "Finden wir gemeinsam das richtige Paket.",
    lead: "Investieren Sie in Geschäftsergebnisse – nicht in Funktionen, die Sie nicht brauchen.",
    items: [
      { title: "Bedarfsanalyse", text: "Gemeinsam erfassen wir Ihre Prozesse, Ihre Teamstruktur und die vorrangigen Module." },
      { title: "Persönliche Produktdemo", text: "Wir zeigen Ihnen ArvoOS anhand Ihrer eigenen Abläufe." },
      { title: "Skalierbarer Umstellungsplan", text: "Einrichtung, Datenübernahme und Onboarding des Teams planen wir Schritt für Schritt." },
    ],
  },
  note: `Die monatlichen und jährlichen Listenpreise für Starter und Business finden Sie unter ${R("pricing")}. Für Enterprise erstellen wir ein Angebot, sobald der Umfang feststeht.`,
  faq: { eyebrow: "FAQ", title: "Über die Pakete", items: [
    { q: "Was kostet ArvoOS?", a: `Die monatlichen und jährlichen Preise der Pakete Starter und Business finden Sie unter ${R("pricing")}. Abgerechnet wird pro Organisation, nicht pro Nutzer. Für Enterprise wird der Preis mit jeder Organisation anhand der Module, der Nutzerzahl und der Standortstruktur festgelegt.` },
    { q: "Mit welchem Paket sollte ich starten?", a: "Das entscheiden wir gemeinsam nach einer Bedarfsanalyse; die meisten Organisationen beginnen mit den Kernmodulen und erweitern mit der Zeit." },
    { q: "Kann ich mein Paket später ändern?", a: "Ja. Ihr Paket lässt sich erweitern, wenn sich Module, Nutzer und Standortstruktur ändern." },
    { q: "Können wir unsere eigene Domain verwenden?", a: "Ja. Eine eigene Domain wird per DNS-Verifizierung verbunden, und Anmelde- und Kundenseiten in Ihrem Branding laufen unter dieser Adresse." },
  ] },
  cta: { title: "Finden wir das richtige Paket für Ihre Organisation.", actions: [demo, { label: "Preise", href: R("pricing"), variant: "ghost" }] },
};
