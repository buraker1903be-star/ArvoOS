/*
  Almanca: randevu-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin
  çevrildi. Aynı kural geçerli: yalnızca yayındaki özellikler.
*/
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;

export const RANDEVU_DE: ProductContent = {
  id: "randevu",
  name: "ArvoBook",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.randevu.url,
  featureList: [
    "Online-Buchungsseite",
    "Kalender je Mitarbeiter",
    "Leistungen und Mitarbeitende",
    "Arbeitszeiten und Abwesenheiten",
    "Kundenkartei",
    "WhatsApp-Erinnerungen",
  ],
  meta: {
    title: "ArvoBook – Terminverwaltung für Salons",
    description:
      "Online-Terminbuchung für Friseur- und Kosmetiksalons: Kundinnen und Kunden wählen Leistung, Mitarbeitende und Uhrzeit selbst; Kalender je Mitarbeiter, Arbeitszeiten und Abwesenheiten, WhatsApp-Erinnerungen.",
  },
  hero: {
    eyebrow: "ArvoBook · Terminverwaltung für Salons",
    title: "Lassen Sie die Buchungsseite",
    subtitle: "ans Telefon gehen.",
    lead:
      "Ihre Kundschaft bucht selbst, und der Termin steht sofort in Ihrem Kalender. Freie Zeiten richten sich danach, wer welche Leistung anbietet – ein überschneidender Termin gelangt gar nicht erst ins System.",
    actions: [
      { label: "Preise ansehen", href: R("pricing"), variant: "gold" },
      { label: "Panel öffnen", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Funktionen",
    title: "Der Salontag auf einem Bildschirm.",
    lead:
      "Ein telefonisch vereinbarter Termin wandert in ein Papierbuch, das Buch wird falsch gelesen, die Uhrzeit überschneidet sich. ArvoBook baut diese Kette von Grund auf neu.",
    items: [
      {
        title: "Online-Buchungsseite",
        text: "Die Kundin oder der Kunde wählt die Leistung, die Mitarbeiterin oder den Mitarbeiter – oder „egal wer“ – und die Uhrzeit. Ohne Registrierung: Die Identifizierung erfolgt über die Telefonnummer, dazu gibt es einen Stornierungslink.",
      },
      {
        title: "Kalender je Mitarbeiter",
        text: "Termine anlegen, verschieben und stornieren. Der Kalender ist nach Mitarbeitenden gegliedert, sodass auf einen Blick sichtbar ist, wer wann frei ist.",
      },
      {
        title: "Leistungen und Mitarbeitende",
        text: "Die Dauer einer Leistung, die Pufferzeit danach und wer sie ausführt, werden an einer Stelle festgelegt.",
      },
      {
        title: "Arbeitszeiten und Abwesenheiten",
        text: "Wöchentliche Arbeitszeiten werden in der Ortszeit des Salons erfasst. Abwesenheiten lassen sich für eine Person oder den ganzen Salon festlegen; in diesem Zeitraum werden keine Termine angeboten.",
      },
      {
        title: "Überschneidungen blockiert die Datenbank",
        text: "Ein überschneidender Termin bei derselben Person – einschließlich der Pufferzeit der Leistung – wird auf Datenbankebene abgelehnt. „Erst prüfen, dann schreiben“ reicht uns nicht.",
      },
      {
        title: "WhatsApp-Erinnerungen",
        text: "Die Erinnerungsliste des Tages liegt im Panel bereit und wird mit einem Tipp über WhatsApp versendet. Hat der Salon seine eigene Nummer verbunden, kommt die Nachricht vom Salon statt von ArvoOS.",
      },
    ],
  },
  flow: {
    eyebrow: "Erste Schritte",
    title: "Die Einrichtung dauert eine Sitzung.",
    lead: "Ihre Buchungsadresse funktioniert, sobald Leistungen und Mitarbeitende angelegt sind.",
    steps: [
      { title: "Salon beschreiben", text: "Der Einrichtungsassistent fragt nacheinander Leistungen, Mitarbeitende und Arbeitszeiten ab." },
      { title: "Adresse teilen", text: "Platzieren Sie Ihre Buchungsseite in Ihrem Instagram-Profil, Ihrem WhatsApp-Status oder auf Ihrer Visitenkarte." },
      { title: "Kalender im Blick", text: "Buchungen landen im Kalender; die Erinnerungsliste ist zu Tagesbeginn fertig." },
    ],
  },
  audience: {
    eyebrow: "Für wen es gedacht ist",
    title: "Für jeden Salon, der mit Terminen arbeitet.",
    items: [
      { title: "Friseure und Barbiere", text: "Ein voller Tag pro Stuhl – für Salons, die lieber den Hörer auflegen und weiterarbeiten." },
      { title: "Kosmetikstudios", text: "Teams, die Leistungen mit unterschiedlicher Dauer und Pufferzeit im selben Kalender führen." },
      { title: "Pflege und Nachbehandlung", text: "Betriebe, die Termine nach Fachgebiet der Mitarbeitenden anbieten und deren Abwesenheiten sich oft ändern." },
    ],
  },
  faq: {
    eyebrow: "Häufige Fragen",
    title: "Über ArvoBook",
    items: [
      { q: "Müssen sich Kunden registrieren?", a: "Nein. Die Kundin oder der Kunde wählt Leistung, Mitarbeitende und Uhrzeit und gibt eine Telefonnummer ein; die Identifizierung erfolgt über diese Nummer, dazu gibt es einen Stornierungslink." },
      { q: "Können zwei Termine auf dieselbe Zeit fallen?", a: "Nein. Ein überschneidender Termin bei derselben Person – einschließlich der Pufferzeit der Leistung – wird auf Datenbankebene abgelehnt, nicht durch eine Prüfung in der Oberfläche." },
      { q: "Wie werden Arbeitszeiten und Abwesenheiten festgelegt?", a: "Wöchentliche Arbeitszeiten werden in der Ortszeit des Salons erfasst. Abwesenheiten lassen sich für eine einzelne Person oder den ganzen Salon festlegen; in diesem Zeitraum werden keine Termine angeboten." },
      { q: "Von wem kommt die Erinnerung?", a: "Die Erinnerungsliste des Tages wird im Panel vorbereitet und mit einem Tipp über WhatsApp versendet. Hat der Salon seine eigene WhatsApp-Nummer verbunden, kommt sie vom Salon, andernfalls von der gemeinsamen Nummer von ArvoOS." },
      { q: "Was kostet es?", a: `Die monatlichen und jährlichen Listenpreise finden Sie unter ${R("pricing")}.` },
    ],
  },
  cta: {
    title: "Bereit, das Papierbuch wegzulegen?",
    lead: "Wir richten es mit Ihnen ein; sobald Leistungen und Mitarbeitende angelegt sind, ist Ihre Buchungsseite noch am selben Tag online.",
    actions: [
      { label: "Demo anfragen", href: `${R("contact")}?interest=randevu`, variant: "gold" },
      { label: "Preise", href: R("pricing"), variant: "ghost" },
    ],
  },
};
