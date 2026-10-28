// İspanyolca: services-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;
const talk = { label: "Hablemos de su proyecto", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const SERVICES_ES: SubContent = {
  id: "services",
  meta: { title: "Servicios", description: "Servicios de ArvoOS: diseño y desarrollo web, contenido SEO y GEO, software a medida, diseño de procesos y experiencias, sistemas digitales corporativos y desarrollo continuo." },
  hero: {
    eyebrow: "Servicios", title: "De la marca al sistema.", subtitle: "Digital de principio a fin.",
    lead: "ArvoOS diseña y desarrolla productos digitales que se ven bien, funcionan bien y están preparados para crecer: del diseño web y el SEO y GEO al software a medida y el desarrollo continuo, de la estrategia al lanzamiento.",
    actions: [talk],
  },
  cards: {
    eyebrow: "Especialidades", title: "Experiencia adaptada a sus necesidades.",
    lead: "En lugar de plantillas, construimos en torno a los objetivos, los usuarios y las operaciones de su organización.",
    items: [
      { title: "Diseño y desarrollo web", text: "Estrategia, diseño, desarrollo y lanzamiento que convierten su marca en una experiencia digital de primer nivel.", href: R("web-design"), size: "hero", visual: "web" },
      { title: "Contenido SEO y GEO", text: "Bases técnicas y de contenido que los buscadores y los motores de respuesta con IA entienden y pueden citar.", href: R("seo-geo"), size: "wide", visual: "seo" },
      { title: "Software a medida", text: "Paneles, portales y software de flujos de trabajo diseñados en torno a cómo trabaja realmente su organización.", href: R("custom-software"), size: "wide", visual: "software" },
      { title: "Diseño de procesos y experiencias", text: "Analizamos operaciones dispersas y las convertimos en sistemas más simples, medibles y gestionables." },
      { title: "Sistemas digitales corporativos", text: "Desarrollo integral de producto para paneles, portales, áreas de cliente y pantallas de gestión." },
      { title: "Desarrollo continuo", text: "Mejoras periódicas de los productos en producción en rendimiento, seguridad, contenido y experiencia.", size: "wide" },
    ],
  },
  steps: {
    eyebrow: "Cómo trabajamos", title: "El mismo nivel de exigencia en cada proyecto.",
    lead: "Mantenemos las decisiones visibles, el alcance claro y la entrega sostenible.",
    items: [
      { title: "Descubrimiento y hoja de ruta", text: "Entendemos sus objetivos, usuarios y limitaciones, y definimos juntos el alcance." },
      { title: "Experiencia e interfaz", text: "Diseñamos los recorridos de usuario y una interfaz de primer nivel en torno a su identidad de marca." },
      { title: "Desarrollo", text: "Construimos sobre una base técnica moderna, rápida, accesible y segura." },
      { title: "Lanzamiento y mejora", text: "Tras el lanzamiento, medimos, aprendemos y seguimos mejorando el producto." },
    ],
  },
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre nuestros servicios", items: [
    { q: "¿Qué servicios ofrece ArvoOS?", a: "Diseño y desarrollo web, contenido SEO y GEO, software a medida, diseño de procesos y experiencias, sistemas digitales corporativos y desarrollo continuo." },
    { q: "¿Cómo empieza un proyecto?", a: "Nos cuenta sus necesidades mediante el formulario de contacto; aclaramos el alcance en una llamada inicial y, después, preparamos una hoja de ruta y una propuesta." },
    { q: "¿Ofrecen soporte tras el lanzamiento?", a: "Sí. Con el servicio de desarrollo continuo seguimos mejorando el rendimiento, la seguridad, el contenido y la experiencia." },
    { q: "¿Cómo se fija el precio?", a: "Cada proyecto se presupuesta según su alcance; tras la llamada inicial le enviamos una propuesta a medida." },
  ] },
  cta: { eyebrow: "Nuevo proyecto", title: "Hablemos de su próximo proyecto.", actions: [talk, { label: "Escríbanos", href: "mailto:info@arvo-os.com", variant: "ghost" }] },
  serviceName: "Servicios digitales de ArvoOS",
};

export const WEB_DESIGN_ES: SubContent = {
  id: "web-design",
  parent: { id: "services", name: "Servicios" },
  meta: { title: "Diseño y desarrollo web", description: "Diseño de sitios web y de comercio electrónico de ArvoOS: descubrimiento y estrategia, arquitectura de contenidos, diseño UX/UI, desarrollo rápido y accesible, pruebas, lanzamiento y mantenimiento en un solo proceso." },
  hero: {
    eyebrow: "Servicios · Diseño web", title: "Su marca", subtitle: "en su mejor versión digital.",
    lead: "El servicio de diseño web de ArvoOS entrega sitios web de marca de principio a fin: del descubrimiento y la estrategia a la arquitectura de contenidos, el diseño UX/UI, el desarrollo, el lanzamiento y el mantenimiento.",
    actions: [talk, { label: "Todos los servicios", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Enfoque", title: "Más que diseño. Un sistema completo.",
    lead: "No tratamos su sitio como un escaparate, sino como un producto vivo que genera confianza, transmite la información adecuada y sirve a sus objetivos de negocio.",
    items: [
      { title: "Una marca distintiva y coherente", text: "Color, tipografía, lenguaje visual y tono de voz se unen en una identidad de primer nivel." },
      { title: "Una experiencia clara y persuasiva", text: "Recorridos fluidos que presentan mensajes sólidos en el orden adecuado." },
      { title: "Tecnología rápida y escalable", text: "Bases pensadas primero para el móvil, preparadas para los buscadores y las respuestas de IA, que crecen con facilidad." },
      { title: "Tienda online con su propio panel", text: "Diseñamos y desarrollamos su tienda online; el panel para gestionar sus productos y pedidos se entrega junto con el sitio." },
    ],
  },
  steps: {
    eyebrow: "Proceso", title: "De la idea al lanzamiento, en seis pasos claros.",
    items: [
      { title: "Descubrimiento y estrategia", text: "Definimos su marca, su público, su competencia y los objetivos de negocio del sitio." },
      { title: "Arquitectura de contenidos", text: "Planificamos las páginas, la jerarquía de mensajes y los recorridos de usuario en torno a los objetivos de conversión." },
      { title: "Diseño UX/UI", text: "Creamos un diseño original que traslada su identidad a cualquier tamaño de pantalla." },
      { title: "Desarrollo", text: "Construimos una base moderna, rápida, accesible, preparada para el SEO y fácil de gestionar." },
      { title: "Pruebas y lanzamiento", text: "Lanzamos tras revisar dispositivos, navegadores, rendimiento y contenidos." },
      { title: "Mantenimiento y crecimiento", text: "Seguimos aportando valor con nuevos contenidos, funciones y mejoras." },
    ],
  },
  band: {
    eyebrow: "Entregables", title: "Lo que tendrá al final.",
    items: ["Estrategia y arquitectura de contenidos", "Diseño de interfaz para cualquier tamaño de pantalla", "Código rápido, accesible y preparado para el SEO", "Datos estructurados y configuración multilingüe (cuando sea necesario)", "Panel de gestión de productos y pedidos para tiendas online", "Lanzamiento, pruebas y traspaso", "Mantenimiento opcional tras el lanzamiento"],
  },
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre el diseño web", items: [
    { q: "¿Qué pasos incluye un proyecto de sitio web?", a: "Descubrimiento y estrategia, arquitectura de contenidos, diseño UX/UI, desarrollo, pruebas y lanzamiento, y mantenimiento y crecimiento." },
    { q: "¿Los sitios se adaptan al móvil?", a: "Sí. El diseño se concibe primero para el móvil y se prueba en distintos tamaños de pantalla." },
    { q: "¿Estará mi sitio preparado para los buscadores?", a: "Sí. Las bases técnicas de SEO forman parte del desarrollo; para un trabajo más profundo ofrecemos SEO y GEO. No se promete ningún posicionamiento concreto." },
    { q: "¿También desarrollan tiendas online?", a: "Sí. Diseñamos y desarrollamos la tienda online, y el panel para gestionar sus productos (catálogo) y pedidos se entrega junto con el sitio. El panel no se alquila aparte; forma parte del sitio." },
    { q: "¿Puedo añadir contenido tras el lanzamiento?", a: "Sí. La base está pensada para crecer con nuevas páginas, y ofrecemos soporte de mantenimiento y crecimiento." },
  ] },
  cta: { title: "Diseñemos juntos su nuevo sitio web.", actions: [talk, { label: "SEO y GEO", href: R("seo-geo"), variant: "ghost" }] },
  serviceName: "Diseño y desarrollo web",
};
