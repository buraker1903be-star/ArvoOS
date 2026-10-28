// Almanca: privacy-en.ts'in çevirisi. Hukuki içerik aynı; bilgilendirme amaçlı çeviri notu eklendi.
import { COMPANY } from "@/lib/site/routes";
import type { PrivacyContent } from "../privacy";

export const PRIVACY_DE: PrivacyContent = {
  meta: { title: "Datenschutzerklärung", description: "Wie personenbezogene Daten auf der Website arvo-os.com und über ihr Demo- / Kontaktformular nach dem türkischen Datenschutzgesetz Nr. 6698 (KVKK) verarbeitet werden." },
  hero: {
    eyebrow: "Datenschutz", title: "Hinweise zum", subtitle: "Datenschutz",
    lead: "Diese Erklärung erläutert, wie Ihre personenbezogenen Daten nach dem türkischen Gesetz Nr. 6698 zum Schutz personenbezogener Daten (KVKK) verarbeitet werden, wenn Sie arvo-os.com besuchen und das Demo- / Kontaktformular nutzen.",
    actions: [],
  },
  updated: "Zuletzt aktualisiert: 28. Oktober 2026",
  sections: [
    { h: "1. Verantwortlicher", p: [
      "Diese Übersetzung dient der Information; bei Abweichungen ist die türkische Fassung maßgeblich.",
      `Verantwortlicher ist ${COMPANY.legalName} („ArvoOS“). Adresse: ${COMPANY.address.display}, Türkei. E-Mail: ${COMPANY.email}.`,
    ] },
    { h: "2. Welche personenbezogenen Daten wir verarbeiten", p: ["Wenn Sie das Demo- / Kontaktformular absenden:"], list: [
      "Identitäts- und Kontaktdaten: vollständiger Name, E-Mail-Adresse, Telefonnummer, Name der Organisation (Organisation und Telefon sind optional).",
      "Angaben zur Anfrage: das Produkt oder die Leistung, für die Sie sich interessieren, Ihre Nachricht sowie die Seite und Sprache, von der aus das Formular gesendet wurde.",
      "Bestätigungsvermerk: Ihre Bestätigung, dass Sie diese Erklärung gelesen haben.",
      "Sicherheit: ein täglich wechselnder, einweg-gehashter Wert Ihrer IP-Adresse zur Verhinderung von Missbrauch. Die IP-Adresse selbst wird nicht gespeichert.",
    ] },
    { h: "3. Zwecke", list: [
      "Entgegennahme und Prüfung Ihrer Anfragen zu Demos, Zugängen, Informationen und Projekten sowie deren Beantwortung",
      "Einleitung von Angebots- und Vertragsprozessen, sofern Sie dies wünschen",
      "Schutz des Formulars vor automatisierten und missbräuchlichen Übermittlungen sowie Gewährleistung der Informationssicherheit",
      "Erfüllung gesetzlicher Pflichten",
    ] },
    { h: "4. Rechtsgrundlagen", p: ["Ihre personenbezogenen Daten werden auf folgenden Rechtsgrundlagen nach Artikel 5 Absatz 2 KVKK verarbeitet:"], list: [
      "(c) Die Verarbeitung steht in unmittelbarem Zusammenhang mit dem Abschluss oder der Erfüllung eines Vertrags – Beantwortung Ihrer Anfrage sowie Vorbereitung von Demos und Angeboten",
      "(f) Berechtigtes Interesse des Verantwortlichen, sofern Ihre Grundrechte und Grundfreiheiten nicht beeinträchtigt werden – Formularsicherheit und Bearbeitung von Anfragen",
      "(ç) Erfüllung einer rechtlichen Verpflichtung des Verantwortlichen",
    ] },
    { h: "5. Wie die Daten erhoben werden", p: ["Die Daten werden elektronisch über das Formular der Website bei Ihnen erhoben und beim Absenden des Formulars automatisch von Ihrem Browser übermittelt. Ihre Anfrage wird als Kundenanfrage in unserem eigenen ArvoOS-Panel erfasst."] },
    { h: "6. Übermittlungen", p: [
      "Ihre personenbezogenen Daten werden nicht verkauft und nicht zu Marketingzwecken an Dritte weitergegeben.",
      "Die Daten werden auf den Servern der Cloud-Infrastruktur- und Datenbankanbieter gespeichert, die die Website und das Panel hosten; diese Server können sich außerhalb der Türkei befinden. Solche Übermittlungen erfolgen im Einklang mit Artikel 9 KVKK. Daten können nur dann an befugte Behörden weitergegeben werden, wenn das Gesetz dies verlangt.",
    ] },
    { h: "7. Speicherdauer", p: ["Formulardaten werden so lange aufbewahrt, wie es für die Prüfung Ihrer Anfrage und die Durchführung einer daraus entstehenden Geschäftsbeziehung erforderlich ist, sowie für die nach geltendem Recht vorgeschriebenen Fristen; danach werden sie gelöscht, vernichtet oder anonymisiert. Die Sicherheits-Hashwerte der IP-Adressen werden innerhalb weniger Tage automatisch gelöscht."] },
    { h: "8. Cookies", p: ["Diese Website verwendet keine Cookies oder Tracking-Tools für Werbung, Analyse oder Profilbildung. Verwendet werden lediglich technische Cookies, die für den sicheren Betrieb der Website erforderlich sein können, sowie ein Präferenz-Cookie, das Ihre gewählte Sprache speichert (arvo_site_dil, ein Jahr)."] },
    { h: "9. Ihre Rechte nach Artikel 11 KVKK", p: ["Durch einen Antrag beim Verantwortlichen können Sie:"], list: [
      "erfahren, ob Ihre personenbezogenen Daten verarbeitet werden, und gegebenenfalls Auskunft darüber verlangen",
      "den Zweck der Verarbeitung erfahren und ob die Daten entsprechend verwendet werden",
      "die Dritten im In- oder Ausland kennen, an die Daten übermittelt werden",
      "die Berichtigung unvollständiger oder unrichtiger Daten verlangen",
      "die Löschung oder Vernichtung der Daten unter den Voraussetzungen von Artikel 7 KVKK verlangen",
      "verlangen, dass Berichtigungen, Löschungen und Vernichtungen den Dritten mitgeteilt werden, an die die Daten übermittelt wurden",
      "einem nachteiligen Ergebnis widersprechen, das ausschließlich auf einer automatisierten Auswertung beruht",
      "Schadensersatz für Schäden verlangen, die durch eine rechtswidrige Verarbeitung entstanden sind",
    ] },
    { h: "10. So stellen Sie einen Antrag", p: [`Senden Sie Ihre Anträge per E-Mail an ${COMPANY.email} oder schriftlich an ${COMPANY.address.display}, Türkei. Anträge werden je nach ihrer Art spätestens innerhalb von dreißig Tagen kostenlos abgeschlossen (Artikel 13 KVKK).`] },
    { h: "11. Besucher im Europäischen Wirtschaftsraum und im Vereinigten Königreich (DSGVO)", p: [
      "Wenn Sie sich im EWR oder im Vereinigten Königreich befinden und wir Ihnen unsere Dienste anbieten, werden Ihre personenbezogenen Daten zusätzlich nach der Datenschutz-Grundverordnung (EU) 2016/679 (DSGVO) und der UK GDPR verarbeitet. Verantwortlicher ist ArvoOS, wie in Abschnitt 1 angegeben.",
      "Rechtsgrundlagen (Art. 6 Abs. 1 DSGVO): vorvertragliche Maßnahmen — Beantwortung Ihrer Anfrage, Vorbereitung von Demos und Angeboten (b); berechtigte Interessen — Formularsicherheit und Anfrageverwaltung (f); Erfüllung rechtlicher Pflichten (c).",
      "Ihre Daten können in der Türkei und auf Servern von Hosting-Anbietern außerhalb des EWR verarbeitet werden. Informationen zu den Garantien, auf die sich diese Übermittlungen stützen, erhalten Sie auf Anfrage. Anträge richten Sie über die Kanäle in Abschnitt 10 an uns; Anträge nach der DSGVO werden innerhalb eines Monats beantwortet.",
      "Nach der DSGVO stehen Ihnen folgende Rechte zu:",
    ], list: [
      "Auskunft über Ihre Daten und Erhalt einer Kopie (Art. 15)",
      "Berichtigung unrichtiger Daten (Art. 16) und Löschung (Art. 17)",
      "Einschränkung der Verarbeitung (Art. 18)",
      "Datenübertragbarkeit (Art. 20)",
      "Widerspruch gegen eine auf berechtigten Interessen beruhende Verarbeitung (Art. 21)",
      "Beschwerde bei der Datenschutzaufsichtsbehörde des EWR-Staates, in dem Sie leben oder arbeiten, im Vereinigten Königreich beim Information Commissioner’s Office (ICO)",
    ] },
    { h: "12. Änderungen", p: ["Diese Erklärung kann bei Bedarf aktualisiert werden; die aktuelle Fassung wird stets auf dieser Seite veröffentlicht."] },
  ],
};
