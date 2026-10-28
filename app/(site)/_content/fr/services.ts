// Fransızca: services-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;
const talk = { label: "Parlons de votre projet", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SERVICES_FR: SubContent = {
  id: "services",
  meta: { title: "Services", description: "Services ArvoOS : création et développement de sites web, contenus SEO & GEO, logiciels sur mesure, design de processus et d’expérience, systèmes numériques d’entreprise et développement continu." },
  hero: {
    eyebrow: "Services", title: "De la marque au système.", subtitle: "Le numérique de bout en bout.",
    lead: "ArvoOS conçoit et développe des produits numériques qui ont la bonne apparence, fonctionnent comme il faut et sont prêts à grandir — de la création de site web et du SEO & GEO au logiciel sur mesure et au développement continu, de la stratégie à la mise en ligne.",
    actions: [talk],
  },
  cards: {
    eyebrow: "Expertises", title: "Des expertises façonnées selon vos besoins.",
    lead: "Plutôt que des modèles tout faits, nous construisons autour des objectifs, des utilisateurs et des opérations de votre organisation.",
    items: [
      { title: "Création & développement web", text: "Stratégie, design, développement et mise en ligne pour faire de votre marque une expérience numérique haut de gamme.", href: R("web-design"), size: "hero", visual: "web" },
      { title: "Contenus SEO & GEO", text: "Des fondations techniques et éditoriales que les moteurs de recherche et les moteurs de réponse IA comprennent — et peuvent citer.", href: R("seo-geo"), size: "wide", visual: "seo" },
      { title: "Logiciel sur mesure", text: "Panneaux d’administration, portails et logiciels de workflow conçus selon le fonctionnement réel de votre organisation.", href: R("custom-software"), size: "wide", visual: "software" },
      { title: "Design de processus & d’expérience", text: "Analyser des opérations dispersées et les transformer en systèmes plus simples, mesurables et maîtrisables." },
      { title: "Systèmes numériques d’entreprise", text: "Développement produit de bout en bout pour panneaux d’administration, portails, espaces clients et écrans de gestion." },
      { title: "Développement continu", text: "Des améliorations régulières des produits en ligne : performance, sécurité, contenu et expérience.", size: "wide" },
    ],
  },
  steps: {
    eyebrow: "Notre méthode", title: "La même exigence, pour chaque projet.",
    lead: "Nous gardons les décisions visibles, le périmètre clair et la livraison durable.",
    items: [
      { title: "Découverte & feuille de route", text: "Nous comprenons vos objectifs, vos utilisateurs et vos contraintes, et définissons le périmètre ensemble." },
      { title: "Expérience & interface", text: "Nous concevons les parcours utilisateurs et une interface haut de gamme fidèle à votre identité de marque." },
      { title: "Développement", text: "Nous construisons sur une base technique moderne, rapide, accessible et sécurisée." },
      { title: "Mise en ligne & amélioration", text: "Après la mise en ligne, nous mesurons, apprenons et continuons d’améliorer le produit." },
    ],
  },
  faq: { eyebrow: "FAQ", title: "À propos de nos services", items: [
    { q: "Quels services ArvoOS propose-t-il ?", a: "Création et développement de sites web, contenus SEO & GEO, logiciels sur mesure, design de processus et d’expérience, systèmes numériques d’entreprise et accompagnement en développement continu." },
    { q: "Comment démarre un projet ?", a: "Vous nous faites part de vos besoins via le formulaire de contact ; nous précisons le périmètre lors d’un échange de découverte, puis préparons une feuille de route et une proposition." },
    { q: "Assurez-vous un suivi après la mise en ligne ?", a: "Oui. Avec l’accompagnement en développement continu, nous continuons d’améliorer performance, sécurité, contenu et expérience." },
    { q: "Comment le prix est-il fixé ?", a: "Chaque projet est chiffré selon son périmètre ; une proposition personnalisée suit l’échange de découverte." },
  ] },
  cta: { eyebrow: "Nouveau projet", title: "Parlons de votre prochain projet.", actions: [talk, { label: "Nous écrire", href: "mailto:info@arvo-os.com", variant: "ghost" }] },
  serviceName: "Services numériques ArvoOS",
};

export const WEB_DESIGN_FR: SubContent = {
  id: "web-design",
  parent: { id: "services", name: "Services" },
  meta: { title: "Création & développement de sites web", description: "Création de sites web et e-commerce par ArvoOS : découverte et stratégie, architecture de contenu, design UX/UI, développement rapide et accessible, tests, mise en ligne et maintenance dans un seul processus." },
  hero: {
    eyebrow: "Services · Création de site web", title: "Votre marque", subtitle: "sous son meilleur jour numérique.",
    lead: "Le service de création de sites web d’ArvoOS livre des sites de marque de bout en bout — de la découverte et de la stratégie à l’architecture de contenu, au design UX/UI, au développement, à la mise en ligne et à la maintenance.",
    actions: [talk, { label: "Tous les services", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Approche", title: "Plus que du design. Un système complet.",
    lead: "Nous considérons votre site non comme une vitrine, mais comme un produit vivant qui inspire confiance, transmet la bonne information et sert vos objectifs commerciaux.",
    items: [
      { title: "Une marque distinctive et cohérente", text: "Couleurs, typographie, langage visuel et ton se réunissent dans une identité haut de gamme." },
      { title: "Une expérience claire et convaincante", text: "Des parcours fluides qui présentent des messages forts dans le bon ordre." },
      { title: "Une technologie rapide et évolutive", text: "Des fondations pensées d’abord pour le mobile, prêtes pour les moteurs de recherche et les réponses IA, et faciles à faire évoluer." },
      { title: "Site e-commerce avec son propre panneau", text: "Nous concevons et développons votre boutique en ligne ; le panneau de gestion de vos produits et commandes est livré avec le site." },
    ],
  },
  steps: {
    eyebrow: "Processus", title: "De l’idée à la mise en ligne, en six étapes claires.",
    items: [
      { title: "Découverte & stratégie", text: "Nous clarifions votre marque, votre audience, vos concurrents et les objectifs commerciaux du site." },
      { title: "Architecture de contenu", text: "Nous planifions les pages, la hiérarchie des messages et les parcours utilisateurs autour de vos objectifs de conversion." },
      { title: "Design UX/UI", text: "Nous créons un design original qui porte votre identité sur toutes les tailles d’écran." },
      { title: "Développement", text: "Nous construisons une base moderne, rapide, accessible, prête pour le SEO et facile à gérer." },
      { title: "Tests & mise en ligne", text: "Nous mettons en ligne après des contrôles sur les appareils, les navigateurs, la performance et le contenu." },
      { title: "Maintenance & croissance", text: "Nous continuons d’apporter de la valeur avec de nouveaux contenus, de nouvelles fonctionnalités et des améliorations." },
    ],
  },
  band: {
    eyebrow: "Livrables", title: "Ce que vous obtenez à la fin.",
    items: ["Stratégie et architecture de contenu", "Design d’interface pour toutes les tailles d’écran", "Code rapide, accessible et prêt pour le SEO", "Données structurées et configuration multilingue (si nécessaire)", "Panneau de gestion des produits et commandes pour les sites e-commerce", "Mise en ligne, tests et passation", "Maintenance après mise en ligne (en option)"],
  },
  faq: { eyebrow: "FAQ", title: "À propos de la création de sites web", items: [
    { q: "Quelles étapes comprend un projet de site web ?", a: "Découverte et stratégie, architecture de contenu, design UX/UI, développement, tests et mise en ligne, puis maintenance et croissance." },
    { q: "Les sites sont-ils adaptés au mobile ?", a: "Oui. Le design est pensé d’abord pour le mobile et testé sur différentes tailles d’écran." },
    { q: "Mon site sera-t-il prêt pour les moteurs de recherche ?", a: "Oui. Les fondations du SEO technique font partie du développement ; pour aller plus loin, nous proposons le SEO & GEO. Aucun positionnement précis n’est promis." },
    { q: "Créez-vous aussi des sites e-commerce ?", a: "Oui. Nous concevons et développons la boutique en ligne, et le panneau de gestion de vos produits (catalogue) et de vos commandes est livré avec le site. Le panneau n’est pas loué séparément ; il fait partie du site." },
    { q: "Puis-je ajouter du contenu après la mise en ligne ?", a: "Oui. La base est conçue pour accueillir de nouvelles pages, et nous proposons un accompagnement en maintenance et croissance." },
  ] },
  cta: { title: "Concevons ensemble votre nouveau site web.", actions: [talk, { label: "SEO & GEO", href: R("seo-geo"), variant: "ghost" }] },
  serviceName: "Création et développement de sites web",
};
