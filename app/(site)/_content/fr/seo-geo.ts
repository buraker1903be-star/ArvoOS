// Fransızca: seo-geo-en.ts'in çevirisi. Sıralama / trafik vaadi yok; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].fr;
const talk = { label: "Analysons votre site", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SEO_GEO_FR: SubContent = {
  id: "seo-geo",
  parent: { id: "services", name: "Services" },
  meta: { title: "Contenus SEO & GEO", description: "SEO & GEO par ArvoOS : SEO technique, architecture de contenu, données structurées (JSON-LD), llms.txt, contenus que les moteurs de réponse IA peuvent citer, configuration multilingue et performance." },
  hero: {
    eyebrow: "Services · SEO & GEO", title: "Soyez trouvé quand on vous cherche.", subtitle: "Soyez expliqué quand on pose la question.",
    lead: "Le travail de contenu SEO & GEO garantit que votre site est correctement indexé par les moteurs de recherche, et compris et citable par les moteurs de réponse IA tels que ChatGPT, Perplexity et Google AI Overviews.",
    actions: [talk, { label: "Tous les services", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Ce que nous faisons", title: "Une seule fondation pour la recherche et l’IA.",
    lead: "Le GEO (generative engine optimization) donne à vos contenus la clarté, la structure et la vérifiabilité nécessaires pour servir de source dans les réponses IA.",
    numbered: true,
    items: [
      { title: "SEO technique", text: "Exploration, indexation, sitemaps, robots, URL canoniques et redirections." },
      { title: "Architecture de contenu", text: "Hiérarchie des pages, titres clairs, et chaque page qui répond bien à une question." },
      { title: "Données structurées", text: "JSON-LD schema.org pour votre organisation, vos produits, vos services, vos FAQ et votre fil d’Ariane." },
      { title: "llms.txt", text: "Un index lisible par les machines qui donne aux assistants IA un résumé de votre site et de ses pages clés." },
      { title: "Contenus citables", text: "Des définitions en une phrase et des FAQ courtes et factuelles — vérifiables, sans affirmations inventées." },
      { title: "Multilingue & performance", text: "Appariement des langues avec hreflang ; des pages rapides et stables, construites autour des Core Web Vitals." },
    ],
  },
  steps: {
    eyebrow: "Processus", title: "De l’audit à l’amélioration continue.",
    items: [
      { title: "Audit", text: "Nous examinons votre configuration technique, la structure de vos contenus et votre visibilité actuelle." },
      { title: "Stratégie & architecture de contenu", text: "Nous définissons les questions cibles, la hiérarchie des pages et les priorités." },
      { title: "Mise en œuvre technique", text: "Nous mettons en place sitemaps, données structurées, llms.txt, hreflang et améliorations de performance." },
      { title: "Édition des contenus", text: "Nous retravaillons les textes avec des définitions claires, des titres sous forme de questions et des réponses courtes." },
      { title: "Mesure & amélioration", text: "Nous poursuivons le travail à partir des données de la Search Console et de contrôles réguliers." },
    ],
  },
  band: {
    eyebrow: "En pratique", title: "Ce site a été construit de la même façon.",
    lead: "arvo-os.com a été construit avec des données structurées, llms.txt, hreflang et des contenus organisés autour de questions.",
    items: ["JSON-LD schema.org sur chaque page", "llms.txt et llms-full.txt", "hreflang entre six versions linguistiques", "Des pages qui s’ouvrent sur une définition, avec des FAQ courtes"],
  },
  note: "Les moteurs de recherche et les services d’IA décident selon leurs propres algorithmes ; aucun positionnement, trafic ou citation précis n’est promis.",
  faq: { eyebrow: "FAQ", title: "À propos du SEO & GEO", items: [
    { q: "Qu’est-ce que le GEO ?", a: "Le GEO (generative engine optimization) consiste à faire en sorte que vos contenus soient correctement compris — et citables comme source — par les moteurs de réponse IA tels que ChatGPT, Perplexity et Google AI Overviews." },
    { q: "Quelle est la différence entre SEO et GEO ?", a: "Le SEO vise l’indexation et la visibilité dans les résultats de recherche ; le GEO, une information exacte et citable dans les réponses IA. Les deux reposent sur la même fondation technique et éditoriale solide." },
    { q: "Qu’est-ce que llms.txt ?", a: "Un fichier texte publié à la racine du site, qui donne aux assistants IA un court résumé du site et de ses pages clés." },
    { q: "Garantissez-vous un positionnement ?", a: "Non. Aucun positionnement, trafic ou citation précis n’est promis ; nous construisons la bonne fondation technique et la bonne structure de contenu." },
    { q: "Est-ce applicable à mon site existant ?", a: "Oui. Nous commençons par un audit ; les améliorations techniques et éditoriales peuvent généralement être appliquées à un site existant." },
  ] },
  cta: { title: "Faisons en sorte que votre site soit trouvé quand on le cherche — et expliqué quand on pose la question.", actions: [talk, { label: "Création de site web", href: R("web-design"), variant: "ghost" }] },
  serviceName: "Contenus SEO et GEO",
};
