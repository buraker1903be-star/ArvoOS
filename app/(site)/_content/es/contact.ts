// İspanyolca: contact-en.ts'in çevirisi. Yapı ve veriler aynı; yalnızca metin çevrildi.
import { COMPANY, PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ContactContent } from "../contact";

export const CONTACT_ES: ContactContent = {
  meta: { title: "Contacto y solicitudes de demo", description: `Contacte con nosotros para demos de ArvoOS, ArvoLab y ArvoCal, proyectos de comercio electrónico y sitios web, acceso a los productos y conversaciones sobre proyectos: ${COMPANY.email}.` },
  hero: {
    eyebrow: "Contacto", title: "Aquí para", subtitle: "su próxima idea.",
    lead: "Para una demo de producto, el acceso a un panel o un proyecto digital a medida, rellene el formulario o escríbanos directamente: su solicitud llegará al equipo del producto o del proyecto correspondiente.",
    actions: [],
  },
  formTitle: "Formulario de demo y contacto",
  formLead: "Bastan unos pocos datos. Elija el producto que le interesa y cuéntenos brevemente qué necesita.",
  emailLabel: "Correo electrónico", addressLabel: "Dirección", appsLabel: "Iniciar sesión", privacyLabel: "Datos personales",
  privacyText: "Los datos del formulario solo se tratan para responder a su solicitud.",
  faq: {
    eyebrow: "Preguntas frecuentes", title: "Sobre el contacto",
    items: [
      { q: "¿Cómo solicito una demo?", a: "Elija en el formulario de esta página el producto que le interesa y describa sus necesidades; nuestro equipo se pondrá en contacto con usted." },
      { q: "¿De qué otra forma puedo contactar con ustedes?", a: `Envíe un correo electrónico a ${COMPANY.email}.` },
      { q: "Mi organización ya usa un panel: ¿dónde inicio sesión?", a: `ArvoOS funciona en ${PRODUCT_APPS.arvoos.host}, ArvoLab en ${PRODUCT_APPS.arvolab.host} y ArvoCal en ${PRODUCT_APPS.randevu.host}; si su organización tiene un dominio propio, también puede iniciar sesión allí.` },
      { q: "¿Cómo se utilizan los datos de mi formulario?", a: `Solo para responder a su solicitud. Encontrará los detalles en el Aviso de privacidad (${ROUTES.privacy.es}).` },
    ],
  },
};
