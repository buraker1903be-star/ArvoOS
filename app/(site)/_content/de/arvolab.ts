// Almanca: arvolab-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;

export const ARVOLAB_DE: ProductContent = {
  id: "arvolab",
  name: "ArvoLab",
  category: "EducationalApplication",
  appUrl: PRODUCT_APPS.arvolab.url,
  featureList: ["Literatur- und Zitatverwaltung", "Wissenschaftliches Schreiben", "Richtlinienprüfung", "Quantitative und qualitative Analyse", "Wissenschaftlicher Editor", "Originalitäts-Vorprüfung"],
  meta: {
    title: "ArvoLab – Arbeitsumgebung für die Forschung",
    description: "ArvoLab vereint Literatur- und Zitatverwaltung, wissenschaftliches Schreiben, Richtlinienprüfung, quantitative und qualitative Analyse, einen wissenschaftlichen Editor und eine Originalitäts-Vorprüfung in einer Arbeitsumgebung.",
  },
  hero: {
    eyebrow: "ArvoLab · Arbeitsumgebung für die Forschung",
    title: "Ein stärkerer Arbeitsplatz", subtitle: "für die Forschung.",
    lead: "ArvoLab ist eine webbasierte Arbeitsumgebung für die Forschung, die die zentralen Schritte wissenschaftlicher Arbeit – von der Literatur bis zum Schreiben, von der Dokumentprüfung bis zur Analyse – an einem Ort zusammenführt.",
    actions: [
      { label: "Kostenlos testen", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Bei ArvoLab anmelden", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Funktionen",
    title: "Ein klarerer Prozess. Stärkere Ergebnisse.",
    lead: "Holen Sie verstreute Forschungstools und Prüfungen in einen vernetzten Raum, in dem Sie Ihre Arbeit als Ganzes sehen.",
    items: [
      { title: "Literatur & Zitate", text: "DOI einfügen – die Quellenangabe wird aus Crossref und OpenAlex ergänzt. APA 7, Harvard, Chicago, MLA 9, IEEE und Vancouver; Zitate im Text und Literaturverzeichnis entstehen gemeinsam." },
      { title: "Wissenschaftliches Schreiben", text: "Entwickeln Sie Forschungstexte mit solider Struktur und einer einheitlichen Arbeitsweise." },
      { title: "Richtlinienprüfung", text: "Laden Sie Ihre Richtlinie als PDF oder Link hoch: Seitenlayout, Pflichtkapitel, Zitierstil und Grenzen werden ausgelesen, und die von Ihnen bestätigten Regeln gelten im Editor. Richtlinien auf Englisch und Türkisch werden gelesen." },
      { title: "Analyse-Hub", text: "Organisieren Sie quantitative und qualitative Forschungsprozesse in einer Arbeitsumgebung." },
      { title: "Wissenschaftlicher Editor", text: "Abgabefertiges Word und PDF in A4 oder US Letter, mit Inhaltsverzeichnis, Fußnoten und Überschriftennummern. Eine Abgabe-Checkliste zeigt an einem Ort, was noch fehlt." },
      { title: "Originalitäts-Vorprüfung", text: "Prüfen Sie Ihren Text vor der Einreichung, um mögliche Risiken früher zu erkennen." },
    ],
  },
  flow: {
    eyebrow: "Der Forschungsablauf",
    title: "In jeder Phase der Forschung an Ihrer Seite.",
    lead: "Eine ganzheitliche Arbeitsweise, die den Fokus der Forschenden auf hochwertige Ergebnisse lenkt – nicht auf Tools.",
    steps: [
      { title: "Quellen sammeln", text: "Ordnen Sie Literatur und Zitate an einem Ort." },
      { title: "Schreiben", text: "Entwickeln Sie Ihren Text in einer einheitlichen Struktur und binden Sie Überarbeitungsschritte in den Ablauf ein." },
      { title: "Prüfen", text: "Führen Sie Richtlinienprüfung und Originalitäts-Vorprüfung vor der Einreichung durch." },
      { title: "Analysieren", text: "Führen Sie quantitative und qualitative Analysen in derselben Arbeitsumgebung durch." },
    ],
  },
  audience: {
    eyebrow: "Für wen ist es gedacht?",
    title: "Für einzelne Forschende gemacht.",
    lead: "ArvoLab ist für wissenschaftliche Arbeit in unterschiedlichem Umfang ausgelegt.",
    items: [
      { title: "Einzelne Forschende", text: "Für Abschlussarbeiten, Artikel und Projekte in einer ruhigen Arbeitsumgebung." },
      { title: "Promovierende und Masterstudierende", text: "Für eine Master- oder Doktorarbeit von Anfang bis Ende mit einem Abonnement." },
      { title: "Universitäten", text: "Institutionslizenzen gibt es nur für Universitäten und Bildungseinrichtungen, auf Anfrage." },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "Über ArvoLab",
    items: [
      { q: "Was ist ArvoLab?", a: "ArvoLab ist die Arbeitsumgebung für die Forschung der Marke ArvoOS – für Literatur- und Zitatverwaltung, wissenschaftliches Schreiben, Richtlinienprüfung, quantitative und qualitative Analyse, wissenschaftliche Überarbeitung und eine Originalitäts-Vorprüfung." },
      { q: "Für wen ist ArvoLab gedacht?", a: "Für einzelne Forschende. Institutionslizenzen gibt es nur für Universitäten und Bildungseinrichtungen, auf Anfrage." },
      { q: "Wie erhalte ich Zugang zu ArvoLab?", a: "Legen Sie auf der Registrierungsseite ein Konto an und starten Sie sofort mit einer kostenlosen Testphase; danach wird das Abonnement per Karte bezahlt. Für eine Institutionslizenz nutzen Sie das Kontaktformular oder info@arvo-os.com." },
      { q: "Ersetzt die Originalitäts-Vorprüfung einen offiziellen Bericht?", a: "Nein. Sie ist eine Vorprüfung, die Ihnen hilft, Risiken vor der Einreichung zu erkennen; Ihre Institution kann dennoch einen eigenen offiziellen Originalitätsbericht verlangen." },
      { q: "Worin unterscheiden sich ArvoLab und ArvoOS?", a: "ArvoOS steuert die Abläufe eines Unternehmens; ArvoLab ist eine Arbeitsumgebung, die wissenschaftliche Forschung und das Schreiben unterstützt." },
    ],
  },
  cta: {
    eyebrow: "Zugang",
    title: "Testen Sie ArvoLab noch heute.",
    lead: "Konto anlegen und mit einer kostenlosen Testphase starten; Zahlung per Karte, automatische Verlängerung optional. Für eine Institutionslizenz kontaktieren Sie uns.",
    actions: [
      { label: "Kostenlos testen", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Bei ArvoLab anmelden", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
      { label: "Institutionslizenz", href: `${R("contact")}?interest=arvolab`, variant: "ghost" },
    ],
  },
};
