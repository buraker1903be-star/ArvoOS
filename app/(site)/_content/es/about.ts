// İspanyolca: about-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;

export const ABOUT_ES: SubContent = {
  id: "about",
  meta: { title: "Sobre nosotros", description: `Arvo es la marca de software de ${COMPANY.legalName}. Desarrolla ArvoOS, ArvoLab y ArvoBook, y ofrece servicios de diseño web y de comercio electrónico y de software a medida.` },
  hero: {
    eyebrow: "Sobre nosotros", title: "Hacemos que el trabajo complejo", subtitle: "sea simple.",
    lead: `Arvo es la marca de software de ${COMPANY.legalName}, con sede en Estambul. Diseña formas de trabajar digitales, potentes y a la vez serenas, para organizaciones, investigadores y salones.`,
    actions: [{ label: "Conózcanos", href: R("contact"), variant: "gold" }],
  },
  cards: {
    eyebrow: "Una visión, un ecosistema en crecimiento", title: "En qué creemos.",
    lead: "Con ArvoOS transformamos la forma en que operan las empresas; con ArvoLab, la forma de investigar; y con ArvoBook, la forma en que los salones gestionan su agenda de citas. Todo con un mismo lenguaje de marca y un mismo estándar de calidad.",
    items: [
      { title: "Tecnología centrada en las personas", text: "Experiencias que facilitan decidir y crear, sin trasladar la complejidad al usuario." },
      { title: "Detalle sin concesiones", text: "Sistemas fiables, comprensibles y duraderos, de la interfaz a la infraestructura." },
      { title: "Productos que crecen juntos", text: "Un ecosistema escalable en el que los nuevos productos y servicios encajan con naturalidad." },
    ],
  },
  steps: {
    eyebrow: "Cómo trabajamos", title: "Rediseñamos la forma de trabajar.",
    lead: "No vemos el software solo como una herramienta, sino como un sistema que refuerza la cultura, el ritmo y la calidad de servicio de un equipo.",
    items: [
      { title: "Primero entendemos el proceso", text: "Cada proyecto empieza por conocer cómo se hace realmente el trabajo." },
      { title: "Diseñamos el conjunto", text: "Marca, experiencia y tecnología se tratan como un todo." },
      { title: "Trabajamos con transparencia y a largo plazo", text: "Decisiones visibles, alcance claro y una colaboración duradera." },
    ],
  },
  band: {
    eyebrow: "Datos de la empresa", title: "La empresa detrás de Arvo.",
    items: [COMPANY.legalName, COMPANY.address.display, COMPANY.email],
  },
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre Arvo", items: [
    { q: "¿Qué empresa está detrás de Arvo?", a: `Arvo es una marca de ${COMPANY.legalName}.` },
    { q: "¿Dónde tiene su sede Arvo?", a: `${COMPANY.address.display}, Turquía.` },
    { q: "¿Qué diferencia hay entre Arvo y ArvoOS?", a: "Arvo es la marca (y arvo-os.com, su sitio web); ArvoOS es uno de sus productos. Los otros son ArvoLab y ArvoBook." },
    { q: "¿Cómo contacto con Arvo?", a: `Utilice el formulario de la página de contacto o escriba a ${COMPANY.email}.` },
  ] },
  cta: { title: "Construyamos juntos un sistema mejor.", actions: [{ label: "Contactar", href: R("contact"), variant: "gold" }, { label: "Productos", href: R("arvoos"), variant: "ghost" }] },
  org: true,
};
