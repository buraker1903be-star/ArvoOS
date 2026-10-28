/*
  Almanca: pricing-en.ts'in çevirisi. RAKAM YOK: tutarlar lib/site/pricing.ts'ten
  gelir; plan kodları ve sırası İngilizceyle birebir aynı.
*/
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { PricingContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].de;
const demo = { label: "Demo anfragen", href: `${R("contact")}?interest=pricing`, variant: "gold" as const };

export const PRICING_DE: PricingContent = {
  id: "pricing",
  meta: {
    title: "Preise",
    description:
      "Abonnementpreise für ArvoOS, ArvoCal und ArvoLab: monatliche und jährliche Preise, Leistungsumfang der Pakete, Zusatzleistungen und Abonnementbedingungen. Abgerechnet pro Organisation, nicht pro Nutzer.",
  },
  hero: {
    eyebrow: "Preise",
    title: "Für Business-Produkte pro Organisation –",
    subtitle: "nicht pro Nutzer.",
    lead: "ArvoOS und ArvoCal werden pro Organisation abgerechnet: Ihre Rechnung vervielfacht sich nicht, wenn das Team wächst, und jede Karte nennt die Zahl der enthaltenen Nutzer. ArvoLab ist die Ausnahme – sein Nutzen liegt bei der Person, die schreibt, nicht im Ablauf der Organisation; deshalb wird es pro Forschendem abgerechnet.",
    actions: [demo, { label: "Abonnementbedingungen", href: "#kosullar", variant: "ghost" }],
  },
  cycle: {
    monthly: "Monatlich",
    yearly: "Jährlich",
    badge: "2 Monate gratis",
    perMonth: "/Monat",
    perYear: "/Jahr",
    perMonthUser: "/Nutzer/Monat",
    perYearUser: "/Nutzer/Jahr",
    quote: "Auf Anfrage",
    quoteAction: "Angebot anfordern",
  },
  vatNote:
    "Alle Preise in Euro, zzgl. MwSt.; Kunden in der Türkei zahlen in türkischen Lira zu den Preisen der türkischen Seite, die die MwSt. enthalten. Bei jährlicher Zahlung zahlen Sie 10 Monate und nutzen 12; der Betrag wird einmalig zu Beginn des Zeitraums in Rechnung gestellt.",

  groups: [
    {
      product: "arvoos",
      tag: "Betriebssystem für Unternehmen",
      lead: "CRM, Angebote, elektronisch signierte Verträge, Operations, Finanzen, Personal und Reporting in einem Ablauf. Die Nutzer sind im Paket enthalten.",
      linkLabel: "ArvoOS entdecken",
      cards: [
        {
          code: "arvoos-baslangic",
          text: "Für Teams, die Kunden-, Liefer- und Finanzarbeit in eine einheitliche Ordnung bringen.",
          items: ["3 Nutzer inklusive", "Ein Standort", "CRM und Vertriebspipeline", "Angebote und elektronisch signierte Verträge", "Operations und Aufgabenablauf", "Finanzen und Verfolgung der Zahlungseingänge", "E-Mail-Support"],
        },
        {
          code: "arvoos-kurumsal",
          text: "Für Organisationen, die mehrere Teams oder Standorte mit vernetzten Prozessen führen.",
          items: ["15 Nutzer inklusive", "Unbegrenzte Standorte", "Alle Module", "Kunden-Tracking-Portal", "Berechtigungsmatrix Rolle × Modul", "Erweitertes Reporting", "Priorisierter Support"],
        },
        {
          code: "arvoos-ozel",
          text: "Für Organisationen, die ArvoOS nach ihrem eigenen Betriebsmodell und unter ihrer eigenen Marke nutzen wollen.",
          items: ["Unbegrenzte Nutzer", "Eigene Domain", "Individuelle Workflows", "Kundenerlebnis in Ihrem Branding", "Datenmigration und Teamschulung", "Implementierungsberatung"],
        },
      ],
    },
    {
      product: "randevu",
      tag: "Terminverwaltung",
      lead: "Eine Online-Buchungsseite, ein Kalender und eine Kundenkartei für Friseur- und Kosmetiksalons. Arbeitszeiten werden in türkischer Ortszeit festgelegt.",
      linkLabel: "ArvoCal entdecken",
      cards: [
        {
          code: "randevu-tek",
          text: "Für Salons an einer Adresse, die Termine noch per Telefon und Notizbuch verwalten.",
          items: ["Ein Standort", "Bis zu 5 Mitarbeitende", "Online-Buchungsseite", "Terminkalender", "Kundenkartei und Verlauf", "E-Mail-Support"],
        },
        {
          code: "randevu-coklu",
          text: "Für Betriebe, die eine zentrale Übersicht und Berechtigungen je Filiale wollen.",
          items: ["Bis zu 3 Filialen", "Unbegrenzte Mitarbeitende", "Kalender und Berechtigungen je Filiale", "Zentrale Berichte", "Priorisierter Support"],
        },
        {
          code: "randevu-zincir",
          text: "Für Ketten mit mehr als drei Filialen, die einen eigenen Markenauftritt wollen.",
          items: ["Unbegrenzte Filialen", "Eigene Domain", "Individuelle Workflows", "Implementierung und Teamschulung"],
        },
      ],
    },
    {
      product: "arvolab",
      tag: "Arbeitsumgebung für die Forschung",
      lead: "Literatur und Zitate, wissenschaftliches Schreiben, Richtlinienprüfung, Analyse und Originalitäts-Vorprüfung – der gesamte Forschungsprozess in einer Arbeitsumgebung, ohne eigenes Tool und eigenes Abonnement für jeden Schritt. Abgerechnet pro Forschendem.",
      linkLabel: "ArvoLab entdecken",
      cards: [
        {
          code: "arvolab-arastirmaci",
          text: "Für Forschende, die eine Abschlussarbeit, einen Artikel oder ein Projekt allein voranbringen.",
          items: ["Eine forschende Person", "Literatur- und Zitatverwaltung", "Wissenschaftliches Schreiben", "Richtlinienprüfung", "Analysezentrum (quantitativ und qualitativ)", "Originalitäts-Vorprüfung"],
        },
        {
          // Ekip paketi 28.10.2026'da satıştan kalktı (kurucu kararı): ArvoLab bireysel
          // araştırmacıya satılıyor, kurum lisansı yalnızca üniversite ve eğitim
          // kurumlarına teklifle veriliyor. Kart geri eklenirse lib'deki plan da gerekir.
          code: "arvolab-kurum",
          text: "Nur für Universitäten und Bildungseinrichtungen: eine Campuslizenz für eine Fakultät oder die gesamte Universität, Preis auf Anfrage.",
          items: ["Unbegrenzte Forschende", "Campuslizenz für Fakultät oder Universität", "Nutzerverwaltung durch die Institution", "Eigene Domain", "Implementierung und Schulung", "Rechnung an die Institution"],
        },
      ],
    },
  ],

  addOns: {
    eyebrow: "Nicht enthalten",
    title: "Separat berechnete Leistungen.",
    lead: "Diese fallen an, wenn Sie ein Paketlimit überschreiten oder etwas Spezielles für Ihre Organisation wünschen. Sonst kommt nichts auf die Rechnung.",
    quote: "Auf Anfrage",
    items: [
      { code: "ek-kullanici", name: "Zusätzlicher Nutzer", text: "Für jeden Nutzer über die im ArvoOS-Paket enthaltene Anzahl hinaus. Gilt nicht für ArvoLab, das bereits pro Forschendem abgerechnet wird." },
      { code: "ek-sube", name: "Zusätzliche Filiale", text: "Für jede Filiale über die drei im ArvoCal-Paket „Mehrere Filialen“ enthaltenen hinaus." },
      { code: "veri-aktarimi", name: "Datenmigration und Einrichtung", text: "Übernahme der Daten aus Ihrem bisherigen System, Anlegen der Nutzer und Schulung des Teams. Einmalig, je nach Umfang berechnet." },
      { code: "ozel-gelistirme", name: "Individuelle Entwicklung", text: "Ein Workflow, eine Ansicht oder ein Bericht speziell für Ihre Organisation. Angebot, sobald der Umfang feststeht." },
    ],
  },

  policy: {
    eyebrow: "Abonnementbedingungen",
    title: "Die Regeln hinter dem Preis.",
    lead: "Das sind die Regeln, die wir tatsächlich anwenden; den vollständigen Wortlaut finden Sie im Fernabsatzvertrag und in der Widerrufs- und Erstattungsrichtlinie.",
    items: [
      { title: "Keine Abbuchung ohne Ihre Zustimmung", text: "Ihre Karte wird nie ohne Ihre ausdrückliche Zustimmung belastet. Standardmäßig erhalten Sie für jeden Zeitraum einen Zahlungslink und bestätigen die Zahlung selbst. Wenn Sie beim Bezahlen Ihre Karte speichern und die automatische Verlängerung wählen, werden Sie mindestens 3 Tage vor jeder Abbuchung informiert und können die automatische Verlängerung jederzeit abschalten." },
      { title: "Kündigung zum Periodenende", text: "Sie können im Panel oder per E-Mail kündigen. Die Kündigung wird zum Ende des bezahlten Zeitraums wirksam; bis dahin bleibt der Dienst verfügbar." },
      { title: "Preisänderungen", text: "Ihr laufender Zeitraum bleibt unberührt. Änderungen werden mindestens 30 Tage im Voraus per E-Mail angekündigt und gelten erst ab dem nächsten Zeitraum." },
      { title: "Upgrades und Downgrades", text: "Ein Upgrade gilt ab demselben Tag, berechnet werden nur die verbleibenden Tage des Zeitraums. Ein Downgrade gilt zum Ende des laufenden Zeitraums." },
      { title: "Vorzeitige Kündigung eines Jahrespakets", text: "Die genutzten Monate werden zum monatlichen Listenpreis neu berechnet, der Restbetrag wird erstattet. Der Jahresrabatt entfällt nur für die ungenutzten Monate." },
      { title: "MwSt. und Rechnungsstellung", text: "Die angegebenen Euro-Beträge verstehen sich zzgl. MwSt. und Umsatzsteuer; diese werden auf der Rechnung nach den jeweils geltenden Vorschriften berechnet. Die Lira-Preise auf der türkischen Seite enthalten die MwSt. Für jeden Zeitraum wird eine Rechnung ausgestellt und an Ihre hinterlegte E-Mail-Adresse gesendet." },
    ],
    links: [
      { label: "Fernabsatzvertrag", href: R("distance-sales"), variant: "ghost" },
      { label: "Widerruf und Erstattung", href: R("refund"), variant: "ghost" },
      { label: "Lieferung und Leistungserbringung", href: R("delivery"), variant: "ghost" },
    ],
  },

  faq: {
    eyebrow: "Häufige Fragen",
    title: "Zu den Preisen",
    items: [
      { q: "Sind die Preise inklusive MwSt.?", a: "Nein. Die Euro-Beträge auf dieser Seite verstehen sich zzgl. MwSt. und Umsatzsteuer; diese werden auf der Rechnung nach den jeweils geltenden Vorschriften berechnet. Die Lira-Preise auf der türkischen Seite enthalten die MwSt." },
      { q: "Wird pro Nutzer abgerechnet?", a: "Bei ArvoOS und ArvoCal nicht: Die Preise gelten pro Organisation, und jedes Paket enthält eine festgelegte Zahl von Nutzern; darüber hinaus fällt nur die Gebühr für zusätzliche Nutzer an, der Paketpreis vervielfacht sich nicht. Bei ArvoLab ja: Hier wird pro Forschendem abgerechnet, weil der Nutzen direkt bei der Person entsteht, die es verwendet." },
      { q: "Kann ein Team oder ein Unternehmen ArvoLab kaufen?", a: "ArvoLab wird an einzelne Forschende verkauft. Institutionslizenzen werden nur Universitäten und Bildungseinrichtungen angeboten, auf Anfrage." },
      { q: "Was spart die jährliche Abrechnung?", a: "Bei jährlicher Zahlung zahlen Sie 10 Monate und nutzen 12 – zwei Monate gratis. Der Betrag wird einmalig zu Beginn des Zeitraums in Rechnung gestellt." },
      { q: "Verlängert sich das Abonnement automatisch?", a: "Nur wenn Sie es wählen. Standardmäßig wird Ihre Karte nicht automatisch belastet; für jeden Zeitraum erhalten Sie einen Zahlungslink. Sie können beim Bezahlen Ihre Karte speichern und die automatische Verlängerung wählen; Sie werden mindestens 3 Tage vor jeder Abbuchung benachrichtigt und können die automatische Verlängerung jederzeit im Bereich der Zahlungsseite Ihres Kontos abschalten." },
      { q: "Können wir das Paket später wechseln?", a: "Ja. Ein Upgrade gilt ab demselben Tag, berechnet werden nur die verbleibenden Tage des Zeitraums; ein Downgrade gilt zum Ende des laufenden Zeitraums." },
      { q: "Was passiert bei Preisänderungen?", a: "Ihr laufender Zeitraum bleibt unberührt. Änderungen werden mindestens 30 Tage im Voraus angekündigt und gelten ab dem nächsten Zeitraum." },
      { q: "Wir haben jährlich bezahlt – was, wenn wir vorzeitig kündigen?", a: "Die genutzten Monate werden zum monatlichen Listenpreis neu berechnet und der Restbetrag wird erstattet; der Jahresrabatt entfällt nur für die ungenutzten Monate." },
      { q: "Gibt es einen Rabatt für mehrere Produkte?", a: "Ja – Organisationen, die mehr als ein Produkt nutzen, erhalten ein kombiniertes Angebot. Fordern Sie eine Demo an, um den Umfang gemeinsam durchzugehen." },
    ],
  },

  cta: {
    title: "Wählen wir das Paket, das zu Ihrer Organisation passt.",
    lead: "Wenn Sie unsicher sind, mit welcher Stufe Sie beginnen sollen, erfassen wir gemeinsam Ihre Prozesse und empfehlen das passende Paket.",
    actions: [demo, { label: "E-Mail schreiben", href: `mailto:${COMPANY.email}`, variant: "ghost" }],
  },
};
