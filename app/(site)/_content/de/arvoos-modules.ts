// Almanca: arvoos-modules-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;

export const MODULES_DE: SubContent = {
  id: "arvoos-modules",
  parent: { id: "arvoos", name: "ArvoOS" },
  meta: {
    title: "ArvoOS-Module",
    description: "ArvoOS-Module: CRM und Vertrieb, Angebote, Verträge, Dokumentenzentrale, Operations, Kunden-Tracking-Portal, Finanzen, Personal, Berichte, Kommunikation, Governance, Branding und mobile Nutzung.",
  },
  hero: {
    eyebrow: "ArvoOS · Module",
    title: "Keine einzelnen Tools.", subtitle: "Module, die zusammenarbeiten.",
    lead: "Die ArvoOS-Module sind 13 Funktionsbereiche, die auf denselben Daten arbeiten: Was in einem Modul beginnt, geht ins nächste über, ohne dass jemand es neu erfassen muss.",
    actions: [{ label: "Demo anfragen", href: `${R("contact")}?interest=arvoos`, variant: "gold" }],
  },
  cards: {
    eyebrow: "Funktionsbereiche",
    title: "Jeder Winkel Ihres Unternehmens. Ein Kern.",
    lead: "Starten Sie mit den Modulen, die Sie brauchen, und erweitern Sie das System, wenn Ihr Team und Ihre Prozesse wachsen.",
    cols: "two", numbered: true,
    items: [
      { title: "CRM & Vertrieb", size: "hero", visual: "s0", text: "Der Vertriebsablauf, der aus Anfragen Kunden und aus Kunden Umsatz macht.", items: ["Phasenbasierte Pipeline mit Verlustgründen", "Automatische Kundenhistorie bei neuen Anfragen", "Sofortige Kundensuche nach Telefonnummer oder Name", "Zuweisung von Vertriebsmitarbeitern und Vertriebskalender"] },
      { title: "Angebote", text: "Der kaufmännische Prozess, vom Entwurf bis zur Annahme.", items: ["Revisionen; MwSt. inklusive, exklusive oder befreit", "Einmalzahlung oder Ratenplan", "Links per WhatsApp und E-Mail teilen", "Online-Annahme mit Datum, Uhrzeit, IP und Gerät protokolliert"] },
      { title: "Verträge", text: "Aus dem Angebot in einem Schritt ein unterschriftsreifer Vertrag.", items: ["Vertragsvorlagen", "E-Signatur mit handschriftlicher Unterschrift und Einwilligungserklärungen", "IP, Zeitstempel, Gerät und Prüfhash", "Inhalt nach der Unterschrift gesperrt, A4-PDF"] },
      { title: "Dokumentenzentrale", text: "Alle Dokumente eines Geschäftsvorgangs auf einer Zeitleiste.", items: ["Anfrage → Angebot → Vertrag → Operations → Zahlung", "Protokolle der Dokumentzugriffe", "Vorschau und PDF"] },
      { title: "Operations", size: "hero", alt: true, visual: "s3", text: "Verkaufte Arbeit wird zu einem Ablauf, den Ihre Teams umsetzen können.", items: ["Neue, laufende und bald fällige Aufträge", "Auftragstabelle, Phasen-Board und Auftragskalender", "Team-Auslastung: wer hat was, wer ist im Verzug, wer ist frei", "Schrittvorlagen je Auftragsart", "Workflow, der mit der Unterschrift startet, plus Archiv"] },
      { title: "Kunden-Tracking-Portal", text: "Eine Seite in Ihrem Branding, auf der Ihr Kunde seinen eigenen Auftrag verfolgt.", items: ["Fortschritt und Phasen per Tracking-Code", "Zahlungsübersicht, Angebots- und Vertragsdokumente", "Nachrichten mit dem Operations-Team", "Letzter Besuch, Anzahl der Besuche und Online-Anzeige", "Dateiübergabe erst nach Zahlung, über kurzlebige sichere Links"] },
      { title: "Finanzen", text: "Ein aktuelles Finanzbild, verknüpft mit Vertrieb und Operations.", items: ["Kundenkonten und Buchungen", "Zahlungseingänge, Erstattungen und Zusatzleistungen", "Ratenpläne mit einem Online-Zahlungslink je Rate", "Rechnungen, Kosten je Auftrag und tatsächliche Rentabilität"] },
      { title: "Personal", text: "Teamstruktur und Personalprozesse in einer Ordnung.", items: ["Mitarbeitende, Abteilungen und E-Mail-Einladungen", "Rollen und Provisionen mit Satzhistorie", "Provisionszahlungen, Aufträgen zugeordnet, mit Vorschüssen", "Aktivitäts- und Sitzungsprotokolle der Mitarbeitenden", "Elektronisch signierte Vertraulichkeitsvereinbarungen (NDA) für Mitarbeitende"] },
      { title: "Berichte", text: "Aus den Daten aller Module werden Entscheidungen.", items: ["Vertriebstrichter mit markiertem schwächstem Schritt", "Umsatz und tatsächliche Rentabilität", "Sechsmonatstrends und Verlustgründe", "Druck und PDF"] },
      { title: "Kommunikation", text: "Teamgespräche direkt neben der Arbeit.", items: ["Direktnachrichten mit Anhängen", "Benachrichtigungszentrale mit Live-Zähler", "Push-Benachrichtigungen auf Smartphone und Desktop", "Ankündigungen der Geschäftsleitung", "Support-Center"] },
      { title: "Governance & Sicherheit", text: "Wer was sieht – klar und nachprüfbar.", items: ["Berechtigungsmatrix Rolle × Modul und Aktionsrechte", "Fertige Profile: Operations-Manager, Vertriebsleiter", "Zugriff auf Datensatzebene und personenbezogene Ausnahmen", "Zeilenbasierte Sicherheit in der Datenbank", "Änderungsverlauf"] },
      { title: "Mandantenfähigkeit & Branding", text: "Jede Organisation in ihrem eigenen Raum, unter ihrer eigenen Marke.", items: ["Abgeschotteter Arbeitsbereich je Organisation", "Eigene Domain mit DNS-Verifizierung", "Logo, Markenfarbe, Tab-Icon, Stempel und Unterschrift", "Eigene Vertrags- und Angebotsklauseln", "Rechtliche Angaben und Bankdaten automatisch in Dokumenten"] },
      { title: "Nutzererlebnis", size: "wide", text: "Leistungsstark am Desktop, so einfach wie eine App auf dem Smartphone.", items: ["Installierbare PWA", "Untere Tab-Leiste und Bottom Sheets", "Dunkles und helles Design", "Türkische Benutzeroberfläche"] },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Über die Module",
    items: [
      { q: "Welche Module umfasst ArvoOS?", a: "CRM und Vertrieb, Angebote, Verträge, Dokumentenzentrale, Operations, Kunden-Tracking-Portal, Finanzen, Personal, Berichte und Kommunikation – ergänzt durch Governance, Branding und mobile Nutzung." },
      { q: "Wie sind die Module miteinander verbunden?", a: "Alle arbeiten auf denselben Daten: Ein angenommenes Angebot wird in einem Schritt zum Vertrag, ein unterschriebener Vertrag wird automatisch zum Auftragsablauf, und Zahlungen sowie Rentabilität bleiben mit demselben Auftrag verknüpft." },
      { q: "Müssen wir alle Module nutzen?", a: "Nein. Ihr Paket wird um die Module herum aufgebaut, die Sie brauchen, und lässt sich erweitern, wenn das System wächst." },
      { q: "Wer sieht welches Modul?", a: "Das regelt die Berechtigungsmatrix Rolle × Modul; Rollen wie Vertriebsmitarbeiter lassen sich auf ihre eigenen Datensätze beschränken." },
    ],
  },
  cta: {
    title: "Entscheiden wir, mit welchen Modulen Sie starten.",
    actions: [
      { label: "Demo anfragen", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Pakete", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
