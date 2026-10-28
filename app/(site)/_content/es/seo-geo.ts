// İspanyolca: seo-geo-en.ts'in çevirisi. Sıralama, trafik ya da atıf vaadi yok.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;
const talk = { label: "Revisemos su sitio", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SEO_GEO_ES: SubContent = {
  id: "seo-geo",
  parent: { id: "services", name: "Servicios" },
  meta: { title: "Contenido SEO y GEO", description: "SEO y GEO de Arvo: SEO técnico, arquitectura de contenidos, datos estructurados (JSON-LD), llms.txt, contenido que los motores de respuesta con IA pueden citar, configuración multilingüe y rendimiento." },
  hero: {
    eyebrow: "Servicios · SEO y GEO", title: "Que le encuentren cuando le buscan.", subtitle: "Que le expliquen cuando preguntan.",
    lead: "El trabajo de contenido SEO y GEO garantiza que los buscadores indexen correctamente su sitio y que motores de respuesta con IA como ChatGPT, Perplexity y Google AI Overviews lo entiendan y puedan citarlo.",
    actions: [talk, { label: "Todos los servicios", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Qué hacemos", title: "Una misma base para la búsqueda y la IA.",
    lead: "El GEO (optimización para motores generativos) da a su contenido la claridad, la estructura y la verificabilidad que necesita para usarse como fuente en las respuestas de IA.",
    numbered: true,
    items: [
      { title: "SEO técnico", text: "Rastreabilidad, indexación, mapas del sitio, robots, URL canónicas y redirecciones." },
      { title: "Arquitectura de contenidos", text: "Jerarquía de páginas, encabezados claros y cada página respondiendo bien a una pregunta." },
      { title: "Datos estructurados", text: "JSON-LD de schema.org para su organización, productos, servicios, preguntas frecuentes y rutas de navegación." },
      { title: "llms.txt", text: "Un índice legible por máquinas que ofrece a los asistentes de IA un resumen de su sitio y de sus páginas clave." },
      { title: "Contenido citable", text: "Definiciones de una frase y preguntas frecuentes breves y factuales: verificables, sin afirmaciones inventadas." },
      { title: "Multilingüe y rendimiento", text: "Emparejamiento de idiomas con hreflang; páginas rápidas y estables diseñadas en torno a las Core Web Vitals." },
    ],
  },
  steps: {
    eyebrow: "Proceso", title: "De la auditoría a la mejora continua.",
    items: [
      { title: "Auditoría", text: "Revisamos su configuración técnica, la estructura de sus contenidos y su visibilidad actual." },
      { title: "Estrategia y arquitectura de contenidos", text: "Definimos las preguntas objetivo, la jerarquía de páginas y las prioridades." },
      { title: "Implementación técnica", text: "Implementamos mapas del sitio, datos estructurados, llms.txt, hreflang y mejoras de rendimiento." },
      { title: "Edición de contenidos", text: "Reescribimos los textos con definiciones claras, encabezados formulados como preguntas y respuestas breves." },
      { title: "Medición y mejora", text: "Seguimos avanzando con los datos de la consola de búsqueda y revisiones periódicas." },
    ],
  },
  band: {
    eyebrow: "En la práctica", title: "Este sitio se construyó de la misma manera.",
    lead: "arvo-os.com se construyó con datos estructurados, llms.txt, hreflang y contenidos formulados como preguntas.",
    items: ["JSON-LD de schema.org en cada página", "llms.txt y llms-full.txt", "hreflang entre seis versiones de idioma", "Páginas que empiezan con una definición, además de preguntas frecuentes breves"],
  },
  note: "Los buscadores y los servicios de IA deciden con sus propios algoritmos; no se promete ningún posicionamiento, tráfico ni cita concretos.",
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre SEO y GEO", items: [
    { q: "¿Qué es el GEO?", a: "El GEO (optimización para motores generativos) es el trabajo de lograr que los motores de respuesta con IA, como ChatGPT, Perplexity y Google AI Overviews, entiendan correctamente un contenido y puedan citarlo como fuente." },
    { q: "¿Qué diferencia hay entre SEO y GEO?", a: "El SEO se centra en la indexación y la visibilidad en los resultados de búsqueda; el GEO, en una información precisa y citable en las respuestas de IA. Ambos se apoyan en la misma base técnica y de contenidos sólida." },
    { q: "¿Qué es llms.txt?", a: "Un archivo de texto plano publicado en la raíz del sitio que ofrece a los asistentes de IA un breve resumen del sitio y de sus páginas clave." },
    { q: "¿Garantizan posiciones?", a: "No. No se promete ningún posicionamiento, tráfico ni cita concretos; construimos la base técnica y la estructura de contenidos adecuadas." },
    { q: "¿Puede aplicarse a mi sitio actual?", a: "Sí. Empezamos con una auditoría; las mejoras técnicas y de contenido suelen poder aplicarse a un sitio existente." },
  ] },
  cta: { title: "Hagamos que le encuentren cuando le buscan y le expliquen cuando preguntan.", actions: [talk, { label: "Diseño web", href: R("web-design"), variant: "ghost" }] },
  serviceName: "Contenido SEO y GEO",
};
