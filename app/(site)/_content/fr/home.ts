// Fransızca: home-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { HomeContent } from "../home";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;

export const HOME_FR: HomeContent = {
  meta: {
    title: "Arvo | ArvoOS, ArvoLab et ArvoBook — de meilleurs systèmes pour mieux travailler",
    description: "Arvo conçoit ArvoOS pour les entreprises, ArvoLab pour les chercheurs et ArvoBook pour les salons — et propose la création de sites web et e-commerce, le SEO & GEO et le développement de logiciels sur mesure.",
  },
  hero: {
    eyebrow: "La famille de produits Arvo",
    title: "De meilleurs systèmes", subtitle: "pour mieux travailler.",
    lead: "Arvo est une marque de logiciels qui conçoit ArvoOS pour les entreprises, ArvoLab pour les chercheurs et ArvoBook pour les salons. Elle transforme le travail complexe en expériences sereines, puissantes et connectées.",
    actions: [
      { label: "Demander une démo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Découvrir les produits", href: "#produits", variant: "ghost" },
    ],
    familyLabel: "Produits Arvo",
  },
  statement: ["La complexité reste en coulisses.", "Il ne reste que le progrès.", "Chaque produit Arvo suit un même principe :", "même le processus le plus exigeant doit sembler naturel."],
  products: {
    eyebrow: "La famille de produits",
    title: "Puissants aujourd’hui. Prêts pour demain.",
    lead: "Trois produits, chacun expert dans son domaine. Ensemble, un écosystème qui couvre votre façon de travailler.",
    os: {
      label: "Système d’exploitation d’entreprise", title: "Toute votre entreprise. Un seul flux.",
      text: "Du CRM et des ventes aux contrats signés électroniquement, des opérations à la finance, aux RH et au reporting — chaque étape connectée dans un seul système.",
      chips: ["CRM & ventes", "Devis & signature électronique", "Opérations", "Portail client", "Finance", "RH & rapports"],
      cta: { label: "Découvrir ArvoOS", href: R("arvoos"), variant: "gold" },
      signIn: { label: "Se connecter", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    },
    lab: {
      label: "Espace de travail de recherche", title: "Un espace de travail plus solide pour la recherche.",
      text: "De la revue de littérature à la rédaction académique, du contrôle des consignes à l’analyse — les étapes essentielles de la recherche dans un espace de travail serein.",
      chips: ["Littérature & citations", "Rédaction académique", "Contrôle des consignes", "Analyse"],
      cta: { label: "Découvrir ArvoLab", href: R("arvolab"), variant: "primary" },
      signIn: { label: "Se connecter", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    },
    book: {
      label: "Gestion des rendez-vous en salon", title: "Libérez le téléphone du carnet de rendez-vous.",
      text: "Vos clients choisissent eux-mêmes la prestation, le coiffeur et l’horaire, et la réservation arrive instantanément dans votre agenda. Agendas par collaborateur, horaires de travail et congés, aucune double réservation.",
      chips: ["Page de réservation en ligne", "Agenda du personnel", "Horaires & congés", "Fiches clients"],
      cta: { label: "Découvrir ArvoBook", href: R("randevu"), variant: "gold" },
      signIn: { label: "Se connecter", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    },
  },
  global: {
    badges: ["6 langues", "EUR · USD · TRY", "Tout navigateur, tout appareil"],
    eyebrow: "Fonctionne partout",
    title: "Où que vous travailliez.",
    lead: "Les produits Arvo sont des applications web qui fonctionnent dans le navigateur : rien à installer, aucun serveur à gérer, le même système où que soit votre équipe.",
    items: [
      { title: "Six langues", text: "Français, English, Türkçe, Deutsch, Español et العربية — y compris l’écriture de droite à gauche." },
      { title: "Prix en EUR, USD et TRY", text: "Un prix catalogue fixe dans chaque devise ; pas de montants qui varient avec le taux de change." },
      { title: "Tout navigateur, tout appareil", text: "La même expérience sur ordinateur, tablette et téléphone. Rien à installer sur vos serveurs." },
      { title: "Vos données, votre espace", text: "Chaque organisation travaille dans son propre espace séparé ; les rôles décident qui voit quoi." },
    ],
    from: "À partir de {price}", perMonth: "/mois", perUserMonth: "/utilisateur/mois", onRequest: "Sur devis",
  },
  band: {
    words: ["CRM", "Devis", "Signature électronique", "Opérations", "Portail client", "Finance", "Équipes", "Rapports"],
    caption: "Un seul socle. Treize domaines fonctionnels connectés.",
  },
  story: {
    eyebrow: "ArvoOS",
    title: "De la demande au paiement. Un seul flux.",
    lead: "Une donnée saisie une fois circule d’elle-même à travers chaque étape. Personne ne tape deux fois la même chose.",
    cta: { label: "Voir les modules", href: R("arvoos-modules"), variant: "primary" },
    steps: [
      { title: "Demande", text: "La demande arrive dans le pipeline CRM ; l’historique du client s’affiche automatiquement et un commercial est assigné." },
      { title: "Devis", text: "Un devis avec options de TVA et plan de paiement est envoyé par WhatsApp ou e-mail ; le client l’accepte en ligne en un clic." },
      { title: "Signature électronique", text: "Le devis accepté devient un contrat en une étape ; le client signe d’une signature manuscrite à l’écran. Le contenu est verrouillé par un horodatage et une empreinte de vérification." },
      { title: "Workflow", text: "La signature lance automatiquement le workflow du projet : tâches, responsables, échéances, tableau des étapes et calendrier." },
      { title: "Portail de suivi", text: "Grâce à un code de suivi, le client suit l’avancement et les documents sur une page à vos couleurs, et échange avec votre équipe." },
      { title: "Paiement en ligne", text: "Les échéances sont encaissées via des liens de paiement en ligne ; les livrables restent verrouillés jusqu’au paiement." },
      { title: "Rapports", text: "Entonnoir de vente, étape la plus faible et rentabilité réelle par projet — sur un seul écran." },
    ],
  },
  eco: {
    eyebrow: "Écosystème",
    title: "Trois produits. Un seul écosystème.",
    lead: "ArvoOS, ArvoLab et ArvoBook sont des applications web distinctes, chacune sur son propre sous-domaine arvo-os.com, conçues par la même équipe selon un même standard de marque et de qualité.",
    roles: ["Opérations", "Recherche", "Salons"],
    principles: [
      { title: "Un espace à vous", text: "Chaque organisation, équipe ou salon travaille dans son propre espace de travail." },
      { title: "Un même langage visuel", text: "La même interface sereine et le même soin, dans chaque produit." },
      { title: "Des produits qui grandissent avec vous", text: "À mesure que votre organisation se développe, la famille de produits évolue avec elle." },
    ],
  },
  values: {
    eyebrow: "Nos principes",
    title: "Notre façon de concevoir.",
    items: [
      { title: "Simple.", text: "Rien de superflu. Tout ce dont vous avez besoin, exactement à sa place." },
      { title: "Puissant.", text: "Des fondations fiables, maîtrisées et évolutives pour le travail critique." },
      { title: "Unifié.", text: "Une façon de travailler fluide entre produits, équipes et données." },
    ],
  },
  services: {
    eyebrow: "Services",
    title: "L’équipe derrière nos produits travaille aussi pour vous.",
    lead: "Du site web au logiciel sur mesure, nous donnons à votre marque et à vos processus leur forme numérique la plus aboutie.",
    items: [
      { tag: "Design & développement", title: "Création de site web", text: "Stratégie, architecture de contenu, design UX/UI, développement et mise en ligne dans un seul processus.", href: R("web-design") },
      { tag: "Visibilité", title: "SEO & GEO", text: "Des fondations techniques et éditoriales que les moteurs de recherche et les moteurs de réponse IA comprennent — et peuvent citer.", href: R("seo-geo") },
      { tag: "Logiciel", title: "Logiciel sur mesure", text: "Panneaux d’administration, portails et logiciels de workflow sur mesure ; intégrations et automatisation.", href: R("custom-software") },
    ],
    more: "En savoir plus",
    cta: { label: "Tous les services", href: R("services"), variant: "ghost" },
    all: { title: "Et plus encore", text: "Des services numériques de bout en bout, de la stratégie à la mise en ligne.", items: ["Design de processus et d’expérience", "Systèmes numériques d’entreprise", "Développement continu"] },
  },
  refs: { eyebrow: "Références", title: "Les marques avec lesquelles nous construisons.", lead: "Une famille de marques qui partagent le même niveau d’exigence et créent de la valeur ensemble.", culture: "Visiter le site", akademik: "Visiter le site" },
  faq: {
    eyebrow: "FAQ",
    title: "Questions sur Arvo",
    items: [
      { q: "Qu’est-ce qu’Arvo ?", a: `Arvo est la marque de logiciels de ${COMPANY.legalName}. Elle conçoit ArvoOS pour les entreprises, ArvoLab pour les chercheurs et ArvoBook pour les salons, et propose également la création de sites web et e-commerce ainsi que le développement de logiciels sur mesure.` },
      { q: "Quelle est la différence entre ArvoOS, ArvoLab et ArvoBook ?", a: "ArvoOS pilote les opérations d’une entreprise, de la demande au paiement. ArvoLab accompagne la recherche et la rédaction académiques. ArvoBook gère le carnet de rendez-vous d’un salon : les clients réservent eux-mêmes et l’agenda s’organise par collaborateur." },
      { q: "Où me connecter aux produits Arvo ?", a: `ArvoOS fonctionne sur ${PRODUCT_APPS.arvoos.host}, ArvoLab sur ${PRODUCT_APPS.arvolab.host} et ArvoBook sur ${PRODUCT_APPS.randevu.host}. Les trois sont des applications web qui s’exécutent dans le navigateur.` },
      { q: "Combien coûte ArvoOS ?", a: `Les prix catalogue mensuels et annuels sont publiés sur ${ROUTES.pricing.fr} ; la tarification se fait par organisation, et non par utilisateur. Pour l’offre Sur mesure, le tarif est défini avec chaque organisation.` },
      { q: "Comment demander une démo ?", a: `Remplissez le formulaire de la page contact ou écrivez à ${COMPANY.email} ; votre demande est transmise à l’équipe produit concernée.` },
    ],
  },
  cta: {
    eyebrow: "Une démo pour votre organisation",
    title: "Construisons ensemble les systèmes de demain.",
    lead: "Laissez-nous vous montrer comment ArvoOS, ArvoLab ou ArvoBook fonctionneraient pour vous.",
    actions: [
      { label: "Demander une démo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Nous découvrir", href: R("about"), variant: "ghost" },
    ],
    note: "ou écrivez-nous directement :",
  },
};
