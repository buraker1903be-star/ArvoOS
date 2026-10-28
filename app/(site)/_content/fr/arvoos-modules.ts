// Fransızca: arvoos-modules-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;

export const MODULES_FR: SubContent = {
  id: "arvoos-modules",
  parent: { id: "arvoos", name: "ArvoOS" },
  meta: {
    title: "Modules ArvoOS",
    description: "Modules ArvoOS : CRM et ventes, devis, contrats, centre documentaire, opérations, portail de suivi client, finance, RH, rapports, communication, gouvernance, image de marque et expérience mobile.",
  },
  hero: {
    eyebrow: "ArvoOS · Modules",
    title: "Pas des outils séparés.", subtitle: "Des modules qui travaillent ensemble.",
    lead: "Les modules ArvoOS forment 13 domaines fonctionnels qui partagent les mêmes données : un travail commencé dans un module passe au suivant sans que personne ait à le ressaisir.",
    actions: [{ label: "Demander une démo", href: `${R("contact")}?interest=arvoos`, variant: "gold" }],
  },
  cards: {
    eyebrow: "Domaines fonctionnels",
    title: "Chaque recoin de votre entreprise. Un seul socle.",
    lead: "Commencez par les modules dont vous avez besoin ; étendez le système à mesure que votre équipe et vos processus se développent.",
    cols: "two", numbered: true,
    items: [
      { title: "CRM & ventes", size: "hero", visual: "s0", text: "Le flux commercial qui transforme les demandes en clients, et les clients en chiffre d’affaires.", items: ["Pipeline par étapes avec motifs de perte", "Historique client automatique sur chaque nouvelle demande", "Recherche client instantanée par téléphone ou par nom", "Attribution des commerciaux et agenda commercial"] },
      { title: "Devis", text: "Le processus commercial, de la rédaction à l’acceptation.", items: ["Révisions ; TVA incluse, exclue ou exonérée", "Paiement unique ou échéancier", "Liens de partage par WhatsApp et e-mail", "Acceptation en ligne enregistrée avec date et heure, IP et appareil"] },
      { title: "Contrats", text: "Un contrat prêt à signer à partir d’un devis, en une étape.", items: ["Modèles de contrat", "Signature électronique manuscrite à l’écran avec mentions de consentement", "IP, horodatage, appareil et empreinte de vérification", "Contenu verrouillé après signature, PDF A4"] },
      { title: "Centre documentaire", text: "Tous les documents d’une affaire sur une seule chronologie.", items: ["Demande → devis → contrat → opérations → paiement", "Journaux d’accès aux documents", "Aperçu et PDF"] },
      { title: "Opérations", size: "hero", alt: true, visual: "s3", text: "Transformez le travail vendu en un flux que vos équipes peuvent livrer.", items: ["Projets nouveaux, en cours et à échéance proche", "Tableau des projets, tableau des étapes et calendrier", "Charge de l’équipe : qui a quoi, qui est en retard, qui est disponible", "Modèles d’étapes par type de travail", "Workflow déclenché à la signature, et archives"] },
      { title: "Portail de suivi client", text: "Une page à vos couleurs où votre client suit son propre projet.", items: ["Avancement et étapes via un code de suivi", "Récapitulatif des paiements, devis et contrat", "Messagerie avec l’équipe opérationnelle", "Dernière visite, nombre de visites et indicateur en ligne", "Livraison des fichiers conditionnée au paiement, via des liens sécurisés à durée limitée"] },
      { title: "Finance", text: "Une vision financière à jour, liée aux ventes et aux opérations.", items: ["Comptes clients et écritures", "Encaissements, remboursements et prestations supplémentaires", "Échéanciers avec un lien de paiement en ligne par échéance", "Factures, coûts par projet et rentabilité réelle"] },
      { title: "Ressources humaines", text: "La structure de l’équipe et les processus RH, en bon ordre.", items: ["Personnel, services et invitations par e-mail", "Rôles et commissions avec historique des taux", "Versement des commissions réparti par projet, avec avances", "Journaux d’activité et de session du personnel", "Accords de confidentialité (NDA) du personnel signés électroniquement"] },
      { title: "Rapports", text: "Transformez les données de chaque module en décisions.", items: ["Entonnoir de vente avec l’étape la plus faible signalée", "Ventes et rentabilité réelle", "Tendances sur six mois et motifs de perte", "Impression et PDF"] },
      { title: "Communication", text: "Les échanges d’équipe juste à côté du travail.", items: ["Messages directs avec pièces jointes", "Centre de notifications avec compteur en direct", "Notifications push sur téléphone et ordinateur", "Annonces de la direction", "Centre de support"] },
      { title: "Gouvernance & sécurité", text: "Qui voit quoi — clair et vérifiable.", items: ["Matrice des droits rôle × module et capacités d’action", "Profils prêts à l’emploi : Responsable des opérations, Responsable commercial", "Accès au niveau de l’enregistrement et exceptions individuelles", "Sécurité au niveau des lignes dans la base de données", "Historique d’audit"] },
      { title: "Multi-tenant & image de marque", text: "Chaque organisation dans son propre espace, sous sa propre marque.", items: ["Espace de travail isolé par organisation", "Domaine personnalisé avec vérification DNS", "Logo, couleur de marque, icône d’onglet, cachet et signature", "Vos propres clauses de contrat et de devis", "Coordonnées légales et bancaires reprises dans les documents"] },
      { title: "Expérience", size: "wide", text: "Puissant sur ordinateur, aussi simple qu’une application sur votre téléphone.", items: ["PWA installable", "Barre d’onglets en bas d’écran et panneaux coulissants", "Thèmes sombre et clair", "Interface en turc"] },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "À propos des modules",
    items: [
      { q: "Quels modules ArvoOS comprend-il ?", a: "CRM et ventes, devis, contrats, centre documentaire, opérations, portail de suivi client, finance, ressources humaines, rapports et communication — complétés par la gouvernance, l’image de marque et une expérience mobile." },
      { q: "Comment les modules sont-ils reliés ?", a: "Ils partagent tous les mêmes données : un devis accepté devient un contrat en une étape, un contrat signé devient automatiquement un workflow de projet, et les paiements comme la rentabilité restent rattachés au même projet." },
      { q: "Devons-nous utiliser tous les modules ?", a: "Non. Votre offre est construite autour des modules dont vous avez besoin et peut être étendue à mesure que le système évolue." },
      { q: "Qui peut voir quel module ?", a: "C’est la matrice des droits rôle × module qui le détermine ; certains rôles, comme les commerciaux, peuvent être limités à leurs propres enregistrements." },
    ],
  },
  cta: {
    title: "Choisissons ensemble les modules par lesquels commencer.",
    actions: [
      { label: "Demander une démo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Offres", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
