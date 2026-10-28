// İspanyolca: custom-software-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;
const talk = { label: "Cuéntenos qué necesita", href: `${R("contact")}?interest=services`, variant: "gold" as const };

export const CUSTOM_SOFTWARE_ES: SubContent = {
  id: "custom-software",
  parent: { id: "services", name: "Servicios" },
  meta: { title: "Software a medida", description: "Software a medida de Arvo: paneles y portales a medida, software de flujos de trabajo, integraciones y automatización, áreas de cliente y aplicaciones PWA adaptadas al móvil." },
  hero: {
    eyebrow: "Servicios · Software a medida", title: "Cuando lo estándar no basta,", subtitle: "un sistema propio.",
    lead: "El servicio de software a medida de Arvo diseña y desarrolla paneles, portales, áreas de cliente y software de flujos de trabajo en torno a cómo trabaja realmente su organización. El equipo que creó ArvoOS pone el mismo cuidado en el suyo.",
    actions: [talk, { label: "Ver ArvoOS", href: R("arvoos"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Qué desarrollamos", title: "Software con la forma de su negocio.",
    items: [
      { title: "Paneles y portales a medida", text: "Pantallas de gestión para sus equipos y áreas de autoservicio seguras para sus clientes." },
      { title: "Software de flujos de trabajo", text: "Flujos que automatizan solicitudes, aprobaciones, tareas y entregas según sus propias reglas." },
      { title: "Integraciones y automatización", text: "Flujos de datos que conectan las herramientas que usa y eliminan el trabajo repetitivo." },
      { title: "Flujos de documentos y firma", text: "Documentos con su marca, salida en PDF y pasos de aceptación electrónica." },
      { title: "PWA adaptada al móvil", text: "Aplicaciones web que se instalan en la pantalla de inicio y funcionan como aplicaciones móviles." },
      { title: "Arquitectura SaaS multiinquilino", text: "Estructuras escalables en las que cada cliente trabaja en su propio espacio, con su propia marca." },
    ],
  },
  band: {
    eyebrow: "Prueba de capacidad", title: "Nosotros creamos ArvoOS.",
    lead: "Los problemas que resolvimos en nuestra propia plataforma se convierten en experiencia lista para su proyecto.",
    items: ["Estructura multiinquilino con dominios propios verificados por DNS", "Aceptación electrónica con firma manuscrita y documentos PDF A4", "Portal del cliente con entrega de archivos condicionada al pago", "Permisos rol × módulo y seguridad a nivel de fila", "Interfaz PWA instalable, pensada primero para el móvil"],
  },
  steps: {
    eyebrow: "Proceso", title: "Del descubrimiento al desarrollo continuo.",
    items: [
      { title: "Descubrimiento", text: "Juntos analizamos sus procesos, usuarios y prioridades." },
      { title: "Arquitectura y diseño", text: "Diseñamos con usted el modelo de datos, la estructura de permisos y la interfaz." },
      { title: "Desarrollo", text: "Construimos en ciclos cortos, por partes que funcionan, y las validamos con usted." },
      { title: "Lanzamiento y puesta en marcha", text: "Lanzamos el sistema y ayudamos a su equipo a empezar a trabajar con él." },
      { title: "Desarrollo continuo", text: "Mejoramos el rendimiento, la seguridad y la experiencia a partir de los comentarios recibidos." },
    ],
  },
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre el software a medida", items: [
    { q: "¿Qué tipo de software a medida desarrolla Arvo?", a: "Paneles y portales a medida, software de flujos de trabajo, integraciones y automatización, flujos de documentos y firma, y aplicaciones PWA adaptadas al móvil." },
    { q: "¿Por qué software a medida en lugar de un producto estándar?", a: "Si sus procesos no encajan en los productos estándar, o quiere ofrecer a sus clientes una experiencia con su marca, el software a medida puede ser la mejor opción. Primero comprobamos juntos si ArvoOS ya cubre sus necesidades." },
    { q: "¿Cómo se presupuesta un proyecto?", a: "Según el alcance. Tras la llamada inicial le enviamos una hoja de ruta y una propuesta." },
    { q: "¿Ofrecen soporte tras el lanzamiento?", a: "Sí. Con el servicio de desarrollo continuo seguimos con el mantenimiento, la seguridad y las nuevas funciones." },
  ] },
  cta: { title: "Construyamos un sistema que sea suyo.", actions: [talk, { label: "Todos los servicios", href: R("services"), variant: "ghost" }] },
  serviceName: "Desarrollo de software a medida",
};
