// Almanca: contact-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { ContactContent } from "../contact";

export const CONTACT_DE: ContactContent = {
  meta: { title: "Kontakt & Demo-Anfragen", description: `Kontaktieren Sie uns für Demos von ArvoOS, ArvoLab und ArvoBook, für E-Commerce- und Website-Projekte, Produktzugänge und Projektgespräche: ${COMPANY.email}.` },
  hero: {
    eyebrow: "Kontakt", title: "Wir sind da", subtitle: "für Ihre nächste Idee.",
    lead: "Für eine Produktdemo, einen Panel-Zugang oder ein individuelles digitales Projekt füllen Sie das Formular aus oder schreiben Sie uns direkt – Ihre Anfrage geht an das zuständige Produkt- oder Projektteam.",
    actions: [],
  },
  formTitle: "Demo- & Kontaktformular",
  formLead: "Wenige Angaben genügen. Wählen Sie das Produkt, das Sie interessiert, und beschreiben Sie kurz Ihren Bedarf.",
  emailLabel: "E-Mail", addressLabel: "Adresse", appsLabel: "Anmelden", privacyLabel: "Personenbezogene Daten",
  privacyText: "Ihre Formularangaben werden ausschließlich zur Beantwortung Ihrer Anfrage verarbeitet.",
  faq: {
    eyebrow: "FAQ", title: "Zur Kontaktaufnahme",
    items: [
      { q: "Wie fordere ich eine Demo an?", a: "Wählen Sie im Formular auf dieser Seite das Produkt, das Sie interessiert, und beschreiben Sie Ihren Bedarf; unser Team meldet sich bei Ihnen." },
      { q: "Wie kann ich Sie sonst erreichen?", a: `Schreiben Sie eine E-Mail an ${COMPANY.email}.` },
      { q: "Meine Organisation nutzt bereits ein Panel – wo melde ich mich an?", a: "ArvoOS läuft unter app.arvo-os.com, ArvoLab unter lab.arvo-os.com und ArvoBook unter randevu.arvo-os.com; hat Ihre Organisation eine eigene Domain, können Sie sich auch dort anmelden." },
      { q: "Wie werden meine Formulardaten verwendet?", a: `Ausschließlich zur Beantwortung Ihrer Anfrage. Einzelheiten finden Sie in der Datenschutzerklärung (${ROUTES.privacy.de}).` },
    ],
  },
};
