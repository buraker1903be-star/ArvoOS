// İspanyolca: home-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { HomeContent } from "../home";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;

export const HOME_ES: HomeContent = {
  meta: {
    title: "Arvo | ArvoOS, ArvoLab y ArvoBook — mejores sistemas para un mejor trabajo",
    description: "Arvo desarrolla ArvoOS para empresas, ArvoLab para investigadores y ArvoBook para salones, y ofrece servicios de diseño web y de comercio electrónico, SEO y GEO, y software a medida.",
  },
  hero: {
    eyebrow: "La familia de productos Arvo",
    title: "Mejores sistemas", subtitle: "para un mejor trabajo.",
    lead: "Arvo es una marca de software que desarrolla ArvoOS para empresas, ArvoLab para investigadores y ArvoBook para salones. Convierte el trabajo complejo en experiencias serenas, potentes y conectadas.",
    actions: [
      { label: "Solicitar una demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Descubrir los productos", href: "#productos", variant: "ghost" },
    ],
    familyLabel: "Productos Arvo",
  },
  statement: ["La complejidad se queda en segundo plano.", "Lo que queda es el avance.", "Todos los productos Arvo siguen un mismo principio:", "incluso el proceso más exigente debe sentirse natural."],
  products: {
    eyebrow: "La familia de productos",
    title: "Potentes hoy. Preparados para mañana.",
    lead: "Tres productos, cada uno experto en su ámbito. Juntos, un ecosistema que abarca su forma de trabajar.",
    os: {
      label: "Sistema operativo empresarial", title: "Toda su empresa. Un solo flujo.",
      text: "Del CRM y las ventas a los contratos con firma electrónica, de las operaciones a las finanzas, los recursos humanos y los informes: cada paso conectado en un único sistema.",
      chips: ["CRM y ventas", "Propuestas y firma electrónica", "Operaciones", "Portal del cliente", "Finanzas", "RR. HH. e informes"],
      cta: { label: "Descubrir ArvoOS", href: R("arvoos"), variant: "gold" },
      signIn: { label: "Iniciar sesión", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    },
    lab: {
      label: "Espacio de trabajo para la investigación", title: "Un espacio de trabajo más sólido para investigar.",
      text: "De la literatura a la redacción académica, de la revisión de normas al análisis: los pasos esenciales de la investigación en un espacio de trabajo sereno.",
      chips: ["Literatura y citas", "Redacción académica", "Revisión de normas", "Análisis"],
      cta: { label: "Descubrir ArvoLab", href: R("arvolab"), variant: "primary" },
      signIn: { label: "Iniciar sesión", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    },
    book: {
      label: "Gestión de citas para salones", title: "Libere el teléfono de la agenda de citas.",
      text: "Los clientes eligen ellos mismos el servicio, el profesional y la hora, y la reserva aparece al instante en su calendario. Calendarios por profesional, horarios de trabajo y ausencias, sin reservas duplicadas.",
      chips: ["Página de reservas online", "Calendario del personal", "Horarios y ausencias", "Fichas de clientes"],
      cta: { label: "Descubrir ArvoBook", href: R("randevu"), variant: "gold" },
      signIn: { label: "Iniciar sesión", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    },
  },
  band: {
    words: ["CRM", "Propuestas", "Firma electrónica", "Operaciones", "Portal del cliente", "Finanzas", "Personas", "Informes"],
    caption: "Un solo núcleo. Trece áreas funcionales conectadas.",
  },
  story: {
    eyebrow: "ArvoOS",
    title: "De la solicitud al cobro. Un solo flujo.",
    lead: "Los datos que se introducen una vez recorren solos cada paso. Nadie escribe lo mismo dos veces.",
    cta: { label: "Ver los módulos", href: R("arvoos-modules"), variant: "primary" },
    steps: [
      { title: "Solicitud", text: "La solicitud entra en el embudo del CRM; el historial del cliente aparece automáticamente y se asigna un comercial." },
      { title: "Propuesta", text: "Una propuesta con opciones de IVA y plan de pagos se comparte por WhatsApp o correo electrónico; el cliente la acepta online con un solo clic." },
      { title: "Firma electrónica", text: "La propuesta aceptada se convierte en contrato en un solo paso; el cliente firma con una firma manuscrita. El contenido queda bloqueado con un sello de tiempo y un hash de verificación." },
      { title: "Flujo de trabajo", text: "La firma inicia automáticamente el flujo de trabajo: tareas, responsables, plazos, un tablero de etapas y un calendario." },
      { title: "Portal de seguimiento", text: "Con un código de seguimiento, el cliente sigue el avance y los documentos en una página con su marca, y escribe a su equipo." },
      { title: "Pago online", text: "Los plazos se cobran mediante enlaces de pago online; los entregables permanecen bloqueados hasta el pago." },
      { title: "Informes", text: "Embudo de ventas, el paso más débil y la rentabilidad real de cada trabajo, en una sola pantalla." },
    ],
  },
  eco: {
    eyebrow: "Ecosistema",
    title: "Tres productos. Un ecosistema.",
    lead: "ArvoOS, ArvoLab y ArvoBook son aplicaciones web independientes, cada una en su propio subdominio de arvo-os.com, creadas por el mismo equipo con un mismo estándar de marca y de calidad.",
    roles: ["Operaciones", "Investigación", "Salones"],
    principles: [
      { title: "Un espacio propio", text: "Cada organización, equipo o salón trabaja en su propio espacio de trabajo." },
      { title: "Un mismo lenguaje de diseño", text: "La misma interfaz serena y el mismo cuidado, en cada producto." },
      { title: "Productos que crecen con usted", text: "A medida que crece su organización, la familia de productos crece con ella." },
    ],
  },
  values: {
    eyebrow: "Nuestros principios",
    title: "Cómo diseñamos.",
    items: [
      { title: "Simple.", text: "Nada innecesario. Todo lo que necesita, justo donde debe estar." },
      { title: "Potente.", text: "Bases fiables, controladas y escalables para el trabajo crítico." },
      { title: "Integral.", text: "Una forma de trabajar sin fisuras entre productos, equipos y datos." },
    ],
  },
  services: {
    eyebrow: "Servicios",
    title: "El equipo detrás de nuestros productos también trabaja para usted.",
    lead: "De los sitios web al software a medida, llevamos su marca y sus procesos a su forma digital más sólida.",
    items: [
      { tag: "Diseño y desarrollo", title: "Diseño web", text: "Estrategia, arquitectura de contenidos, diseño UX/UI, desarrollo y lanzamiento en un solo proceso.", href: R("web-design") },
      { tag: "Visibilidad", title: "SEO y GEO", text: "Bases técnicas y de contenido que los buscadores y los motores de respuesta con IA entienden y pueden citar.", href: R("seo-geo") },
      { tag: "Software", title: "Software a medida", text: "Paneles, portales y software de flujos de trabajo a medida; integraciones y automatización.", href: R("custom-software") },
    ],
    more: "Más información",
    cta: { label: "Todos los servicios", href: R("services"), variant: "ghost" },
    all: { title: "Y mucho más", text: "Servicios digitales integrales, de la estrategia al lanzamiento.", items: ["Diseño de procesos y experiencias", "Sistemas digitales corporativos", "Desarrollo continuo"] },
  },
  refs: { eyebrow: "Referencias", title: "Marcas con las que construimos.", lead: "Una familia de marcas que comparten el mismo estándar de calidad y crean valor juntas.", culture: "Visitar el sitio web", akademik: "Visitar el sitio web" },
  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "Preguntas sobre Arvo",
    items: [
      { q: "¿Qué es Arvo?", a: `Arvo es la marca de software de ${COMPANY.legalName}. Desarrolla ArvoOS para empresas, ArvoLab para investigadores y ArvoBook para salones, y ofrece además servicios de diseño web y de comercio electrónico y de software a medida.` },
      { q: "¿Qué diferencia hay entre ArvoOS, ArvoLab y ArvoBook?", a: "ArvoOS gestiona las operaciones de una empresa, de la solicitud al cobro. ArvoLab apoya la investigación y la redacción académicas. ArvoBook gestiona la agenda de citas de un salón: los clientes reservan por sí mismos y el calendario se organiza por profesional." },
      { q: "¿Dónde inicio sesión en los productos Arvo?", a: `ArvoOS funciona en ${PRODUCT_APPS.arvoos.host}, ArvoLab en ${PRODUCT_APPS.arvolab.host} y ArvoBook en ${PRODUCT_APPS.randevu.host}. Las tres son aplicaciones web que se usan en el navegador.` },
      { q: "¿Cuánto cuesta ArvoOS?", a: `Los precios de lista mensuales y anuales están publicados en ${ROUTES.pricing.es}; el precio es por organización, no por usuario. Para Enterprise, la tarifa se define junto con cada organización.` },
      { q: "¿Cómo solicito una demo?", a: `Rellene el formulario de la página de contacto o escriba a ${COMPANY.email}; su solicitud llegará al equipo del producto correspondiente.` },
    ],
  },
  cta: {
    eyebrow: "Una demo para su organización",
    title: "Construyamos juntos los sistemas del mañana.",
    lead: "Permítanos mostrarle cómo funcionaría ArvoOS, ArvoLab o ArvoBook en su caso.",
    actions: [
      { label: "Solicitar una demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Conózcanos", href: R("about"), variant: "ghost" },
    ],
    note: "o escríbanos directamente:",
  },
};
