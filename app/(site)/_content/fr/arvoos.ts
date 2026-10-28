// Fransızca: arvoos-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import { HOME_FR } from "./home";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;

export const ARVOOS_FR: ProductContent = {
  id: "arvoos",
  name: "ArvoOS",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.arvoos.url,
  featureList: ["CRM et pipeline de vente", "Devis avec acceptation en ligne", "Contrats signés électroniquement et PDF A4", "Centre documentaire", "Opérations, tableau des étapes et calendrier", "Portail de suivi client", "Comptes clients, échéanciers et liens de paiement en ligne", "RH et commissions", "Rapports et rentabilité", "Messagerie d’équipe et notifications", "Matrice des droits rôle × module", "Domaine personnalisé et image de marque", "PWA installable"],
  meta: {
    title: "ArvoOS — Système d’exploitation d’entreprise",
    description: "ArvoOS est un système d’exploitation d’entreprise multi-tenant qui relie CRM, devis avec acceptation en ligne, contrats signés électroniquement, opérations, portail client, finance, RH et rapports dans un seul flux.",
  },
  hero: {
    eyebrow: "ArvoOS · Système d’exploitation d’entreprise",
    title: "Toute votre entreprise.", subtitle: "Un seul flux.",
    lead: "ArvoOS est un système d’exploitation d’entreprise web et multi-tenant qui pilote les entreprises de services et les institutions, de la première demande client au dernier paiement, dans un flux unique et connecté.",
    actions: [
      { label: "Demander une démo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Se connecter", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Que fait ArvoOS ?",
    title: "Vous gardez le contrôle. Le chaos reste derrière vous.",
    lead: "Réunissez tableurs éparpillés, outils déconnectés et responsabilités invisibles dans une seule façon de travailler, bien organisée.",
    items: [
      { title: "Devis", text: "Révisions, options de TVA et plans de paiement ; le client accepte en ligne en un clic.", size: "hero", visual: "s1" },
      { title: "CRM & ventes", text: "Étapes du pipeline, historique client automatique, recherche client instantanée et agenda commercial." },
      { title: "Contrats signés électroniquement", text: "Modèles, signature manuscrite à l’écran et mentions de consentement ; le contenu est verrouillé après signature, avec export PDF A4." },
      { title: "Opérations", text: "Tableau des projets, tableau des étapes, calendrier, tâches et responsables. La signature lance le workflow automatiquement." },
      { title: "Finance", text: "Comptes clients, échéanciers, liens de paiement en ligne, factures et rentabilité par projet." },
      { title: "Portail de suivi client", text: "Le client suit l’avancement, les documents et un récapitulatif des paiements sur une page à vos couleurs, grâce à un code de suivi.", size: "hero", alt: true, visual: "s4" },
      { title: "Ressources humaines", text: "Personnel, rôles, calcul des commissions, journaux d’activité et accords de confidentialité signés électroniquement." },
      { title: "Rapports", text: "Entonnoir de vente avec l’étape la plus faible signalée, rentabilité réelle, tendances et motifs de perte." },
      { title: "Communication", text: "Messagerie d’équipe, centre de notifications, annonces de la direction et tickets de support.", size: "wide" },
    ],
  },
  flow: {
    eyebrow: "De la demande au paiement",
    title: "Saisissez une fois. Disponible à chaque étape.",
    lead: HOME_FR.story.lead,
    steps: HOME_FR.story.steps,
    cta: { label: "Voir tous les modules", href: R("arvoos-modules"), variant: "primary" },
  },
  audience: {
    eyebrow: "Pour qui ?",
    title: "Pour chaque équipe qui vend, livre et encaisse.",
    lead: "Les entreprises de services et les institutions qui gèrent la vente, la livraison et l’encaissement entre plusieurs personnes, équipes ou agences.",
    more: "Configuré selon le secteur",
    items: [
      { title: "Établissements de santé", text: "Demandes des patients, rendez-vous, équipes et encaissements, en bon ordre.", href: R("arvoos-industries") },
      { title: "Établissements d’enseignement", text: "Du candidat à l’inscription, du plan de paiement aux formalités.", href: R("arvoos-industries") },
      { title: "Conseil & services", text: "Transformez les demandes en projets planifiés, mesurables et rentables.", href: R("arvoos-industries") },
      { title: "Entreprises multi-sites", text: "Préservez les standards centraux tout en accélérant chaque équipe.", href: R("arvoos-industries") },
    ],
  },
  band: {
    eyebrow: "À votre image",
    title: "Votre domaine. Votre marque.",
    lead: "Chaque organisation travaille dans son propre espace isolé — de l’écran de connexion au document final, vos clients ne voient que votre marque.",
    items: [
      "Domaine personnalisé vérifié par DNS",
      "Pages de connexion et pages clients à vos couleurs",
      "Logo, couleur de marque, cachet et signature",
      "Coordonnées légales et bancaires reprises dans les devis et contrats",
      "Droits rôle × module et historique d’audit",
      "PWA installable qui fonctionne comme une application mobile",
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "À propos d’ArvoOS",
    items: [
      { q: "Qu’est-ce qu’ArvoOS ?", a: "ArvoOS est le système d’exploitation d’entreprise web et multi-tenant d’Arvo. Il relie CRM et ventes, devis, contrats signés électroniquement, opérations, portail de suivi client, finance, RH, rapports et communication d’équipe dans un seul flux." },
      { q: "Comment ArvoOS mène-t-il un projet de la demande au paiement ?", a: "La demande entre dans le pipeline et devient un devis ; le client l’accepte en ligne et signe le contrat électroniquement. La signature lance le workflow du projet, le client suit l’avancement dans le portail, et les échéances sont encaissées via des liens de paiement en ligne." },
      { q: "ArvoOS prend-il en charge la signature électronique ?", a: "Oui. Le client signe à l’écran avec des mentions de consentement ; l’adresse IP, l’horodatage, l’appareil et une empreinte de vérification sont enregistrés, et le contenu est verrouillé après signature." },
      { q: "ArvoOS peut-il fonctionner sur notre propre domaine, à nos couleurs ?", a: "Oui. Vous pouvez connecter un domaine personnalisé vérifié par DNS et utiliser votre logo, votre couleur de marque, votre cachet et votre signature sur les pages de connexion, les pages clients, les devis et les contrats." },
      { q: "ArvoOS fonctionne-t-il sur mobile ?", a: "Oui. Il s’installe en PWA et fonctionne comme une application mobile, avec une barre d’onglets en bas d’écran et des panneaux coulissants." },
      { q: "Combien coûte ArvoOS ?", a: `Les prix mensuels et annuels des offres Essentiel et Entreprise sont publiés sur ${ROUTES.pricing.fr}. La tarification se fait par organisation, et non par utilisateur. Pour l’offre Sur mesure, le tarif est défini avec chaque organisation selon les modules, le nombre d’utilisateurs et la structure des agences.` },
    ],
  },
  cta: {
    eyebrow: "Une démo pour votre organisation",
    title: "Concevons ensemble le fonctionnement d’ArvoOS pour votre entreprise.",
    lead: "Parlez-nous de vos besoins — nous vous présenterons ArvoOS à travers vos propres processus.",
    actions: [
      { label: "Demander une démo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Voir les offres", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
