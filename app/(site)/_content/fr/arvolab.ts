// Fransızca: arvolab-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;

export const ARVOLAB_FR: ProductContent = {
  id: "arvolab",
  name: "ArvoLab",
  category: "EducationalApplication",
  appUrl: PRODUCT_APPS.arvolab.url,
  featureList: ["Gestion de la littérature et des citations", "Rédaction académique", "Contrôle des consignes", "Analyse quantitative et qualitative", "Éditeur académique", "Pré-contrôle d’originalité"],
  meta: {
    title: "ArvoLab — Espace de travail de recherche",
    description: "ArvoLab réunit dans un seul espace de travail la gestion de la littérature et des citations, la rédaction académique, le contrôle des consignes, l’analyse quantitative et qualitative, un éditeur académique et un pré-contrôle d’originalité.",
  },
  hero: {
    eyebrow: "ArvoLab · Espace de travail de recherche",
    title: "Un espace de travail plus solide", subtitle: "pour la recherche.",
    lead: "ArvoLab est un espace de travail de recherche en ligne qui réunit en un seul lieu les étapes essentielles du travail académique — de la littérature à la rédaction, du contrôle des documents à l’analyse.",
    actions: [
      { label: "Essai gratuit", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Se connecter à ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Fonctionnalités",
    title: "Un processus plus clair. Un résultat plus solide.",
    lead: "Rassemblez outils et vérifications de recherche dispersés dans un espace connecté où vous voyez votre travail dans son ensemble.",
    items: [
      { title: "Littérature & citations", text: "Collez un DOI : la référence se complète depuis Crossref et OpenAlex. APA 7, Harvard, Chicago, MLA 9, IEEE et Vancouver ; citations dans le texte et bibliographie s’écrivent ensemble." },
      { title: "Rédaction académique", text: "Développez vos textes de recherche avec une structure solide et une méthode de travail cohérente." },
      { title: "Contrôle des consignes", text: "Importez vos consignes de thèse en PDF ou par lien : mise en page, sections obligatoires, style de citation et limites sont extraits, et les règles que vous confirmez s’appliquent dans l’éditeur. Consignes en anglais et en turc prises en charge." },
      { title: "Pôle d’analyse", text: "Organisez vos processus de recherche quantitative et qualitative dans un seul espace de travail." },
      { title: "Éditeur académique", text: "Word et PDF prêts au dépôt, en A4 ou US Letter, avec table des matières, notes de bas de page et numérotation des titres. Une liste de contrôle montre en un seul endroit ce qui manque encore." },
      { title: "Pré-contrôle d’originalité", text: "Relisez votre texte avant dépôt pour repérer plus tôt les risques potentiels." },
    ],
  },
  flow: {
    eyebrow: "Le flux de recherche",
    title: "À vos côtés à chaque étape de la recherche.",
    lead: "Une façon de travailler globale qui permet au chercheur de se concentrer sur la qualité du résultat, et non sur les outils.",
    steps: [
      { title: "Rassembler les sources", text: "Organisez votre littérature et vos citations en un seul endroit." },
      { title: "Rédiger", text: "Développez votre texte dans une structure cohérente et intégrez les étapes de révision au flux." },
      { title: "Vérifier", text: "Lancez le contrôle des consignes et le pré-contrôle d’originalité avant le dépôt." },
      { title: "Analyser", text: "Menez vos analyses quantitatives et qualitatives dans le même espace de travail." },
    ],
  },
  audience: {
    eyebrow: "Pour qui ?",
    title: "Conçu pour le chercheur individuel.",
    lead: "ArvoLab est conçu pour s’adapter aux différentes échelles du travail académique.",
    items: [
      { title: "Chercheurs individuels", text: "Pour mener thèses, articles et projets dans un espace de travail serein." },
      { title: "Étudiants de master et doctorants", text: "Pour mener un mémoire ou une thèse du début à la fin avec un seul abonnement." },
      { title: "Universités", text: "Les licences institutionnelles sont réservées aux universités et aux établissements d’enseignement, sur demande." },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "À propos d’ArvoLab",
    items: [
      { q: "Qu’est-ce qu’ArvoLab ?", a: "ArvoLab est l’espace de travail de recherche de la marque ArvoOS, dédié à la gestion de la littérature et des citations, à la rédaction académique, au contrôle des consignes, à l’analyse quantitative et qualitative, à l’édition académique et au pré-contrôle d’originalité." },
      { q: "À qui s’adresse ArvoLab ?", a: "Aux chercheurs individuels. Les licences institutionnelles sont réservées aux universités et aux établissements d’enseignement, sur demande." },
      { q: "Comment obtenir un accès à ArvoLab ?", a: "Créez un compte sur la page d’inscription et commencez tout de suite avec un essai gratuit ; ensuite, l’abonnement se paie par carte. Pour une licence institutionnelle, utilisez le formulaire de contact ou écrivez à info@arvo-os.com." },
      { q: "Le pré-contrôle d’originalité remplace-t-il un rapport officiel ?", a: "Non. Il s’agit d’un pré-contrôle qui vous aide à repérer les risques avant le dépôt ; votre établissement peut toujours exiger son propre rapport d’originalité officiel." },
      { q: "Quelle est la différence entre ArvoLab et ArvoOS ?", a: "ArvoOS pilote les opérations d’une entreprise ; ArvoLab est un espace de travail qui accompagne la recherche et la rédaction académiques." },
    ],
  },
  cta: {
    eyebrow: "Accès",
    title: "Essayez ArvoLab dès aujourd’hui.",
    lead: "Créez votre compte et commencez par un essai gratuit ; paiement par carte, avec 3D Secure ; aucun prélèvement automatique. Contactez-nous pour une licence institutionnelle.",
    actions: [
      { label: "Essai gratuit", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Se connecter à ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
      { label: "Licence institutionnelle", href: `${R("contact")}?interest=arvolab`, variant: "ghost" },
    ],
  },
};
