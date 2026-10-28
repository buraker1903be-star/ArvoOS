// İspanyolca: arvoos-modules-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;

export const MODULES_ES: SubContent = {
  id: "arvoos-modules",
  parent: { id: "arvoos", name: "ArvoOS" },
  meta: {
    title: "Módulos de ArvoOS",
    description: "Módulos de ArvoOS: CRM y ventas, propuestas, contratos, centro de documentos, operaciones, portal de seguimiento para clientes, finanzas, RR. HH., informes, comunicación, gobernanza, marca y experiencia móvil.",
  },
  hero: {
    eyebrow: "ArvoOS · Módulos",
    title: "No son herramientas sueltas.", subtitle: "Son módulos que trabajan juntos.",
    lead: "Los módulos de ArvoOS son 13 áreas funcionales que trabajan sobre los mismos datos: el trabajo que empieza en un módulo pasa al siguiente sin que nadie tenga que volver a introducirlo.",
    actions: [{ label: "Solicitar una demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" }],
  },
  cards: {
    eyebrow: "Áreas funcionales",
    title: "Cada rincón de su empresa. Un solo núcleo.",
    lead: "Empiece con los módulos que necesita y amplíe el sistema a medida que crecen su equipo y sus procesos.",
    cols: "two", numbered: true,
    items: [
      { title: "CRM y ventas", size: "hero", visual: "s0", text: "El flujo comercial que convierte solicitudes en clientes, y clientes en ingresos.", items: ["Embudo por etapas con motivos de pérdida", "Historial automático del cliente en cada nueva solicitud", "Búsqueda instantánea de clientes por teléfono o nombre", "Asignación de comerciales y calendario de ventas"] },
      { title: "Propuestas", text: "El proceso comercial, de la redacción a la aceptación.", items: ["Revisiones; IVA incluido, excluido o exento", "Pago único o plan de plazos", "Enlaces para compartir por WhatsApp y correo electrónico", "Aceptación online registrada con fecha y hora, IP y dispositivo"] },
      { title: "Contratos", text: "Un contrato listo para firmar a partir de una propuesta, en un solo paso.", items: ["Plantillas de contrato", "Firma electrónica con firma manuscrita y declaraciones de consentimiento", "IP, sello de tiempo, dispositivo y hash de verificación", "Contenido bloqueado tras la firma, PDF A4"] },
      { title: "Centro de documentos", text: "Todos los documentos de cada operación en una sola línea de tiempo.", items: ["Solicitud → propuesta → contrato → operaciones → pago", "Registros de acceso a documentos", "Vista previa y PDF"] },
      { title: "Operaciones", size: "hero", alt: true, visual: "s3", text: "Convierta el trabajo vendido en un flujo que sus equipos puedan ejecutar.", items: ["Trabajos nuevos, en curso y próximos a vencer", "Tabla de trabajos, tablero de etapas y calendario de trabajos", "Carga del equipo: quién tiene qué, quién va con retraso, quién está libre", "Plantillas de pasos por tipo de trabajo", "Flujo de trabajo que se inicia con la firma, además de archivo"] },
      { title: "Portal de seguimiento para clientes", text: "Una página con su marca donde el cliente sigue su propio trabajo.", items: ["Avance y etapas mediante un código de seguimiento", "Resumen de pagos, documentos de propuesta y contrato", "Mensajería con el equipo de operaciones", "Última visita, número de visitas e indicador de conexión", "Entrega de archivos condicionada al pago mediante enlaces seguros de corta duración"] },
      { title: "Finanzas", text: "Una imagen financiera actualizada, vinculada a ventas y operaciones.", items: ["Cuentas corrientes y asientos contables", "Cobros, reembolsos y servicios adicionales", "Planes de plazos con un enlace de pago online por plazo", "Facturas, costes por trabajo y rentabilidad real"] },
      { title: "Recursos humanos", text: "La estructura del equipo y los procesos de personal en un mismo orden.", items: ["Personal, departamentos e invitaciones por correo electrónico", "Roles y comisiones con historial de tasas", "Pagos de comisiones asignados a trabajos, con anticipos", "Registros de actividad y de sesiones del personal", "Acuerdos de confidencialidad (NDA) del personal con firma electrónica"] },
      { title: "Informes", text: "Convierta los datos de cada módulo en decisiones.", items: ["Embudo de ventas con el paso más débil señalado", "Ventas y rentabilidad real", "Tendencias de seis meses y motivos de pérdida", "Impresión y PDF"] },
      { title: "Comunicación", text: "Las conversaciones del equipo, justo al lado del trabajo.", items: ["Mensajes directos con archivos adjuntos", "Centro de notificaciones con contador en vivo", "Notificaciones push en el móvil y el escritorio", "Anuncios de la dirección", "Centro de soporte"] },
      { title: "Gobernanza y seguridad", text: "Quién ve qué: claro y auditable.", items: ["Matriz de permisos rol × módulo y capacidades por acción", "Perfiles predefinidos: Responsable de Operaciones, Responsable de Ventas", "Acceso por registro y excepciones por persona", "Seguridad a nivel de fila en la base de datos", "Historial de auditoría"] },
      { title: "Multiinquilino y marca", text: "Cada organización en su propio espacio, con su propia marca.", items: ["Espacio de trabajo aislado por organización", "Dominio propio con verificación DNS", "Logotipo, color corporativo, icono de pestaña, sello y firma", "Sus propias cláusulas de contrato y de propuesta", "Datos legales y bancarios incorporados en los documentos"] },
      { title: "Experiencia", size: "wide", text: "Potente en el escritorio, tan fácil como una app en el móvil.", items: ["PWA instalable", "Barra de pestañas inferior y paneles deslizantes", "Temas oscuro y claro", "Interfaz en turco"] },
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "Sobre los módulos",
    items: [
      { q: "¿Qué módulos incluye ArvoOS?", a: "CRM y ventas, propuestas, contratos, centro de documentos, operaciones, portal de seguimiento para clientes, finanzas, recursos humanos, informes y comunicación, con el apoyo de la gobernanza, la marca y una experiencia móvil." },
      { q: "¿Cómo están conectados los módulos?", a: "Todos trabajan sobre los mismos datos: una propuesta aceptada se convierte en contrato en un solo paso, un contrato firmado se convierte automáticamente en un flujo de trabajo, y los pagos y la rentabilidad siguen vinculados al mismo trabajo." },
      { q: "¿Tenemos que usar todos los módulos?", a: "No. Su plan se configura en torno a los módulos que necesita y puede ampliarse a medida que crece el sistema." },
      { q: "¿Quién puede ver cada módulo?", a: "Lo determina la matriz de permisos rol × módulo; roles como el de comercial pueden limitarse a sus propios registros." },
    ],
  },
  cta: {
    title: "Decidamos con qué módulos empezar.",
    actions: [
      { label: "Solicitar una demo", href: `${R("contact")}?interest=arvoos`, variant: "gold" },
      { label: "Planes", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
