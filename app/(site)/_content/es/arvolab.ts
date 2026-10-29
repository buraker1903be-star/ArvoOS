// İspanyolca: arvolab-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;

export const ARVOLAB_ES: ProductContent = {
  id: "arvolab",
  name: "ArvoLab",
  category: "EducationalApplication",
  appUrl: PRODUCT_APPS.arvolab.url,
  featureList: ["Gestión de literatura y citas", "Redacción académica", "Revisión de normas", "Análisis cuantitativo y cualitativo", "Editor académico", "Revisión previa de originalidad"],
  meta: {
    title: "ArvoLab — Espacio de trabajo para la investigación",
    description: "ArvoLab reúne en un solo espacio de trabajo la gestión de literatura y citas, la redacción académica, la revisión de normas, el análisis cuantitativo y cualitativo, un editor académico y una revisión previa de originalidad.",
  },
  hero: {
    eyebrow: "ArvoLab · Espacio de trabajo para la investigación",
    title: "Un espacio de trabajo más sólido", subtitle: "para investigar.",
    lead: "ArvoLab es un espacio de trabajo web para la investigación que reúne en un solo lugar los pasos esenciales del trabajo académico: de la literatura a la redacción, de la revisión de documentos al análisis.",
    actions: [
      { label: "Probar gratis", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Entrar en ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Funciones",
    title: "Un proceso más claro. Un resultado más sólido.",
    lead: "Traslade herramientas y revisiones de investigación dispersas a un espacio conectado donde pueda ver su trabajo en conjunto.",
    items: [
      { title: "Literatura y citas", text: "Pegue un DOI y la referencia se completa desde Crossref y OpenAlex. APA 7, Harvard, Chicago, MLA 9, IEEE y Vancouver; las citas en el texto y la lista de referencias se escriben a la vez." },
      { title: "Redacción académica", text: "Desarrolle textos de investigación con una estructura sólida y una forma de trabajar coherente." },
      { title: "Revisión de normas", text: "Suba su normativa de tesis en PDF o como enlace: se extraen el formato de página, las secciones obligatorias, el estilo de citas y los límites, y las reglas que usted confirma se aplican en el editor. Lee normativas en inglés y turco." },
      { title: "Centro de análisis", text: "Organice los procesos de investigación cuantitativa y cualitativa en un solo espacio de trabajo." },
      { title: "Editor académico", text: "Word y PDF listos para entregar en A4 o US Letter, con índice, notas al pie y numeración de títulos. Una lista de comprobación muestra en un solo lugar lo que aún falta." },
      { title: "Revisión previa de originalidad", text: "Revise su texto antes de entregarlo para detectar antes posibles riesgos." },
    ],
  },
  flow: {
    eyebrow: "El flujo de investigación",
    title: "Con usted en cada etapa de la investigación.",
    lead: "Una forma de trabajar integral que mantiene al investigador centrado en la calidad del resultado, no en las herramientas.",
    steps: [
      { title: "Reunir fuentes", text: "Organice su literatura y sus citas en un solo lugar." },
      { title: "Redactar", text: "Desarrolle su texto con una estructura coherente e incorpore los pasos de edición al flujo." },
      { title: "Revisar", text: "Realice la revisión de normas y la revisión previa de originalidad antes de entregar." },
      { title: "Analizar", text: "Realice análisis cuantitativos y cualitativos en el mismo espacio de trabajo." },
    ],
  },
  audience: {
    eyebrow: "¿Para quién es?",
    title: "Pensado para el investigador individual.",
    lead: "ArvoLab está diseñado para adaptarse a distintas escalas de trabajo académico.",
    items: [
      { title: "Investigadores individuales", text: "Para tesis, artículos y proyectos gestionados en un espacio de trabajo sereno." },
      { title: "Estudiantes de posgrado", text: "Para llevar una tesis de máster o doctorado de principio a fin con una sola suscripción." },
      { title: "Universidades", text: "Las licencias institucionales se ofrecen solo a universidades e instituciones educativas, previa solicitud." },
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "Sobre ArvoLab",
    items: [
      { q: "¿Qué es ArvoLab?", a: "ArvoLab es el espacio de trabajo para la investigación de la marca ArvoOS, con gestión de literatura y citas, redacción académica, revisión de normas, análisis cuantitativo y cualitativo, edición académica y una revisión previa de originalidad." },
      { q: "¿Para quién es ArvoLab?", a: "Para investigadores individuales. Las licencias institucionales se ofrecen solo a universidades e instituciones educativas, previa solicitud." },
      { q: "¿Cómo obtengo acceso a ArvoLab?", a: "Cree una cuenta en la página de registro y empiece al momento con una prueba gratuita; después, la suscripción se paga con tarjeta. Para una licencia institucional, use el formulario de contacto o escriba a info@arvo-os.com." },
      { q: "¿Sustituye la revisión previa de originalidad a un informe oficial?", a: "No. Es una revisión previa que le ayuda a detectar riesgos antes de la entrega; su institución puede seguir exigiendo su propio informe oficial de originalidad." },
      { q: "¿Qué diferencia hay entre ArvoLab y ArvoOS?", a: "ArvoOS gestiona las operaciones de una empresa; ArvoLab es un espacio de trabajo que apoya la investigación y la redacción académicas." },
    ],
  },
  cta: {
    eyebrow: "Acceso",
    title: "Pruebe ArvoLab hoy.",
    lead: "Cree su cuenta y empiece con una prueba gratuita; pago con tarjeta, renovación automática opcional. Para una licencia institucional, contáctenos.",
    actions: [
      { label: "Probar gratis", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "Entrar en ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
      { label: "Licencia institucional", href: `${R("contact")}?interest=arvolab`, variant: "ghost" },
    ],
  },
};
