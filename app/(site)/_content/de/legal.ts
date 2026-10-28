// Almanca: legal.ts'teki *_EN metinlerinin çevirisi. Hukuki içerik aynı; bilgilendirme amaçlı çeviri notu eklendi.
import { COMPANY, PRODUCT_APPS, productList, ROUTES } from "@/lib/site/routes";
import type { PrivacyContent } from "../privacy";

const updatedDe = "Zuletzt aktualisiert: 30. September 2026";
const hinweis = "Diese Übersetzung dient der Information; bei Abweichungen ist die türkische Fassung maßgeblich.";

/** Künyenin dolu satırları; boş alan satır üretmez (legal.ts'teki kunye ile aynı kural). */
function kunye(): string[] {
  const satirlar: [string, string][] = [
    ["Firmenname", COMPANY.legalName],
    ["Adresse", COMPANY.address.display],
    ["E-Mail", COMPANY.email],
    ["Telefon", COMPANY.phone],
    ["Finanzamt", COMPANY.taxOffice],
    ["Steuernummer", COMPANY.taxNumber],
    ["MERSİS", COMPANY.mersis],
  ];
  return satirlar.filter(([, deger]) => deger).map(([ad, deger]) => `${ad}: ${deger}`);
}

const urunlerDe = productList("de");
const erisimSatirlari = Object.values(PRODUCT_APPS).map((u) => `${u.name}: ${u.host}`);

export const DISTANCE_SALES_DE: PrivacyContent = {
  meta: {
    title: "Fernabsatzvertrag",
    description: `Vertrag über den Fernabsatz der Abonnementdienste von ArvoOS (${urunlerDe}): Vertragsparteien, Gegenstand, Preis, Zahlung, Leistungserbringung und Widerruf.`,
  },
  hero: {
    eyebrow: "Fernabsatz", title: "Vertrag im", subtitle: "Fernabsatz",
    lead: `Dieser Vertrag gilt für den Online-Verkauf der Abonnement-Softwaredienste von ArvoOS (${urunlerDe} sowie später hinzukommende Produkte).`,
    actions: [],
  },
  updated: updatedDe,
  sections: [
    { h: "1. Vertragsparteien", p: [hinweis, "Dienstanbieter (Verkäufer):"], list: kunye() },
    { h: "", p: ["Abonnent (Käufer): die natürliche oder juristische Person, die ein Abonnement abschließt und für die ein Konto eröffnet wird."] },
    { h: "2. Gegenstand", p: [`Das Abonnement eines oder mehrerer der Produkte ${urunlerDe} sowie die Rechte und Pflichten der Parteien nach dem türkischen Verbraucherschutzgesetz Nr. 6502 und der Verordnung über Fernabsatzverträge. Die Dienste sind cloudbasiert und werden im Browser genutzt; es werden keine physischen Waren geliefert.`] },
    { h: "3. Preis und Zahlung", list: [
      `Die Abonnementgebühr ist der unter ${ROUTES.pricing.de} veröffentlichte Listenpreis; bei individuell kalkulierten (angebotsbasierten) Stufen ist es der im Angebot genannte Betrag.`,
      "Die Beträge verstehen sich in der bei der Bestellung angegebenen Währung (türkische Lira, US-Dollar oder Euro). Listenpreise in türkischen Lira enthalten die MwSt.; Preise in US-Dollar und Euro verstehen sich zzgl. MwSt. und Umsatzsteuer, die auf der Rechnung nach den jeweils geltenden Vorschriften berechnet werden.",
      "Monatsabonnements werden zu Beginn jedes Zeitraums in Rechnung gestellt. Jahresabonnements werden einmalig zu Beginn des 12-monatigen Zeitraums über die Gebühr für 10 Monate in Rechnung gestellt.",
      "Werden die in einem Paket enthaltenen Nutzer, Filialen, Shops oder Produkte überschritten, fallen nur die auf derselben Seite veröffentlichten Zusatzgebühren an; die Paketgebühr selbst ändert sich nicht.",
      "Die Zahlung erfolgt per Kredit-/Debitkarte über den Zahlungsdienstleister des Verkäufers oder per Banküberweisung. Kartendaten werden vom Verkäufer nicht gespeichert.",
      "Es gibt keine automatische wiederkehrende Abbuchung; jeder Zeitraum wird über einen Link bezahlt, den der Abonnent bestätigt.",
    ] },
    { h: "4. Preis- und Paketänderungen", list: [
      "Der Verkäufer kann die Listenpreise anpassen. Eine Preisänderung berührt den laufenden (bezahlten) Zeitraum des Abonnenten nicht.",
      "Änderungen werden der hinterlegten E-Mail-Adresse des Abonnenten mindestens 30 Tage im Voraus mitgeteilt und gelten erst ab dem Zeitraum, der nach dieser Mitteilung beginnt. Ein Abonnent, der die neue Gebühr nicht akzeptiert, kann zum Ende des Zeitraums kündigen.",
      "Ein Upgrade wird an dem Tag wirksam, an dem es beantragt wird; berechnet wird nur die Differenz für die verbleibenden Tage des Zeitraums.",
      "Ein Downgrade wird zum Ende des laufenden Zeitraums wirksam; für einen bereits begonnenen Zeitraum entsteht keine Erstattung.",
    ] },
    { h: "5. Leistungserbringung", p: [`Das Konto wird innerhalb eines Werktags nach Bestätigung der Zahlung bereitgestellt, in der Regel sofort. Siehe ${ROUTES.delivery.de}.`] },
    { h: "6. Widerrufsrecht", p: [
      "Der Käufer kann innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen.",
      "Nach Artikel 15/1-(ğ) der Verordnung über Fernabsatzverträge gilt das Widerrufsrecht nicht für Dienstleistungen, die sofort in elektronischer Form erbracht werden, sobald die Leistungserbringung mit Zustimmung des Käufers begonnen hat – dies ist der Fall, wenn das Konto auf Wunsch des Abonnenten sofort eröffnet wird.",
    ] },
    { h: "7. Kündigung und Erstattung", p: [`Gesondert geregelt unter ${ROUTES.refund.de}; diese Regelung ist fester Bestandteil dieses Vertrags.`] },
    { h: "8. Daten und Datenschutz", p: [`Die vom Abonnenten eingegebenen Daten gehören dem Abonnenten. Die Verarbeitung personenbezogener Daten wird unter ${ROUTES.privacy.de} erläutert.`] },
    { h: "9. Haftung", p: ["Der Verkäufer erbringt den Dienst mit angemessener Sorgfalt, gewährleistet jedoch keinen unterbrechungs- oder fehlerfreien Betrieb. Die Haftung ist auf die in den letzten 12 Monaten gezahlten Abonnementgebühren begrenzt."] },
    { h: "10. Anwendbares Recht und Streitigkeiten", p: ["Es gilt türkisches Recht. Zuständig sind innerhalb der vom Handelsministerium bekannt gegebenen Wertgrenzen die Verbraucherschiedsstellen und Verbrauchergerichte, im Übrigen die Gerichte in İstanbul."] },
  ],
};

export const REFUND_DE: PrivacyContent = {
  meta: {
    title: "Widerrufs- und Erstattungsrichtlinie",
    description: "Kündigungs-, Widerrufs- und Erstattungsbedingungen für die Abonnementdienste von ArvoOS, einschließlich Testphasen, Periodenende und fehlerhafter Abbuchungen.",
  },
  hero: {
    eyebrow: "Kündigung", title: "Widerrufs- und", subtitle: "Erstattungsrichtlinie",
    lead: `So funktionieren Kündigungen und Erstattungen bei den Abonnementprodukten von ArvoOS (${urunlerDe} sowie später hinzukommende Produkte).`,
    actions: [],
  },
  updated: updatedDe,
  sections: [
    { h: "1. Kündigung eines Abonnements", p: [hinweis], list: [
      `Abonnements können im Panel oder per E-Mail an ${COMPANY.email} gekündigt werden.`,
      "Die Kündigung wird zum Ende des bezahlten Zeitraums wirksam; bis dahin bleibt der Dienst verfügbar.",
      "Nach der Kündigung erfolgt keine automatische Abbuchung.",
      "Ein Jahresabonnement läuft 12 Monate; eine Kündigung vor Ablauf des Jahres wird nach Abschnitt 5 abgerechnet.",
    ] },
    { h: "2. Testphasen", p: ["Testphasen sind kostenlos und gehen nicht automatisch in ein kostenpflichtiges Abonnement über. Erfolgt keine Zahlung, wird das Konto einfach geschlossen."] },
    { h: "3. Widerrufsrecht", p: ["Verbraucher können innerhalb von 14 Tagen widerrufen. Wird das Konto auf Wunsch des Abonnenten sofort eröffnet, hat die Leistungserbringung begonnen und das Widerrufsrecht entfällt (Verordnung über Fernabsatzverträge, Art. 15/1-(ğ))."] },
    { h: "4. Erstattungen", list: [
      "Soweit ein Widerruf möglich ist, wird der Betrag innerhalb von 14 Tagen auf das ursprüngliche Zahlungsmittel erstattet.",
      "Bei Monatsabonnements erfolgen für einen bereits begonnenen Zeitraum keine Teilerstattungen; der Dienst bleibt bis zum Ende dieses Zeitraums verfügbar.",
      "Bei Jahresabonnements wird eine vorzeitige Kündigung nach Abschnitt 5 abgerechnet; der ungenutzte Teil des vorausbezahlten Betrags wird erstattet.",
    ] },
    { h: "5. Vorzeitige Kündigung eines Jahrespakets", list: [
      "Ein Jahresabonnement wird im Voraus bezahlt: die Gebühr für 10 Monate für 12 Monate Nutzung.",
      "Kündigt der Abonnent vor Ablauf des Jahres, werden die Monate, in denen der Dienst verfügbar war, zum monatlichen Listenpreis neu berechnet. Dieser Betrag wird vom gezahlten Betrag abgezogen und der Restbetrag erstattet. Ein angefangener Monat zählt als voller Monat.",
      "Die Berechnung kann nicht unter null fallen: Übersteigt der Wert der genutzten Monate zum Monatspreis den vorausbezahlten Betrag, schuldet der Abonnent nichts weiter – es erfolgt lediglich keine Erstattung.",
      "Erstattungen erfolgen innerhalb von 14 Tagen nach dem Antrag auf das ursprüngliche Zahlungsmittel.",
    ] },
    { h: "6. Paketänderungen", list: [
      "Ein Upgrade wird an dem Tag wirksam, an dem es beantragt wird; berechnet wird nur die Differenz für die verbleibenden Tage des Zeitraums, eine Erstattung entsteht nicht.",
      "Ein Downgrade wird zum Ende des laufenden Zeitraums wirksam; für einen bereits begonnenen Zeitraum erfolgt keine Erstattung.",
      "Wird ein Produkt vollständig gekündigt, das in einem Jahrespaket gebucht war, gilt Abschnitt 5.",
    ] },
    { h: "7. Fehlerhafte oder doppelte Abbuchungen", p: [`Werden nach Feststellung vollständig und ohne Bedingungen erstattet. Kontakt: ${COMPANY.email}.`] },
    { h: "8. Von ArvoOS verursachte Ausfälle", p: ["Ist der Dienst aufgrund eines von ArvoOS zu vertretenden Umstands über einen längeren Zeitraum nicht verfügbar, wird der entsprechende Betrag auf Antrag erstattet oder dem nächsten Zeitraum gutgeschrieben."] },
  ],
};

export const DELIVERY_DE: PrivacyContent = {
  meta: {
    title: "Lieferung und Leistungserbringung",
    description: "Wann Konten eröffnet werden, wie der Zugang bereitgestellt wird und warum es bei den Abonnementdiensten von ArvoOS keine physische Lieferung gibt.",
  },
  hero: {
    eyebrow: "Lieferung", title: "Lieferung und", subtitle: "Leistungserbringung",
    lead: `Die Produkte von ArvoOS (${urunlerDe} sowie später hinzukommende Produkte) sind cloudbasiert: Es gibt keine physische Lieferung; die Leistung ist erbracht, sobald das Konto bereitgestellt wird.`,
    actions: [],
  },
  updated: updatedDe,
  sections: [
    { h: "1. Keine physische Lieferung", p: [hinweis, "Die verkauften Dienste sind digital. Es gibt keinen Versand, keine Liefergebühr und keine Lieferadresse; der Dienst wird über das Internet erbracht."] },
    { h: "2. Wann das Konto eröffnet wird", list: [
      "Innerhalb eines Werktags nach Bestätigung der Zahlung, in der Regel sofort.",
      "Sind Einrichtungsarbeiten vereinbart (Nutzer, Moduleinstellungen, Datenmigration), wird der Zeitplan im Angebot genannt.",
      "Die berechtigte Person erhält per E-Mail einen Anmeldelink und einen Schritt zum Festlegen des Passworts.",
    ] },
    { h: "3. Zugangsadressen", p: ["Die Dienste werden im Browser unter folgenden Adressen genutzt:"], list: erisimSatirlari },
    { h: "4. Voraussetzungen", p: ["Ein aktueller Browser und eine Internetverbindung; keine Installation erforderlich. Geplante Wartungsarbeiten werden im Voraus angekündigt."] },
    { h: "5. Probleme", p: [`Wird Ihr Konto nicht rechtzeitig eröffnet oder können Sie sich nicht anmelden, wenden Sie sich an ${COMPANY.email}.`] },
  ],
};
