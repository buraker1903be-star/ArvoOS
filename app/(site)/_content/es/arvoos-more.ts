// İspanyolca: arvoos-more-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;
const demo = { label: "Solicitar una demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" as const };
const parent = { id: "arvoos" as const, name: "ArvoOS" };

export const INDUSTRIES_ES: SubContent = {
  id: "arvoos-industries", parent,
  meta: { title: "ArvoOS por sectores", description: "ArvoOS se configura —módulos, pantallas y permisos— para centros sanitarios, centros educativos, consultoras y empresas de servicios, y empresas con varias sedes." },
  hero: {
    eyebrow: "ArvoOS · Sectores", title: "No es un software genérico.", subtitle: "Es un sistema a su medida.",
    lead: "Los módulos, las pantallas y los permisos de ArvoOS se configuran en torno a cómo trabajan realmente los centros sanitarios, los centros educativos, las consultoras y las empresas con varias sedes.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Adaptado a su sector", title: "Un solo núcleo. Su propio orden.", cols: "two",
    items: [
      { title: "Centros sanitarios", text: "Gestione clientes, citas, equipos y cobros como un todo.", items: ["Solicitudes de clientes y calendario de citas", "Estructura de equipos, roles y permisos", "Planes de plazos y seguimiento de cobros"] },
      { title: "Centros educativos", text: "Conecte las operaciones educativas, del aspirante a la matrícula, del plan de pagos a la documentación.", items: ["Solicitudes de aspirantes y matrícula", "Propuestas, contratos y firma electrónica", "Planes de pago y cobros"] },
      { title: "Consultoría y servicios", text: "Convierta las solicitudes de los clientes en proyectos planificados, medibles y rentables.", items: ["Gestión de CRM y propuestas", "Flujos de proyecto y entrega, portal del cliente", "Contratos, finanzas y rentabilidad"] },
      { title: "Empresas con varias sedes", text: "Mantenga estándares centrales mientras cada equipo gestiona su propia operación con más rapidez.", items: ["Una visión compartida e informes desde la central", "Permisos por rol y por módulo", "Acceso por registro"] },
    ],
  },
  note: "¿No encuentra su sector? Hablemos: ArvoOS se adapta a cualquier empresa de servicios con un ciclo de vender, entregar y cobrar.",
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre los sectores", items: [
    { q: "¿Para qué sectores está pensado ArvoOS?", a: "Centros sanitarios, centros educativos, consultoras y empresas de servicios, y empresas con varias sedes; en general, empresas de servicios que venden, entregan y cobran entre varias personas." },
    { q: "¿Cómo se adapta ArvoOS a nuestro sector?", a: "Los módulos, las pantallas y los permisos se configuran según cómo trabaja su organización; las plantillas de contrato y los flujos de trabajo se preparan en torno a sus procesos." },
    { q: "¿Qué implica una configuración específica para el sector?", a: "Empezamos con un análisis de necesidades y, a continuación, preparamos una demo personalizada y un plan de transición." },
  ] },
  cta: { title: "Adaptemos ArvoOS a su sector.", actions: [demo, { label: "Soluciones", href: R("arvoos-solutions"), variant: "ghost" }] },
};

export const SOLUTIONS_ES: SubContent = {
  id: "arvoos-solutions", parent,
  meta: { title: "Soluciones de ArvoOS", description: "ArvoOS cierra en un solo flujo las brechas entre las ventas y la gestión de clientes, las operaciones, el control financiero y la gobernanza corporativa." },
  hero: {
    eyebrow: "ArvoOS · Soluciones", title: "Cada cuello de botella,", subtitle: "una respuesta conectada.",
    lead: "ArvoOS no se limita a guardar registros: cierra las brechas entre ventas, operaciones y finanzas para que el trabajo adecuado llegue a la persona adecuada en el momento adecuado.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Necesidades del negocio", title: "Resuélvalo donde empieza.", cols: "two",
    items: [
      { title: "Ventas y gestión de clientes", text: "Siga cada oportunidad y agilice propuestas y contratos.", items: ["Historial centralizado del cliente", "Enlaces de aceptación online y firma electrónica", "Embudo por etapas y motivos de pérdida"] },
      { title: "Gestión de operaciones", text: "Convierta las ventas cerradas en un flujo estándar que sus equipos puedan ejecutar.", items: ["Flujo de trabajo que se inicia con la firma", "Seguimiento de responsables, plazos y avance", "Portal de seguimiento para clientes"] },
      { title: "Control financiero", text: "Vea ingresos, cobros y costes junto al trabajo.", items: ["Conexión entre ventas y finanzas", "Vista de plazos y cobros", "Rentabilidad real por trabajo"] },
      { title: "Gobernanza corporativa", text: "Ajuste permisos, registros e informes a su estructura en crecimiento.", items: ["Matriz de permisos rol × módulo", "Aislamiento entre organizaciones", "Historial de actividad auditable"] },
    ],
  },
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre las soluciones", items: [
    { q: "¿Qué problemas resuelve ArvoOS?", a: "Las brechas entre ventas, operaciones y finanzas: volver a introducir los mismos datos, propuestas sin seguimiento, responsabilidades invisibles y pagos desconectados del trabajo." },
    { q: "¿Cómo se conectan las ventas y las operaciones?", a: "Un contrato firmado por el cliente inicia automáticamente el flujo de trabajo, con las tareas, los responsables y los plazos ya listos." },
    { q: "¿Cómo veo la rentabilidad real?", a: "Se añaden partidas de coste a cada trabajo; los informes muestran la rentabilidad real por trabajo junto a las ventas y los cobros." },
  ] },
  cta: { title: "Cuéntenos su cuello de botella. Construiremos el flujo juntos.", actions: [demo, { label: "Módulos", href: R("arvoos-modules"), variant: "ghost" }] },
};

export const PLANS_ES: SubContent = {
  id: "arvoos-plans", parent,
  meta: { title: "Planes de ArvoOS", description: "Los planes de ArvoOS se definen con cada organización en función de los módulos, el número de usuarios, la estructura de sedes y los flujos de trabajo a medida que necesita." },
  hero: {
    eyebrow: "ArvoOS · Planes", title: "Empiece con lo que necesita.", subtitle: "Crezca a medida que avanza.",
    lead: "Los planes de ArvoOS se definen junto con su organización, según los módulos que necesita, el número de usuarios, la estructura de sedes y los flujos de trabajo a medida.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Planes flexibles", title: "Tres puntos de partida.", cols: "three",
    items: [
      { title: "Starter", text: "Para equipos que quieren ordenar sus procesos esenciales de clientes, trabajos y finanzas.", items: ["Módulos esenciales seleccionados", "Estructura de roles estándar", "Soporte de configuración y puesta en marcha"] },
      { title: "Business", text: "Para organizaciones que gestionan varios equipos o sedes con procesos conectados.", items: ["Amplia selección de módulos", "Informes avanzados", "Gestión de equipos y permisos"] },
      { title: "Custom", text: "Para organizaciones que quieren ArvoOS con su propia forma de trabajar y su propia identidad.", items: ["Flujos de trabajo a medida", "Su propio dominio", "Experiencia de cliente con su marca"] },
    ],
  },
  steps: {
    eyebrow: "Cómo se define", title: "Construyamos juntos el plan adecuado.",
    lead: "Invierta en resultados de negocio, no en funciones que no necesita.",
    items: [
      { title: "Análisis de necesidades", text: "Juntos analizamos sus procesos, la estructura de su equipo y los módulos prioritarios." },
      { title: "Demo personalizada del producto", text: "Le mostramos ArvoOS con sus propios flujos de trabajo." },
      { title: "Plan de transición escalable", text: "Planificamos paso a paso la configuración, la migración de datos y la incorporación del equipo." },
    ],
  },
  note: `Los precios de lista mensuales y anuales de Starter y Business están publicados en ${R("pricing")}. Para Enterprise, se prepara una propuesta una vez definido el alcance.`,
  faq: { eyebrow: "Preguntas frecuentes", title: "Sobre los planes", items: [
    { q: "¿Cuánto cuesta ArvoOS?", a: `Los precios mensuales y anuales de los planes Starter y Business están publicados en ${R("pricing")}. El precio es por organización, no por usuario. Para Enterprise, la tarifa se define con cada organización según los módulos, el número de usuarios y la estructura de sedes.` },
    { q: "¿Con qué plan debería empezar?", a: "Lo decidimos juntos tras un análisis de necesidades; la mayoría de las organizaciones empiezan con los módulos esenciales y amplían con el tiempo." },
    { q: "¿Puedo cambiar de plan más adelante?", a: "Sí. Su plan puede ampliarse a medida que cambian sus módulos, usuarios y estructura de sedes." },
    { q: "¿Podemos usar nuestro propio dominio?", a: "Sí. Se conecta un dominio propio con verificación DNS, y el inicio de sesión y las páginas de cliente con su marca funcionan en esa dirección." },
  ] },
  cta: { title: "Encontremos el plan adecuado para su organización.", actions: [demo, { label: "Precios", href: R("pricing"), variant: "ghost" }] },
};
