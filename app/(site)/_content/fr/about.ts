// Fransızca: about-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;

export const ABOUT_FR: SubContent = {
  id: "about",
  meta: { title: "À propos", description: `ArvoOS est la marque de logiciels de ${COMPANY.legalName}. Elle conçoit le système d’exploitation d’entreprise du même nom, ArvoLab et ArvoBook, et propose la création de sites web et e-commerce ainsi que le développement de logiciels sur mesure.` },
  hero: {
    eyebrow: "À propos", title: "Nous rendons le travail complexe", subtitle: "simple.",
    lead: `ArvoOS est la marque de logiciels d’ArvoCulture Group, basée à Istanbul (Türkiye). Elle conçoit des façons de travailler numériques, puissantes et sereines, pour les organisations, les chercheurs et les salons.`,
    actions: [{ label: "Nous rencontrer", href: R("contact"), variant: "gold" }],
  },
  cards: {
    eyebrow: "Une vision, un écosystème qui grandit", title: "Ce en quoi nous croyons.",
    lead: "Avec ArvoOS, nous transformons le fonctionnement des entreprises ; avec ArvoLab, la manière de faire de la recherche ; avec ArvoBook, la gestion du carnet de rendez-vous des salons — le tout avec un même langage de marque et un même niveau de qualité.",
    items: [
      { title: "Une technologie centrée sur l’humain", text: "Des expériences qui facilitent la décision et la création, sans reporter la complexité sur l’utilisateur." },
      { title: "Une exigence sans compromis", text: "Des systèmes fiables, compréhensibles et durables — de l’interface à l’infrastructure." },
      { title: "Des produits qui grandissent ensemble", text: "Un écosystème évolutif où les nouveaux produits et services trouvent naturellement leur place." },
    ],
  },
  steps: {
    eyebrow: "Notre méthode", title: "Nous repensons la façon de travailler.",
    lead: "Pour nous, le logiciel n’est pas qu’un outil : c’est un système qui renforce la culture, le rythme et la qualité de service d’une équipe.",
    items: [
      { title: "Nous comprenons d’abord le processus", text: "Chaque projet commence par comprendre comment le travail se fait réellement." },
      { title: "Nous concevons l’ensemble", text: "Marque, expérience et technologie sont pensées comme un tout." },
      { title: "Nous travaillons en transparence, sur la durée", text: "Des décisions visibles, un périmètre clair et une collaboration durable." },
    ],
  },
  band: {
    eyebrow: "Informations sur la société", title: "La société derrière ArvoOS.",
    items: [COMPANY.legalName, COMPANY.address.displayIntl, COMPANY.email],
  },
  faq: { eyebrow: "FAQ", title: "À propos d’ArvoOS", items: [
    { q: "Quelle société se trouve derrière ArvoOS ?", a: `ArvoOS est une marque de ${COMPANY.legalName}.` },
    { q: "Où ArvoOS est-elle basée ?", a: `${COMPANY.address.displayIntl}.` },
    { q: "ArvoOS, une entreprise ou un produit ?", a: "ArvoOS est la marque de l’entreprise (arvo-os.com est son site web) et aussi le nom de son système d’exploitation d’entreprise. ArvoLab et ArvoBook sont ses autres produits." },
    { q: "Comment contacter ArvoOS ?", a: `Utilisez le formulaire de la page contact ou écrivez à ${COMPANY.email}.` },
  ] },
  cta: { title: "Construisons ensemble un meilleur système.", actions: [{ label: "Nous contacter", href: R("contact"), variant: "gold" }, { label: "Produits", href: R("arvoos"), variant: "ghost" }] },
  org: true,
};
