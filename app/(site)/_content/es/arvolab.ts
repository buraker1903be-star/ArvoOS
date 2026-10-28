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
      { label: "Solicitar acceso", href: `${R("contact")}?interest=arvolab`, variant: "gold" },
      { label: "Entrar en ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Funciones",
    title: "Un proceso más claro. Un resultado más sólido.",
    lead: "Traslade herramientas y revisiones de investigación dispersas a un espacio conectado donde pueda ver su trabajo en conjunto.",
    items: [
      { title: "Literatura y citas", text: "Organice sus fuentes y gestione de forma sistemática su flujo de literatura y citas." },
      { title: "Redacción académica", text: "Desarrolle textos de investigación con una estructura sólida y una forma de trabajar coherente." },
      { title: "Revisión de normas", text: "Compare más rápido la estructura del documento y los requisitos de formato con las normas." },
      { title: "Centro de análisis", text: "Organice los procesos de investigación cuantitativa y cualitativa en un solo espacio de trabajo." },
      { title: "Editor académico", text: "Integre los pasos de revisión y mejora del texto en su flujo de investigación." },
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
    title: "Desde investigadores individuales hasta instituciones.",
    lead: "ArvoLab está diseñado para adaptarse a distintas escalas de trabajo académico.",
    items: [
      { title: "Investigadores individuales", text: "Para tesis, artículos y proyectos gestionados en un espacio de trabajo sereno." },
      { title: "Equipos académicos", text: "Para equipos que mantienen fuentes, textos y revisiones en un orden compartido." },
      { title: "Instituciones", text: "Para instituciones que ofrecen un entorno de investigación completo." },
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "Sobre ArvoLab",
    items: [
      { q: "¿Qué es ArvoLab?", a: "ArvoLab es el espacio de trabajo para la investigación de Arvo, con gestión de literatura y citas, redacción académica, revisión de normas, análisis cuantitativo y cualitativo, edición académica y una revisión previa de originalidad." },
      { q: "¿Para quién es ArvoLab?", a: "Para investigadores individuales, equipos académicos e instituciones." },
      { q: "¿Cómo obtengo acceso a ArvoLab?", a: `Solicite acceso mediante el formulario de contacto o en info@arvo-os.com. Inicie sesión en ${PRODUCT_APPS.arvolab.url}.` },
      { q: "¿Sustituye la revisión previa de originalidad a un informe oficial?", a: "No. Es una revisión previa que le ayuda a detectar riesgos antes de la entrega; su institución puede seguir exigiendo su propio informe oficial de originalidad." },
      { q: "¿Qué diferencia hay entre ArvoLab y ArvoOS?", a: "ArvoOS gestiona las operaciones de una empresa; ArvoLab es un espacio de trabajo que apoya la investigación y la redacción académicas." },
    ],
  },
  cta: {
    eyebrow: "Acceso",
    title: "Contacte con nosotros para acceder a ArvoLab.",
    lead: "Tanto para uso individual como institucional, nuestro equipo le orientará.",
    actions: [
      { label: "Solicitar acceso", href: `${R("contact")}?interest=arvolab`, variant: "gold" },
      { label: "Entrar en ArvoLab", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
};
