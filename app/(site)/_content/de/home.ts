// Almanca: home-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { HomeContent } from "../home";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;

export const HOME_DE: HomeContent = {
  meta: {
    title: "Arvo | ArvoOS, ArvoLab und ArvoBook – bessere Systeme für bessere Arbeit",
    description: "Arvo entwickelt ArvoOS für Unternehmen, ArvoLab für Forschende und ArvoBook für Salons – und bietet Website- und E-Commerce-Design, SEO & GEO sowie Individualsoftware.",
  },
  hero: {
    eyebrow: "Die Arvo-Produktfamilie",
    title: "Bessere Systeme", subtitle: "für bessere Arbeit.",
    lead: "Arvo ist eine Softwaremarke, die ArvoOS für Unternehmen, ArvoLab für Forschende und ArvoBook für Salons entwickelt. Wir verwandeln komplexe Arbeit in ruhige, leistungsstarke und vernetzte Erlebnisse.",
    actions: [
      { label: "Demo anfragen", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Produkte entdecken", href: "#produkte", variant: "ghost" },
    ],
    familyLabel: "Arvo-Produkte",
  },
  statement: ["Die Komplexität bleibt im Hintergrund.", "Was bleibt, ist Fortschritt.", "Jedes Arvo-Produkt folgt einem Prinzip:", "Selbst der anspruchsvollste Prozess soll sich natürlich anfühlen."],
  products: {
    eyebrow: "Die Produktfamilie",
    title: "Stark für heute. Bereit für morgen.",
    lead: "Drei Produkte, jedes ein Spezialist auf seinem Gebiet. Zusammen ein Ökosystem, das Ihre Arbeitsweise abdeckt.",
    os: {
      label: "Betriebssystem für Unternehmen", title: "Ihr ganzes Unternehmen. Ein Ablauf.",
      text: "Von CRM und Vertrieb über elektronisch signierte Verträge bis zu Operations, Finanzen, Personal und Reporting – jeder Schritt in einem System verbunden.",
      chips: ["CRM & Vertrieb", "Angebote & E-Signatur", "Operations", "Kundenportal", "Finanzen", "Personal & Berichte"],
      cta: { label: "ArvoOS entdecken", href: R("arvoos"), variant: "gold" },
      signIn: { label: "Anmelden", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    },
    lab: {
      label: "Arbeitsumgebung für die Forschung", title: "Ein stärkerer Arbeitsplatz für Ihre Forschung.",
      text: "Von der Literatur bis zum wissenschaftlichen Schreiben, von der Richtlinienprüfung bis zur Analyse – die zentralen Schritte der Forschung in einer ruhigen Arbeitsumgebung.",
      chips: ["Literatur & Zitate", "Wissenschaftliches Schreiben", "Richtlinienprüfung", "Analyse"],
      cta: { label: "ArvoLab entdecken", href: R("arvolab"), variant: "primary" },
      signIn: { label: "Anmelden", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    },
    book: {
      label: "Terminverwaltung für Salons", title: "Das Telefon bleibt frei vom Terminbuch.",
      text: "Ihre Kundschaft wählt Leistung, Mitarbeiterin oder Mitarbeiter und Uhrzeit selbst – der Termin landet sofort in Ihrem Kalender. Kalender je Mitarbeiter, Arbeitszeiten und Abwesenheiten, keine Doppelbuchungen.",
      chips: ["Online-Buchungsseite", "Mitarbeiterkalender", "Arbeitszeiten & Abwesenheiten", "Kundenkartei"],
      cta: { label: "ArvoBook entdecken", href: R("randevu"), variant: "gold" },
      signIn: { label: "Anmelden", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    },
  },
  global: {
    badges: ["6 Sprachen", "EUR · USD · TRY", "Jeder Browser, jedes Gerät"],
    eyebrow: "Funktioniert überall",
    title: "Wo immer Sie arbeiten.",
    lead: "Arvo-Produkte sind Webanwendungen, die im Browser laufen: keine Installation, keine eigenen Server, dasselbe System, wo auch immer Ihr Team arbeitet.",
    items: [
      { title: "Sechs Sprachen", text: "Deutsch, English, Türkçe, Español, Français und العربية — einschließlich Rechts-nach-links." },
      { title: "Preise in EUR, USD und TRY", text: "Ein fester Listenpreis je Währung; keine Beträge, die mit dem Wechselkurs schwanken." },
      { title: "Jeder Browser, jedes Gerät", text: "Dasselbe Erlebnis auf Desktop, Tablet und Smartphone. Nichts auf Ihren Servern zu installieren." },
      { title: "Ihre Daten, Ihr Bereich", text: "Jede Organisation arbeitet in ihrem eigenen, getrennten Bereich; Rollen entscheiden, wer was sieht." },
    ],
    from: "Ab {price}", perMonth: "/Monat", perUserMonth: "/Nutzer/Monat", onRequest: "Auf Anfrage",
  },
  band: {
    words: ["CRM", "Angebote", "E-Signatur", "Operations", "Kundenportal", "Finanzen", "Personal", "Berichte"],
    caption: "Ein Kern. Dreizehn vernetzte Funktionsbereiche.",
  },
  story: {
    eyebrow: "ArvoOS",
    title: "Von der Anfrage bis zur Zahlung. Ein Ablauf.",
    lead: "Einmal erfasste Daten wandern von selbst durch jeden Schritt. Niemand tippt dasselbe zweimal.",
    cta: { label: "Module ansehen", href: R("arvoos-modules"), variant: "primary" },
    steps: [
      { title: "Anfrage", text: "Eine Anfrage landet in der CRM-Pipeline; die Kundenhistorie erscheint automatisch und ein Vertriebsmitarbeiter wird zugewiesen." },
      { title: "Angebot", text: "Ein Angebot mit MwSt.-Optionen und Zahlungsplan wird per WhatsApp oder E-Mail geteilt; der Kunde nimmt es online mit einem Klick an." },
      { title: "E-Signatur", text: "Aus dem angenommenen Angebot wird in einem Schritt ein Vertrag; der Kunde unterschreibt handschriftlich am Bildschirm. Der Inhalt wird mit Zeitstempel und Prüfhash gesperrt." },
      { title: "Workflow", text: "Die Unterschrift startet den Auftragsablauf automatisch: Aufgaben, Verantwortliche, Fristen, ein Phasen-Board und ein Kalender." },
      { title: "Tracking-Portal", text: "Mit einem Tracking-Code verfolgt der Kunde Fortschritt und Dokumente auf einer Seite in Ihrem Branding und schreibt Ihrem Team direkt." },
      { title: "Online-Zahlung", text: "Raten werden über Online-Zahlungslinks eingezogen; Lieferergebnisse bleiben bis zur Zahlung gesperrt." },
      { title: "Berichte", text: "Vertriebstrichter, der schwächste Schritt und die tatsächliche Rentabilität je Auftrag – auf einem Bildschirm." },
    ],
  },
  eco: {
    eyebrow: "Ökosystem",
    title: "Drei Produkte. Ein Ökosystem.",
    lead: "ArvoOS, ArvoLab und ArvoBook sind eigenständige Webanwendungen, jede auf einer eigenen Subdomain von arvo-os.com – entwickelt vom selben Team nach einem gemeinsamen Marken- und Qualitätsstandard.",
    roles: ["Operations", "Forschung", "Salons"],
    principles: [
      { title: "Ein eigener Raum", text: "Jede Organisation, jedes Team und jeder Salon arbeitet in einem eigenen Arbeitsbereich." },
      { title: "Eine Designsprache", text: "Dieselbe ruhige Oberfläche und dieselbe Sorgfalt – in jedem Produkt." },
      { title: "Produkte, die mitwachsen", text: "Wenn Ihre Organisation wächst, wächst die Produktfamilie mit." },
    ],
  },
  values: {
    eyebrow: "Unsere Prinzipien",
    title: "Wie wir gestalten.",
    items: [
      { title: "Einfach.", text: "Nichts Überflüssiges. Alles, was Sie brauchen, genau dort, wo es hingehört." },
      { title: "Leistungsstark.", text: "Zuverlässige, kontrollierte und skalierbare Grundlagen für kritische Arbeit." },
      { title: "Ganzheitlich.", text: "Eine nahtlose Arbeitsweise über Produkte, Teams und Daten hinweg." },
    ],
  },
  services: {
    eyebrow: "Leistungen",
    title: "Das Team hinter unseren Produkten arbeitet auch für Sie.",
    lead: "Von der Website bis zur Individualsoftware bringen wir Ihre Marke und Ihre Prozesse in ihre stärkste digitale Form.",
    items: [
      { tag: "Design & Entwicklung", title: "Webdesign", text: "Strategie, Inhaltsarchitektur, UX/UI-Design, Entwicklung und Launch in einem Prozess.", href: R("web-design") },
      { tag: "Sichtbarkeit", title: "SEO & GEO", text: "Inhaltliche und technische Grundlagen, die Suchmaschinen und KI-Antwortmaschinen verstehen – und zitieren können.", href: R("seo-geo") },
      { tag: "Software", title: "Individualsoftware", text: "Maßgeschneiderte Panels, Portale und Workflow-Software; Integrationen und Automatisierung.", href: R("custom-software") },
    ],
    more: "Mehr erfahren",
    cta: { label: "Alle Leistungen", href: R("services"), variant: "ghost" },
    all: { title: "Und mehr", text: "Digitale Leistungen aus einer Hand – von der Strategie bis zum Launch.", items: ["Prozess- & Experience-Design", "Digitale Unternehmenssysteme", "Laufende Weiterentwicklung"] },
  },
  refs: { eyebrow: "Referenzen", title: "Marken, mit denen wir arbeiten.", lead: "Eine Markenfamilie, die denselben Qualitätsanspruch teilt und gemeinsam Wert schafft.", culture: "Website besuchen", akademik: "Website besuchen" },
  faq: {
    eyebrow: "FAQ",
    title: "Fragen zu Arvo",
    items: [
      { q: "Was ist Arvo?", a: `Arvo ist die Softwaremarke von ${COMPANY.legalName}. Arvo entwickelt ArvoOS für Unternehmen, ArvoLab für Forschende und ArvoBook für Salons und bietet außerdem Website- und E-Commerce-Design sowie Individualsoftware an.` },
      { q: "Worin unterscheiden sich ArvoOS, ArvoLab und ArvoBook?", a: "ArvoOS steuert die Abläufe eines Unternehmens von der Anfrage bis zur Zahlung. ArvoLab unterstützt wissenschaftliche Forschung und das Schreiben. ArvoBook führt das Terminbuch eines Salons: Kundinnen und Kunden buchen selbst, der Kalender ist nach Mitarbeitenden gegliedert." },
      { q: "Wo melde ich mich bei den Arvo-Produkten an?", a: `ArvoOS läuft unter ${PRODUCT_APPS.arvoos.host}, ArvoLab unter ${PRODUCT_APPS.arvolab.host} und ArvoBook unter ${PRODUCT_APPS.randevu.host}. Alle drei sind Webanwendungen, die im Browser laufen.` },
      { q: "Was kostet ArvoOS?", a: `Die monatlichen und jährlichen Listenpreise finden Sie unter ${ROUTES.pricing.de}; abgerechnet wird pro Organisation, nicht pro Nutzer. Für Enterprise wird der Preis gemeinsam mit jeder Organisation festgelegt.` },
      { q: "Wie fordere ich eine Demo an?", a: `Füllen Sie das Formular auf der Kontaktseite aus oder schreiben Sie an ${COMPANY.email}; Ihre Anfrage geht an das zuständige Produktteam.` },
    ],
  },
  cta: {
    eyebrow: "Eine Demo für Ihre Organisation",
    title: "Lassen Sie uns gemeinsam die Systeme von morgen bauen.",
    lead: "Wir zeigen Ihnen, wie ArvoOS, ArvoLab oder ArvoBook für Sie arbeiten würde.",
    actions: [
      { label: "Demo anfragen", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Lernen Sie uns kennen", href: R("about"), variant: "ghost" },
    ],
    note: "oder schreiben Sie uns direkt:",
  },
};
