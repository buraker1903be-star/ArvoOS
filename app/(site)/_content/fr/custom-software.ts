// Fransızca: custom-software-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;
const talk = { label: "Décrivez-nous votre besoin", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const CUSTOM_SOFTWARE_FR: SubContent = {
  id: "custom-software",
  parent: { id: "services", name: "Services" },
  meta: { title: "Logiciel sur mesure", description: "Logiciels sur mesure par ArvoOS : panneaux d’administration et portails personnalisés, logiciels de workflow, intégrations et automatisation, espaces clients et applications PWA adaptées au mobile." },
  hero: {
    eyebrow: "Services · Logiciel sur mesure", title: "Quand le prêt-à-l’emploi ne suffit pas,", subtitle: "un système bien à vous.",
    lead: "Notre service de logiciel sur mesure conçoit et développe panneaux d’administration, portails, espaces clients et logiciels de workflow selon le fonctionnement réel de votre organisation. L’équipe qui a construit le système d’exploitation d’entreprise ArvoOS apporte le même soin à votre projet.",
    actions: [talk, { label: "Voir ArvoOS", href: R("arvoos"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Ce que nous construisons", title: "Un logiciel à l’image de votre activité.",
    items: [
      { title: "Panneaux & portails sur mesure", text: "Des écrans de gestion pour vos équipes, des espaces en libre-service sécurisés pour vos clients." },
      { title: "Logiciels de workflow", text: "Des flux qui automatisent demandes, validations, tâches et livraisons selon vos propres règles." },
      { title: "Intégrations & automatisation", text: "Des flux de données qui relient les outils que vous utilisez et suppriment les tâches répétitives." },
      { title: "Flux de documents & de signature", text: "Documents à vos couleurs, export PDF et étapes d’acceptation électronique." },
      { title: "PWA adaptée au mobile", text: "Des applications web qui s’installent sur l’écran d’accueil et fonctionnent comme des applications mobiles." },
      { title: "Architecture SaaS multi-tenant", text: "Des structures évolutives où chaque client travaille dans son propre espace, sous sa propre marque." },
    ],
  },
  band: {
    eyebrow: "Preuve de savoir-faire", title: "Nous avons construit ArvoOS.",
    lead: "Les problèmes résolus sur notre propre plateforme deviennent une expérience éprouvée au service de votre projet.",
    items: ["Structure multi-tenant avec domaines personnalisés vérifiés par DNS", "Acceptation électronique avec signature manuscrite à l’écran et documents PDF A4", "Portail client avec livraison de fichiers conditionnée au paiement", "Droits rôle × module et sécurité au niveau des lignes", "Interface PWA installable, pensée d’abord pour le mobile"],
  },
  steps: {
    eyebrow: "Processus", title: "De la découverte au développement continu.",
    items: [
      { title: "Découverte", text: "Ensemble, nous cartographions vos processus, vos utilisateurs et vos priorités." },
      { title: "Architecture & design", text: "Nous concevons avec vous le modèle de données, la structure des droits et l’interface." },
      { title: "Développement", text: "Nous développons par cycles courts, en livrant des éléments fonctionnels que nous validons avec vous." },
      { title: "Mise en ligne & prise en main", text: "Nous mettons le système en service et accompagnons votre équipe dans sa prise en main." },
      { title: "Développement continu", text: "Nous améliorons performance, sécurité et expérience à partir de vos retours." },
    ],
  },
  faq: { eyebrow: "FAQ", title: "À propos du logiciel sur mesure", items: [
    { q: "Quels types de logiciels sur mesure ArvoOS développe-t-il ?", a: "Panneaux d’administration et portails sur mesure, logiciels de workflow, intégrations et automatisation, flux de documents et de signature, et applications PWA adaptées au mobile." },
    { q: "Pourquoi un logiciel sur mesure plutôt qu’un produit prêt à l’emploi ?", a: "Si vos processus ne correspondent pas aux produits existants, ou si vous souhaitez offrir à vos clients une expérience à votre marque, le sur-mesure peut être plus adapté. Nous vérifions d’abord ensemble si ArvoOS couvre déjà vos besoins." },
    { q: "Comment un projet est-il chiffré ?", a: "Selon son périmètre. Une feuille de route et une proposition suivent l’échange de découverte." },
    { q: "Assurez-vous un suivi après la mise en ligne ?", a: "Oui. Avec l’accompagnement en développement continu, nous assurons la maintenance, la sécurité et les nouvelles fonctionnalités." },
  ] },
  cta: { title: "Construisons un système qui vous appartient.", actions: [talk, { label: "Tous les services", href: R("services"), variant: "ghost" }] },
  serviceName: "Développement de logiciels sur mesure",
};
