// İspanyolca: pricing-en.ts'in çevirisi. RAKAM YOK (tutarlar lib/site/pricing.ts'te); plan kodları ve sırası İngilizceyle birebir.
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { PricingContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;
const demo = { label: "Solicitar una demo", href: `${R("contact")}?interest=pricing`, variant: "gold" as const };

export const PRICING_ES: PricingContent = {
  id: "pricing",
  meta: {
    title: "Precios",
    description:
      "Precios de suscripción de ArvoOS, ArvoCal y ArvoLab: precios mensuales y anuales, qué incluye cada plan, complementos y condiciones de suscripción. Precio por organización, no por usuario.",
  },
  hero: {
    eyebrow: "Precios",
    title: "Para los productos empresariales, por organización,",
    subtitle: "no por puesto.",
    lead: "ArvoOS y ArvoCal tienen un precio por organización: su factura no se multiplica a medida que crece el equipo, y cada tarjeta indica cuántos usuarios incluye. ArvoLab es la excepción: su valor está en la persona que escribe, no en el flujo de la organización, por eso su precio es por investigador.",
    actions: [demo, { label: "Condiciones de suscripción", href: "#kosullar", variant: "ghost" }],
  },
  cycle: {
    monthly: "Mensual",
    yearly: "Anual",
    badge: "2 meses gratis",
    perMonth: "/mes",
    perYear: "/año",
    perMonthUser: "/usuario/mes",
    perYearUser: "/usuario/año",
    quote: "A consultar",
    quoteAction: "Solicitar presupuesto",
  },
  vatNote:
    "Todos los precios están en euros y no incluyen el IVA; los clientes en Turquía pagan en liras turcas según los precios de la página en turco, que incluyen el IVA. Con la opción anual paga 10 meses y disfruta de 12; el importe se factura una sola vez al inicio del periodo.",

  groups: [
    {
      product: "arvoos",
      tag: "Sistema operativo empresarial",
      lead: "CRM, propuestas, contratos con firma electrónica, operaciones, finanzas, RR. HH. e informes en un solo flujo. Los usuarios están incluidos en el plan.",
      linkLabel: "Descubrir ArvoOS",
      cards: [
        {
          code: "arvoos-baslangic",
          text: "Para equipos que quieren ordenar en un solo lugar el trabajo de clientes, entregas y finanzas.",
          items: ["3 usuarios incluidos", "Una sola sede", "CRM y embudo de ventas", "Propuestas y contratos con firma electrónica", "Operaciones y flujo de tareas", "Finanzas y seguimiento de cobros", "Soporte por correo electrónico"],
        },
        {
          code: "arvoos-kurumsal",
          text: "Para organizaciones que gestionan varios equipos o sedes con procesos conectados.",
          items: ["15 usuarios incluidos", "Sedes ilimitadas", "Todos los módulos", "Portal de seguimiento para clientes", "Matriz de permisos rol × módulo", "Informes avanzados", "Soporte prioritario"],
        },
        {
          code: "arvoos-ozel",
          text: "Para organizaciones que quieren ArvoOS con su propio modelo operativo y su propia marca.",
          items: ["Usuarios ilimitados", "Dominio propio", "Flujos de trabajo a medida", "Experiencia de cliente con su marca", "Migración de datos y formación del equipo", "Consultoría de implantación"],
        },
      ],
    },
    {
      product: "randevu",
      tag: "Gestión de citas",
      lead: "Página de reservas online, calendario y fichas de clientes para peluquerías y salones de belleza. Los horarios de trabajo se definen en la hora local de Turquía.",
      linkLabel: "Descubrir ArvoCal",
      cards: [
        {
          code: "randevu-tek",
          text: "Para salones con una sola dirección que aún llevan las citas por teléfono y en libreta.",
          items: ["Una sola sede", "Hasta 5 profesionales", "Página de reservas online", "Calendario de citas", "Fichas e historial de clientes", "Soporte por correo electrónico"],
        },
        {
          code: "randevu-coklu",
          text: "Para negocios que quieren una visión central y permisos por sede.",
          items: ["Hasta 3 sedes", "Personal ilimitado", "Calendario y permisos por sede", "Informes centralizados", "Soporte prioritario"],
        },
        {
          code: "randevu-zincir",
          text: "Para cadenas de más de tres sedes que quieren su propia imagen de marca.",
          items: ["Sedes ilimitadas", "Dominio propio", "Flujos de trabajo a medida", "Implantación y formación del equipo"],
        },
      ],
    },
    {
      product: "arvolab",
      tag: "Espacio de trabajo para la investigación",
      lead: "Literatura y citas, redacción académica, revisión de normas, análisis y revisión previa de originalidad: todo el proceso de investigación en un solo espacio de trabajo, sin una herramienta y una suscripción distintas para cada paso. Precio por investigador.",
      linkLabel: "Descubrir ArvoLab",
      cards: [
        {
          code: "arvolab-arastirmaci",
          text: "Para investigadores que sacan adelante por su cuenta una tesis, un artículo o un proyecto.",
          items: ["Un solo investigador", "Gestión de literatura y citas", "Redacción académica", "Revisión de normas", "Centro de análisis (cuantitativo y cualitativo)", "Revisión previa de originalidad"],
        },
        {
          // Ekip paketi 28.10.2026'da satıştan kalktı (kurucu kararı): ArvoLab bireysel
          // araştırmacıya satılıyor, kurum lisansı yalnızca üniversite ve eğitim
          // kurumlarına teklifle veriliyor. Kart geri eklenirse lib'deki plan da gerekir.
          code: "arvolab-kurum",
          text: "Solo para universidades e instituciones educativas: una licencia de campus para un departamento o toda la universidad, con precio a consultar.",
          items: ["Investigadores ilimitados", "Licencia para todo el departamento o la universidad", "Gestión interna de usuarios", "Dominio propio", "Implantación y formación", "Facturado a la institución"],
        },
      ],
    },
  ],

  addOns: {
    eyebrow: "No incluido",
    title: "Conceptos que se cobran aparte.",
    lead: "Se aplican cuando supera el límite de un plan o solicita algo específico para su organización. No se añade nada más a la factura.",
    quote: "A consultar",
    items: [
      { code: "ek-kullanici", name: "Usuario adicional", text: "Por cada usuario que supere el número incluido en un plan de ArvoOS. No se aplica a ArvoLab, cuyo precio ya es por investigador." },
      { code: "ek-sube", name: "Sede adicional", text: "Por cada sede que supere las tres incluidas en el plan Multisede de ArvoCal." },
      { code: "veri-aktarimi", name: "Migración de datos y configuración", text: "Traslado de datos desde su sistema actual, alta de usuarios y formación del equipo. Se cobra una sola vez, según el alcance." },
      { code: "ozel-gelistirme", name: "Desarrollo a medida", text: "Un flujo de trabajo, una pantalla o un informe específicos para su organización. Se presupuesta una vez definido el alcance." },
    ],
  },

  policy: {
    eyebrow: "Condiciones de suscripción",
    title: "Las reglas detrás del precio.",
    lead: "Estas son las reglas que aplicamos realmente; el texto completo figura en el contrato de venta a distancia y en la política de cancelación y reembolso.",
    items: [
      { title: "Ningún cargo sin su consentimiento", text: "Nunca se realiza un cargo en su tarjeta sin su consentimiento expreso. De forma predeterminada, se envía un enlace de pago para cada periodo y usted aprueba el pago. Si al pagar guarda su tarjeta y elige la renovación automática, se le avisa al menos 3 días antes de cada cargo y puede desactivar la renovación automática en cualquier momento." },
      { title: "Cancelación al final del periodo", text: "Puede cancelar desde el panel o por correo electrónico. La cancelación surte efecto al final del periodo pagado; el servicio sigue disponible hasta entonces." },
      { title: "Cambios de precio", text: "Su periodo en curso no se ve afectado. Los cambios se anuncian por correo electrónico con al menos 30 días de antelación y solo se aplican a partir del periodo siguiente." },
      { title: "Subir o bajar de plan", text: "Una mejora surte efecto el mismo día y solo se cobran los días restantes del periodo. Una reducción se aplica al final del periodo en curso." },
      { title: "Cancelar antes un plan anual", text: "Los meses utilizados se recalculan al precio de lista mensual y se reembolsa el saldo restante. El descuento anual solo se retira para los meses no utilizados." },
      { title: "IVA y facturación", text: "Los importes en euros indicados no incluyen el IVA ni otros impuestos sobre las ventas, que se aplican en la factura según la normativa vigente; los precios en liras turcas de la página en turco incluyen el IVA. Se emite una factura por cada periodo, que se envía a su dirección de correo electrónico registrada." },
    ],
    links: [
      { label: "Contrato de venta a distancia", href: R("distance-sales"), variant: "ghost" },
      { label: "Política de cancelación y reembolso", href: R("refund"), variant: "ghost" },
      { label: "Entrega y prestación", href: R("delivery"), variant: "ghost" },
    ],
  },

  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "Sobre los precios",
    items: [
      { q: "¿Los precios incluyen el IVA?", a: "No. Los importes en euros de esta página no incluyen el IVA ni otros impuestos sobre las ventas; se aplican en la factura según la normativa vigente. Los precios en liras turcas de la página en turco incluyen el IVA." },
      { q: "¿Se cobra por usuario?", a: "En ArvoOS y ArvoCal, no: los precios son por organización y cada plan incluye un número determinado de usuarios; por encima de ese número solo se aplica la tarifa de usuario adicional y el precio del plan no se multiplica. En ArvoLab, sí: su precio es por investigador, porque allí el valor lo genera directamente la persona que lo usa." },
      { q: "¿Puede un equipo o una empresa contratar ArvoLab?", a: "ArvoLab se vende a investigadores individuales. Las licencias institucionales se ofrecen solo a universidades e instituciones educativas, previa solicitud." },
      { q: "¿Cuánto se ahorra con la facturación anual?", a: "Con la opción anual paga 10 meses y disfruta de 12: dos meses gratis. El importe se factura una sola vez al inicio del periodo." },
      { q: "¿Se renueva la suscripción automáticamente?", a: "Solo si usted lo elige. De forma predeterminada no se realiza ningún cargo automático en su tarjeta; se envía un enlace de pago para cada periodo. Al pagar puede guardar su tarjeta y elegir la renovación automática; recibe un aviso al menos 3 días antes de cada cargo y puede desactivar la renovación automática en cualquier momento desde la pantalla de pago de su cuenta." },
      { q: "¿Podemos cambiar de plan más adelante?", a: "Sí. Una mejora surte efecto el mismo día y solo se cobran los días restantes del periodo; una reducción se aplica al final del periodo en curso." },
      { q: "¿Qué ocurre si cambian los precios?", a: "Su periodo en curso no se ve afectado. Los cambios se anuncian con al menos 30 días de antelación y se aplican a partir del periodo siguiente." },
      { q: "Pagamos el plan anual: ¿y si cancelamos antes?", a: "Los meses utilizados se recalculan al precio de lista mensual y se reembolsa el saldo restante; el descuento anual solo se retira para los meses no utilizados." },
      { q: "¿Hay descuento por contratar varios productos?", a: "Sí: las organizaciones que usan más de un producto reciben un presupuesto conjunto. Solicite una demo para revisar el alcance." },
    ],
  },

  cta: {
    title: "Elijamos el plan que mejor se adapta a su organización.",
    lead: "Si no sabe por qué nivel empezar, analizamos juntos sus procesos y le recomendamos el plan adecuado.",
    actions: [demo, { label: "Escríbanos", href: `mailto:${COMPANY.email}`, variant: "ghost" }],
  },
};
