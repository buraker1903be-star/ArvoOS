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
      { label: "Demander un accès", href: `${R("contact")}?interest=arvolab`, variant: "gold" },
      { label: "Se connecter à ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Fonctionnalités",
    title: "Un processus plus clair. Un résultat plus solide.",
    lead: "Rassemblez outils et vérifications de recherche dispersés dans un espace connecté où vous voyez votre travail dans son ensemble.",
    items: [
      { title: "Littérature & citations", text: "Organisez vos sources et gérez de façon systématique votre littérature et vos citations." },
      { title: "Rédaction académique", text: "Développez vos textes de recherche avec une structure solide et une méthode de travail cohérente." },
      { title: "Contrôle des consignes", text: "Comparez plus rapidement la structure et la mise en forme de votre document aux consignes." },
      { title: "Pôle d’analyse", text: "Organisez vos processus de recherche quantitative et qualitative dans un seul espace de travail." },
      { title: "Éditeur académique", text: "Intégrez les étapes de relecture et d’amélioration du texte à votre flux de recherche." },
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
    title: "Des chercheurs individuels aux institutions.",
    lead: "ArvoLab est conçu pour s’adapter aux différentes échelles du travail académique.",
    items: [
      { title: "Chercheurs individuels", text: "Pour mener thèses, articles et projets dans un espace de travail serein." },
      { title: "Équipes académiques", text: "Pour les équipes qui organisent sources, textes et vérifications de façon partagée." },
      { title: "Institutions", text: "Pour les institutions qui proposent un environnement de recherche complet." },
    ],
  },
  faq: {
    eyebrow: "FAQ",
    title: "À propos d’ArvoLab",
    items: [
      { q: "Qu’est-ce qu’ArvoLab ?", a: "ArvoLab est l’espace de travail de recherche de la marque ArvoOS, dédié à la gestion de la littérature et des citations, à la rédaction académique, au contrôle des consignes, à l’analyse quantitative et qualitative, à l’édition académique et au pré-contrôle d’originalité." },
      { q: "À qui s’adresse ArvoLab ?", a: "Aux chercheurs individuels, aux équipes académiques et aux institutions." },
      { q: "Comment obtenir un accès à ArvoLab ?", a: `Demandez un accès via le formulaire de contact ou à l’adresse info@arvo-os.com. La connexion se fait sur ${PRODUCT_APPS.arvolab.url}.` },
      { q: "Le pré-contrôle d’originalité remplace-t-il un rapport officiel ?", a: "Non. Il s’agit d’un pré-contrôle qui vous aide à repérer les risques avant le dépôt ; votre établissement peut toujours exiger son propre rapport d’originalité officiel." },
      { q: "Quelle est la différence entre ArvoLab et ArvoOS ?", a: "ArvoOS pilote les opérations d’une entreprise ; ArvoLab est un espace de travail qui accompagne la recherche et la rédaction académiques." },
    ],
  },
  cta: {
    eyebrow: "Accès",
    title: "Contactez-nous pour accéder à ArvoLab.",
    lead: "Pour un usage individuel ou institutionnel, notre équipe vous accompagne.",
    actions: [
      { label: "Demander un accès", href: `${R("contact")}?interest=arvolab`, variant: "gold" },
      { label: "Se connecter à ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
};
