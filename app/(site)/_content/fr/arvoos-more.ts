// Fransızca: arvoos-more-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;
const demo = { label: "Demander une démo", href: `${R("contact")}?interest=arvoos`, variant: "gold" as const };
const parent = { id: "arvoos" as const, name: "ArvoOS" };

export const INDUSTRIES_FR: SubContent = {
  id: "arvoos-industries", parent,
  meta: { title: "Secteurs ArvoOS", description: "ArvoOS se configure — modules, écrans et droits — pour les établissements de santé, les établissements d’enseignement, les cabinets de conseil et entreprises de services, et les entreprises multi-sites." },
  hero: {
    eyebrow: "ArvoOS · Secteurs", title: "Pas un logiciel générique.", subtitle: "Un système qui vous ressemble.",
    lead: "Les modules, écrans et droits d’ArvoOS se configurent selon le fonctionnement réel des structures de santé, d’enseignement, de conseil et des entreprises multi-sites.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Adapté à votre secteur", title: "Un seul socle. Votre propre organisation.", cols: "two",
    items: [
      { title: "Établissements de santé", text: "Gérez patients, rendez-vous, équipes et encaissements comme un tout.", items: ["Demandes des patients et agenda des rendez-vous", "Structure d’équipe, de rôles et de droits", "Échéanciers et suivi des encaissements"] },
      { title: "Établissements d’enseignement", text: "Reliez les opérations pédagogiques, du candidat à l’inscription, du plan de paiement aux formalités.", items: ["Demandes des candidats et inscriptions", "Devis, contrats et signature électronique", "Plans de paiement et encaissements"] },
      { title: "Conseil & services", text: "Transformez les demandes clients en projets planifiés, mesurables et rentables.", items: ["CRM et gestion des devis", "Flux de projets et de livraison, portail client", "Contrats, finance et rentabilité"] },
      { title: "Entreprises multi-sites", text: "Préservez les standards centraux tout en permettant à chaque équipe de gérer plus vite ses propres opérations.", items: ["Une vue partagée et des rapports depuis le siège", "Droits par rôle et par module", "Accès au niveau de l’enregistrement"] },
    ],
  },
  note: "Votre secteur ne figure pas dans la liste ? Parlons-en : ArvoOS s’adapte à toute entreprise de services qui suit un cycle vendre–livrer–encaisser.",
  faq: { eyebrow: "FAQ", title: "À propos des secteurs", items: [
    { q: "À quels secteurs s’adresse ArvoOS ?", a: "Aux établissements de santé, aux établissements d’enseignement, aux cabinets de conseil et entreprises de services, et aux entreprises multi-sites — plus largement, aux entreprises de services qui vendent, livrent et encaissent à plusieurs." },
    { q: "Comment ArvoOS est-il adapté à notre secteur ?", a: "Les modules, écrans et droits sont configurés selon le fonctionnement de votre organisation ; les modèles de contrat et les workflows sont construits autour de vos processus." },
    { q: "Que comprend une configuration sectorielle ?", a: "Nous commençons par une analyse des besoins, puis préparons une démo personnalisée et un plan de transition." },
  ] },
  cta: { title: "Façonnons ArvoOS pour votre secteur.", actions: [demo, { label: "Solutions", href: R("arvoos-solutions"), variant: "ghost" }] },
};

export const SOLUTIONS_FR: SubContent = {
  id: "arvoos-solutions", parent,
  meta: { title: "Solutions ArvoOS", description: "ArvoOS comble, dans un seul flux, les écarts entre ventes et gestion client, opérations, contrôle financier et gouvernance d’entreprise." },
  hero: {
    eyebrow: "ArvoOS · Solutions", title: "À chaque blocage,", subtitle: "une réponse connectée.",
    lead: "ArvoOS ne se contente pas de conserver des données — il comble les écarts entre ventes, opérations et finance, pour que le bon travail parvienne à la bonne personne au bon moment.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Besoins métier", title: "Réglez le problème à la source.", cols: "two",
    items: [
      { title: "Ventes & gestion client", text: "Suivez chaque opportunité et accélérez devis et contrats.", items: ["Historique client centralisé", "Liens d’acceptation en ligne et de signature électronique", "Pipeline par étapes et motifs de perte"] },
      { title: "Gestion des opérations", text: "Transformez les affaires conclues en un flux standard que vos équipes peuvent livrer.", items: ["Workflow déclenché à la signature", "Suivi des responsables, des échéances et de l’avancement", "Portail de suivi client"] },
      { title: "Contrôle financier", text: "Visualisez chiffre d’affaires, encaissements et coûts à côté du travail.", items: ["Lien ventes–finance", "Vue des échéances et des encaissements", "Rentabilité réelle par projet"] },
      { title: "Gouvernance d’entreprise", text: "Adaptez droits, enregistrements et reporting à votre structure en croissance.", items: ["Matrice des droits rôle × module", "Isolation entre organisations", "Historique d’activité vérifiable"] },
    ],
  },
  faq: { eyebrow: "FAQ", title: "À propos des solutions", items: [
    { q: "Quels problèmes ArvoOS résout-il ?", a: "Les écarts entre ventes, opérations et finance : ressaisie des mêmes données, devis sans relance, responsabilités invisibles et paiements déconnectés du travail." },
    { q: "Comment ventes et opérations sont-elles reliées ?", a: "Un contrat signé par le client lance automatiquement le workflow du projet, avec tâches, responsables et échéances déjà prêts." },
    { q: "Comment voir la rentabilité réelle ?", a: "Des postes de coût sont ajoutés à chaque projet ; les rapports affichent la rentabilité réelle par projet à côté des ventes et des encaissements." },
  ] },
  cta: { title: "Dites-nous où ça bloque. Nous construirons le flux ensemble.", actions: [demo, { label: "Modules", href: R("arvoos-modules"), variant: "ghost" }] },
};

export const PLANS_FR: SubContent = {
  id: "arvoos-plans", parent,
  meta: { title: "Offres ArvoOS", description: "Les offres ArvoOS sont définies avec chaque organisation selon les modules, le nombre d’utilisateurs, la structure des agences et les workflows spécifiques dont elle a besoin." },
  hero: {
    eyebrow: "ArvoOS · Offres", title: "Commencez par l’essentiel.", subtitle: "Évoluez à votre rythme.",
    lead: "Les offres ArvoOS sont définies avec votre organisation, selon les modules nécessaires, le nombre d’utilisateurs, la structure des agences et vos workflows spécifiques.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Des offres flexibles", title: "Trois points de départ.", cols: "three",
    items: [
      { title: "Essentiel", text: "Pour les équipes qui veulent réunir leurs processus essentiels — clients, projets et finance — en bon ordre.", items: ["Une sélection de modules essentiels", "Structure de rôles standard", "Aide à la mise en place et à la prise en main"] },
      { title: "Entreprise", text: "Pour les organisations qui gèrent plusieurs équipes ou agences avec des processus connectés.", items: ["Large choix de modules", "Reporting avancé", "Gestion des équipes et des droits"] },
      { title: "Sur mesure", text: "Pour les organisations qui veulent ArvoOS selon leur propre façon de travailler et leur identité.", items: ["Workflows spécifiques", "Votre propre domaine", "Expérience client à vos couleurs"] },
    ],
  },
  steps: {
    eyebrow: "Comment l’offre est définie", title: "Construisons ensemble la bonne offre.",
    lead: "Investissez dans des résultats concrets — pas dans des fonctionnalités dont vous n’avez pas besoin.",
    items: [
      { title: "Analyse des besoins", text: "Ensemble, nous cartographions vos processus, la structure de votre équipe et les modules prioritaires." },
      { title: "Démo personnalisée", text: "Nous vous présentons ArvoOS à travers vos propres processus." },
      { title: "Plan de transition évolutif", text: "Nous planifions étape par étape la mise en place, la reprise des données et la prise en main par l’équipe." },
    ],
  },
  note: `Les prix catalogue mensuels et annuels des offres Essentiel et Entreprise sont publiés sur ${R("pricing")}. Pour l’offre Sur mesure, une proposition est établie une fois le périmètre défini.`,
  faq: { eyebrow: "FAQ", title: "À propos des offres", items: [
    { q: "Combien coûte ArvoOS ?", a: `Les prix mensuels et annuels des offres Essentiel et Entreprise sont publiés sur ${R("pricing")}. La tarification se fait par organisation, et non par utilisateur. Pour l’offre Sur mesure, le tarif est défini avec chaque organisation selon les modules, le nombre d’utilisateurs et la structure des agences.` },
    { q: "Par quelle offre commencer ?", a: "Nous en décidons ensemble après une analyse des besoins ; la plupart des organisations commencent par les modules essentiels et étendent le système au fil du temps." },
    { q: "Puis-je changer d’offre plus tard ?", a: "Oui. Votre offre peut être étendue à mesure que vos modules, vos utilisateurs et la structure de vos agences évoluent." },
    { q: "Pouvons-nous utiliser notre propre domaine ?", a: "Oui. Un domaine personnalisé est connecté avec vérification DNS, et les pages de connexion et pages clients à vos couleurs fonctionnent sur cette adresse." },
  ] },
  cta: { title: "Trouvons la bonne offre pour votre organisation.", actions: [demo, { label: "Tarifs", href: R("pricing"), variant: "ghost" }] },
};
