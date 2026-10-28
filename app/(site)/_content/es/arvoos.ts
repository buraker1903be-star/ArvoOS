// İspanyolca: arvoos-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import { HOME_ES } from "./home";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;

export const ARVOOS_ES: ProductContent = {
  id: "arvoos",
  name: "ArvoOS",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.arvoos.url,
  featureList: ["CRM y embudo de ventas", "Propuestas con aceptación online", "Contratos con firma electrónica y PDF A4", "Centro de documentos", "Operaciones, tablero de etapas y calendario", "Portal de seguimiento para clientes", "Cuentas corrientes, plazos y enlaces de pago online", "RR. HH. y comisiones", "Informes y rentabilidad", "Mensajería de equipo y notificaciones", "Matriz de permisos rol × módulo", "Dominio propio y marca", "PWA instalable"],
  meta: {
    title: "ArvoOS — Sistema operativo empresarial",
    description: "ArvoOS es un sistema operativo empresarial multiinquilino que conecta en un solo flujo el CRM, las propuestas con aceptación online, los contratos con firma electrónica, las operaciones, un portal del cliente, las finanzas, los RR. HH. y los informes.",
  },
  hero: {
    eyebrow: "ArvoOS · Sistema operativo empresarial",
    title: "Toda su empresa.", subtitle: "Un solo flujo.",
    lead: "ArvoOS es un sistema operativo empresarial web y multiinquilino que gestiona empresas de servicios e instituciones en un único flujo conectado, desde la primera solicitud del cliente hasta el último cobro.",
    actions: [
      { label: "Solicitar una demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Iniciar sesión", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "¿Qué hace ArvoOS?",
    title: "Usted tiene el control. El caos queda atrás.",
    lead: "Reúna hojas de cálculo dispersas, herramientas desconectadas y responsabilidades invisibles en una forma de trabajar ordenada.",
    items: [
      { title: "Propuestas", text: "Revisiones, opciones de IVA y planes de pago; los clientes aceptan online con un solo clic.", size: "hero", visual: "s1" },
      { title: "CRM y ventas", text: "Etapas del embudo, historial automático del cliente, búsqueda instantánea de clientes y un calendario comercial." },
      { title: "Contratos con firma electrónica", text: "Plantillas, firmas manuscritas y declaraciones de consentimiento; el contenido se bloquea tras la firma, con salida en PDF A4." },
      { title: "Operaciones", text: "Tabla de trabajos, tablero de etapas, calendario, tareas y responsables. La firma inicia el flujo de trabajo automáticamente." },
      { title: "Finanzas", text: "Cuentas corrientes, planes de plazos, enlaces de pago online, facturas y rentabilidad por trabajo." },
      { title: "Portal de seguimiento para clientes", text: "Los clientes siguen el avance, los documentos y un resumen de pagos en una página con su marca, mediante un código de seguimiento.", size: "hero", alt: true, visual: "s4" },
      { title: "Recursos humanos", text: "Personal, roles, cálculo de comisiones, registros de actividad y acuerdos de confidencialidad con firma electrónica." },
      { title: "Informes", text: "Embudo de ventas con el paso más débil señalado, rentabilidad real, tendencias y motivos de pérdida." },
      { title: "Comunicación", text: "Mensajería de equipo, un centro de notificaciones, anuncios de la dirección y tickets de soporte.", size: "wide" },
    ],
  },
  flow: {
    eyebrow: "De la solicitud al cobro",
    title: "Introdúzcalo una vez. Listo en cada paso.",
    lead: HOME_ES.story.lead,
    steps: HOME_ES.story.steps,
    cta: { label: "Ver todos los módulos", href: R("arvoos-modules"), variant: "primary" },
  },
  audience: {
    eyebrow: "¿Para quién es?",
    title: "Para todo equipo que vende, entrega y cobra.",
    lead: "Empresas de servicios e instituciones que gestionan ventas, entregas y cobros entre varias personas, equipos o sedes.",
    more: "Configurado por sector",
    items: [
      { title: "Centros sanitarios", text: "Solicitudes de clientes, citas, equipos y cobros en un mismo orden.", href: R("arvoos-industries") },
      { title: "Centros educativos", text: "Del aspirante a la matrícula, del plan de pagos a la documentación.", href: R("arvoos-industries") },
      { title: "Consultoría y servicios", text: "Convierta las solicitudes en proyectos planificados, medibles y rentables.", href: R("arvoos-industries") },
      { title: "Empresas con varias sedes", text: "Mantenga estándares centrales mientras cada equipo avanza más rápido.", href: R("arvoos-industries") },
    ],
  },
  band: {
    eyebrow: "Con su marca",
    title: "Su dominio. Su marca.",
    lead: "Cada organización trabaja en su propio espacio aislado: desde la pantalla de inicio de sesión hasta el último documento, sus clientes solo ven su marca.",
    items: [
      "Dominio propio verificado por DNS",
      "Inicio de sesión y páginas de cliente con su marca",
      "Logotipo, color corporativo, sello y firma",
      "Datos legales y bancarios incorporados en propuestas y contratos",
      "Permisos rol × módulo e historial de auditoría",
      "PWA instalable que funciona como una aplicación móvil",
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "Sobre ArvoOS",
    items: [
      { q: "¿Qué es ArvoOS?", a: "ArvoOS es el sistema operativo empresarial web y multiinquilino de Arvo. Conecta en un solo flujo el CRM y las ventas, las propuestas, los contratos con firma electrónica, las operaciones, un portal de seguimiento para clientes, las finanzas, los RR. HH., los informes y la comunicación del equipo." },
      { q: "¿Cómo lleva ArvoOS un trabajo de la solicitud al cobro?", a: "Una solicitud entra en el embudo y se convierte en propuesta; el cliente la acepta online y firma el contrato electrónicamente. La firma inicia el flujo de trabajo, el cliente sigue el avance en el portal y los plazos se cobran mediante enlaces de pago online." },
      { q: "¿Admite ArvoOS la firma electrónica?", a: "Sí. Los clientes firman con una firma manuscrita y declaraciones de consentimiento; se registran la dirección IP, el sello de tiempo, el dispositivo y un hash de verificación, y el contenido se bloquea tras la firma." },
      { q: "¿Puede funcionar ArvoOS en nuestro propio dominio y con nuestra marca?", a: "Sí. Puede conectar un dominio propio verificado por DNS y usar su logotipo, color corporativo, sello y firma en las páginas de inicio de sesión, las páginas de cliente, las propuestas y los contratos." },
      { q: "¿Funciona ArvoOS en el móvil?", a: "Sí. Puede instalarse como PWA y funciona como una aplicación móvil, con barra de pestañas inferior y paneles deslizantes." },
      { q: "¿Cuánto cuesta ArvoOS?", a: `Los precios mensuales y anuales de los planes Starter y Business están publicados en ${ROUTES.pricing.es}. El precio es por organización, no por usuario. Para Enterprise, la tarifa se define con cada organización según los módulos, el número de usuarios y la estructura de sedes.` },
    ],
  },
  cta: {
    eyebrow: "Una demo para su organización",
    title: "Diseñemos cómo funcionará ArvoOS en su empresa.",
    lead: "Cuéntenos qué necesita: le mostraremos ArvoOS con sus propios flujos de trabajo.",
    actions: [
      { label: "Solicitar una demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Ver planes", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
