// Fransızca: pricing-en.ts'in çevirisi. RAKAM YOK; plan kodları ve sıraları İngilizceyle birebir aynı.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { PricingContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;
const demo = { label: "Demander une démo", href: `${R("contact")}?interest=pricing`, variant: "gold" as const };

export const PRICING_FR: PricingContent = {
  id: "pricing",
  meta: {
    title: "Tarifs",
    description:
      "Tarifs des abonnements ArvoOS, ArvoCal et ArvoLab : prix mensuels et annuels, contenu de chaque offre, options et conditions d’abonnement. Tarification par organisation, et non par utilisateur.",
  },
  hero: {
    eyebrow: "Tarifs",
    title: "Pour les produits métier, un prix par organisation —",
    subtitle: "pas par utilisateur.",
    lead: "ArvoOS et ArvoCal sont facturés par organisation : votre facture ne se multiplie pas quand l’équipe grandit, et chaque carte indique le nombre d’utilisateurs inclus. ArvoLab fait exception — sa valeur tient à la personne qui rédige, et non au flux de l’organisation : il est donc facturé par chercheur.",
    actions: [demo, { label: "Conditions d’abonnement", href: "#kosullar", variant: "ghost" }],
  },
  cycle: {
    monthly: "Mensuel",
    yearly: "Annuel",
    badge: "2 mois offerts",
    perMonth: "/mois",
    perYear: "/an",
    perMonthUser: "/utilisateur/mois",
    perYearUser: "/utilisateur/an",
    quote: "Sur demande",
    quoteAction: "Demander un devis",
  },
  vatNote:
    "Tous les prix sont exprimés en euros hors TVA ; les clients en Turquie paient en livres turques aux prix de la page en turc, TVA incluse. Avec l’option annuelle, vous payez 10 mois et en utilisez 12 ; le montant est facturé une seule fois en début de période.",

  groups: [
    {
      product: "arvoos",
      tag: "Système d’exploitation d’entreprise",
      lead: "CRM, devis, contrats signés électroniquement, opérations, finance, RH et reporting dans un seul flux. Les utilisateurs sont inclus dans l’offre.",
      linkLabel: "Découvrir ArvoOS",
      cards: [
        {
          code: "arvoos-baslangic",
          text: "Pour les équipes qui veulent réunir clients, livraison et finance en bon ordre.",
          items: ["3 utilisateurs inclus", "Un seul site", "CRM et pipeline de vente", "Devis et contrats signés électroniquement", "Opérations et suivi des tâches", "Finance et suivi des encaissements", "Support par e-mail"],
        },
        {
          code: "arvoos-kurumsal",
          text: "Pour les organisations qui gèrent plusieurs équipes ou agences avec des processus connectés.",
          items: ["15 utilisateurs inclus", "Agences illimitées", "Tous les modules", "Portail de suivi client", "Matrice des droits rôle × module", "Reporting avancé", "Support prioritaire"],
        },
        {
          code: "arvoos-ozel",
          text: "Pour les organisations qui veulent ArvoOS selon leur propre mode de fonctionnement et leur marque.",
          items: ["Utilisateurs illimités", "Domaine personnalisé", "Workflows spécifiques", "Expérience client à vos couleurs", "Reprise des données et formation de l’équipe", "Accompagnement à la mise en œuvre"],
        },
      ],
    },
    {
      product: "randevu",
      tag: "Gestion des rendez-vous",
      lead: "Une page de réservation en ligne, un agenda et des fiches clients pour les salons de coiffure et instituts de beauté. Les horaires de travail sont définis à l’heure locale de la Turquie.",
      linkLabel: "Découvrir ArvoCal",
      cards: [
        {
          code: "randevu-tek",
          text: "Pour les salons à une seule adresse qui gèrent encore leurs rendez-vous par téléphone et sur carnet.",
          items: ["Un seul salon", "Jusqu’à 5 collaborateurs", "Page de réservation en ligne", "Agenda des rendez-vous", "Fiches et historique clients", "Support par e-mail"],
        },
        {
          code: "randevu-coklu",
          text: "Pour les entreprises qui veulent une vue centralisée et des droits par salon.",
          items: ["Jusqu’à 3 salons", "Collaborateurs illimités", "Agenda et droits par salon", "Rapports centralisés", "Support prioritaire"],
        },
        {
          code: "randevu-zincir",
          text: "Pour les chaînes de plus de trois salons qui veulent leur propre vitrine de marque.",
          items: ["Salons illimités", "Domaine personnalisé", "Workflows spécifiques", "Mise en œuvre et formation de l’équipe"],
        },
      ],
    },
    {
      product: "arvolab",
      tag: "Espace de travail de recherche",
      lead: "Littérature et citations, rédaction académique, contrôle des consignes, analyse et pré-contrôle d’originalité — tout le processus de recherche dans un seul espace de travail, sans un outil et un abonnement distincts pour chaque étape. Facturé par chercheur.",
      linkLabel: "Découvrir ArvoLab",
      cards: [
        {
          code: "arvolab-arastirmaci",
          text: "Pour les chercheurs qui mènent seuls une thèse, un article ou un projet.",
          items: ["Un seul chercheur", "Gestion de la littérature et des citations", "Rédaction académique", "Contrôle des consignes", "Pôle d’analyse (quantitative et qualitative)", "Pré-contrôle d’originalité"],
        },
        {
          // Ekip paketi 28.10.2026'da satıştan kalktı (kurucu kararı): ArvoLab bireysel
          // araştırmacıya satılıyor, kurum lisansı yalnızca üniversite ve eğitim
          // kurumlarına teklifle veriliyor. Kart geri eklenirse lib'deki plan da gerekir.
          code: "arvolab-kurum",
          text: "Réservée aux universités et aux établissements d’enseignement : une licence de site pour un département ou toute l’université, sur devis.",
          items: ["Chercheurs illimités", "Licence de site pour un département ou toute l’université", "Gestion des utilisateurs en interne", "Domaine personnalisé", "Mise en œuvre et formation", "Facturé à l’établissement"],
        },
      ],
    },
  ],

  addOns: {
    eyebrow: "Non inclus",
    title: "Éléments facturés séparément.",
    lead: "Ils s’appliquent lorsque vous dépassez une limite de l’offre ou demandez quelque chose de propre à votre organisation. Rien d’autre n’est ajouté à la facture.",
    quote: "Sur demande",
    items: [
      { code: "ek-kullanici", name: "Utilisateur supplémentaire", text: "Pour chaque utilisateur au-delà du nombre inclus dans une offre ArvoOS. Ne s’applique pas à ArvoLab, déjà facturé par chercheur." },
      { code: "ek-sube", name: "Salon supplémentaire", text: "Pour chaque salon au-delà des trois inclus dans l’offre ArvoCal Multi-sites." },
      { code: "veri-aktarimi", name: "Reprise des données et mise en place", text: "Transfert des données depuis votre système actuel, création des utilisateurs et formation de l’équipe. Facturé une seule fois, selon le périmètre." },
      { code: "ozel-gelistirme", name: "Développement sur mesure", text: "Un workflow, un écran ou un rapport propre à votre organisation. Chiffré une fois le périmètre défini." },
    ],
  },

  policy: {
    eyebrow: "Conditions d’abonnement",
    title: "Les règles derrière le prix.",
    lead: "Voici les règles que nous appliquons réellement ; le texte complet figure dans le contrat de vente à distance et dans la politique d’annulation et de remboursement.",
    items: [
      { title: "Aucun prélèvement automatique", text: "Votre carte n’est jamais débitée d’elle-même. Un lien de paiement vous est envoyé pour chaque période et c’est vous qui validez le paiement." },
      { title: "Résiliation en fin de période", text: "Vous pouvez résilier depuis le panneau ou par e-mail. La résiliation prend effet à la fin de la période payée ; le service reste disponible jusque-là." },
      { title: "Évolution des prix", text: "Votre période en cours n’est pas concernée. Les changements sont annoncés par e-mail au moins 30 jours à l’avance et ne s’appliquent qu’à partir de la période suivante." },
      { title: "Passage à une offre supérieure ou inférieure", text: "Le passage à une offre supérieure prend effet le jour même et seuls les jours restants de la période sont facturés. Le passage à une offre inférieure s’applique à la fin de la période en cours." },
      { title: "Résiliation anticipée d’une offre annuelle", text: "Les mois utilisés sont recalculés au prix catalogue mensuel et le solde restant est remboursé. La remise annuelle n’est retirée que pour les mois non utilisés." },
      { title: "TVA et facturation", text: "Les montants affichés en euros s’entendent hors TVA et hors taxes sur les ventes, appliquées sur la facture selon les règles en vigueur ; les prix en livres turques de la page en turc incluent la TVA. Une facture est émise pour chaque période et envoyée à votre adresse e-mail enregistrée." },
    ],
    links: [
      { label: "Contrat de vente à distance", href: R("distance-sales"), variant: "ghost" },
      { label: "Politique d’annulation et de remboursement", href: R("refund"), variant: "ghost" },
      { label: "Livraison et exécution", href: R("delivery"), variant: "ghost" },
    ],
  },

  faq: {
    eyebrow: "Questions fréquentes",
    title: "À propos des tarifs",
    items: [
      { q: "Les prix incluent-ils la TVA ?", a: "Non. Les montants en euros de cette page s’entendent hors TVA et hors taxes sur les ventes, appliquées sur la facture selon les règles en vigueur. Les prix en livres turques de la page en turc incluent la TVA." },
      { q: "Sommes-nous facturés par utilisateur ?", a: "Pour ArvoOS et ArvoCal, non : les prix sont fixés par organisation et chaque offre inclut un nombre défini d’utilisateurs ; au-delà, seul le tarif par utilisateur supplémentaire s’applique et le prix de l’offre ne se multiplie pas. Pour ArvoLab, oui : il est facturé par chercheur, car la valeur y est produite directement par la personne qui l’utilise." },
      { q: "Une équipe ou une entreprise peut-elle souscrire à ArvoLab ?", a: "ArvoLab est vendu aux chercheurs à titre individuel. Les licences institutionnelles sont proposées uniquement aux universités et aux établissements d’enseignement, sur demande." },
      { q: "Que fait-on économiser la facturation annuelle ?", a: "Avec l’option annuelle, vous payez 10 mois et en utilisez 12 — deux mois offerts. Le montant est facturé une seule fois en début de période." },
      { q: "L’abonnement se renouvelle-t-il automatiquement ?", a: "Non. Votre carte n’est pas débitée automatiquement ; un lien de paiement vous est envoyé pour chaque période et c’est vous qui validez le paiement." },
      { q: "Pouvons-nous changer d’offre plus tard ?", a: "Oui. Le passage à une offre supérieure prend effet le jour même et seuls les jours restants de la période sont facturés ; le passage à une offre inférieure s’applique à la fin de la période en cours." },
      { q: "Que se passe-t-il si les prix changent ?", a: "Votre période en cours n’est pas concernée. Les changements sont annoncés au moins 30 jours à l’avance et s’appliquent à partir de la période suivante." },
      { q: "Nous avons payé à l’année — et si nous résilions plus tôt ?", a: "Les mois utilisés sont recalculés au prix catalogue mensuel et le solde restant est remboursé ; la remise annuelle n’est retirée que pour les mois non utilisés." },
      { q: "Existe-t-il une remise pour plusieurs produits ?", a: "Oui — les organisations qui utilisent plusieurs produits reçoivent un devis groupé. Demandez une démo pour examiner le périmètre ensemble." },
    ],
  },

  cta: {
    title: "Choisissons l’offre adaptée à votre organisation.",
    lead: "Si vous ne savez pas par quelle offre commencer, nous cartographions vos processus ensemble et vous recommandons la bonne.",
    actions: [demo, { label: "Nous écrire", href: `mailto:${COMPANY.email}`, variant: "ghost" }],
  },
};
