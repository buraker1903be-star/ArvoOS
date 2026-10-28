// İspanyolca: randevu-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca yayındaki özellikler (hatırlatma otomatik değil, çok şube/rapor/kapora yok).
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "../types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].es;

export const RANDEVU_ES: ProductContent = {
  id: "randevu",
  name: "ArvoBook",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.randevu.url,
  featureList: [
    "Página de reservas online",
    "Calendario por profesional",
    "Servicios y personal",
    "Horarios de trabajo y ausencias",
    "Fichas de clientes",
    "Recordatorios por WhatsApp",
  ],
  meta: {
    title: "ArvoBook — Gestión de citas para salones",
    description:
      "Reservas online para peluquerías y salones de belleza: los clientes eligen ellos mismos el servicio, el profesional y la hora; calendario por profesional, horarios de trabajo y ausencias, recordatorios por WhatsApp.",
  },
  hero: {
    eyebrow: "ArvoBook · Gestión de citas para salones",
    title: "Deje que la página de reservas",
    subtitle: "atienda el teléfono.",
    lead:
      "Los clientes reservan por sí mismos y la cita aparece al instante en su calendario. Los huecos se abren según quién realiza cada servicio, y una cita que se solape nunca entra en el sistema.",
    actions: [
      { label: "Ver precios", href: R("pricing"), variant: "gold" },
      { label: "Abrir el panel", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Funciones",
    title: "La jornada del salón en una sola pantalla.",
    lead:
      "Una cita tomada por teléfono va a una agenda de papel, la agenda se lee mal y la hora se solapa. ArvoBook reconstruye esa cadena desde el principio.",
    items: [
      {
        title: "Página de reservas online",
        text: "El cliente elige el servicio, el profesional —o «sin preferencia»— y la hora. Sin registro: se le identifica por su número de teléfono y recibe un enlace de cancelación.",
      },
      {
        title: "Calendario por profesional",
        text: "Añada, mueva y cancele citas. El calendario se organiza por profesional, así que se ve de un vistazo quién está libre y cuándo.",
      },
      {
        title: "Servicios y personal",
        text: "La duración de un servicio, el margen de preparación posterior y quién lo realiza se definen en un solo lugar.",
      },
      {
        title: "Horarios de trabajo y ausencias",
        text: "El horario semanal se introduce en la hora local del propio salón. Las ausencias pueden fijarse para una persona o para todo el salón; en ese intervalo no se abren huecos.",
      },
      {
        title: "La base de datos bloquea los solapamientos",
        text: "Una cita que se solapa para el mismo profesional —contando el margen del servicio— se rechaza a nivel de base de datos. «Comprobar primero y luego escribir» no se considera suficiente.",
      },
      {
        title: "Recordatorios por WhatsApp",
        text: "La lista de recordatorios del día está lista en el panel y se envía desde WhatsApp con un toque. Si el salón ha conectado su propio número, el mensaje sale del salón y no de Arvo.",
      },
    ],
  },
  flow: {
    eyebrow: "Primeros pasos",
    title: "La configuración se hace de una sentada.",
    lead: "Su dirección de reservas funciona en cuanto se definen sus servicios y su personal.",
    steps: [
      { title: "Describa el salón", text: "El asistente de configuración le pide en orden los servicios, el personal y los horarios de trabajo." },
      { title: "Comparta su dirección", text: "Ponga su página de reservas en su perfil de Instagram, en su estado de WhatsApp o en su tarjeta." },
      { title: "Siga el calendario", text: "Las reservas llegan al calendario; la lista de recordatorios está lista al comenzar el día." },
    ],
  },
  audience: {
    eyebrow: "Para quién es",
    title: "Para cualquier salón que trabaje con cita previa.",
    items: [
      { title: "Peluquerías y barberías", text: "Una jornada completa por sillón, para salones que prefieren dejar el teléfono y volver al trabajo." },
      { title: "Centros de belleza", text: "Equipos que gestionan servicios de distintas duraciones y márgenes en el mismo calendario." },
      { title: "Cuidados y postratamiento", text: "Negocios que abren huecos según la especialidad del profesional y cuyas ausencias cambian a menudo." },
    ],
  },
  faq: {
    eyebrow: "Preguntas frecuentes",
    title: "Sobre ArvoBook",
    items: [
      { q: "¿Tienen que registrarse los clientes?", a: "No. El cliente elige un servicio, un profesional y una hora e introduce un número de teléfono; se le identifica por ese número y recibe un enlace de cancelación." },
      { q: "¿Pueden caer dos citas en el mismo hueco?", a: "No. Una cita que se solapa para el mismo profesional —contando el margen del servicio— se rechaza a nivel de base de datos, no mediante una comprobación de la interfaz." },
      { q: "¿Cómo se definen los horarios de trabajo y las ausencias?", a: "El horario semanal se introduce en la hora local del propio salón. Las ausencias pueden fijarse para un solo profesional o para todo el salón; en ese intervalo no se abren huecos." },
      { q: "¿Quién envía el recordatorio?", a: "La lista de recordatorios del día se prepara en el panel y se envía desde WhatsApp con un toque. Si el salón ha conectado su propio número de WhatsApp, sale del salón; si no, del número compartido de Arvo." },
      { q: "¿Cuánto cuesta?", a: `Los precios de lista mensuales y anuales están publicados en ${R("pricing")}.` },
    ],
  },
  cta: {
    title: "¿Listo para guardar la agenda de papel?",
    lead: "Lo configuramos con usted; en cuanto se definen sus servicios y su personal, su página de reservas se abre el mismo día.",
    actions: [
      { label: "Solicitar una demo", href: `${R("contact")}?interest=randevu`, variant: "gold" },
      { label: "Precios", href: R("pricing"), variant: "ghost" },
    ],
  },
};
