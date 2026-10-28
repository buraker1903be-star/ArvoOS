// İspanyolca: privacy-en.ts'in çevirisi. Hukuki içerik değiştirilmedi; yalnızca "Türkçe metin esastır" cümlesi eklendi.
import { COMPANY } from "@/lib/site/routes";
import type { PrivacyContent } from "../privacy";

export const PRIVACY_ES: PrivacyContent = {
  meta: { title: "Aviso de privacidad", description: "Cómo se tratan los datos personales en el sitio web arvo-os.com y en su formulario de demo / contacto conforme a la Ley turca n.º 6698 de Protección de Datos Personales (KVKK)." },
  hero: {
    eyebrow: "Privacidad", title: "Aviso de", subtitle: "privacidad",
    lead: "Este aviso explica cómo se tratan sus datos personales conforme a la Ley turca n.º 6698 de Protección de Datos Personales (KVKK) cuando visita arvo-os.com y utiliza su formulario de demo / contacto.",
    actions: [],
  },
  updated: "Última actualización: 13 de septiembre de 2026",
  sections: [
    { h: "1. Responsable del tratamiento", p: [
      "Esta traducción se ofrece con fines informativos; en caso de discrepancia prevalece la versión en turco.",
      `El responsable del tratamiento es ${COMPANY.legalName} («Arvo»). Dirección: ${COMPANY.address.display}, Turquía. Correo electrónico: ${COMPANY.email}.`,
    ] },
    { h: "2. Datos personales que tratamos", p: ["Cuando envía el formulario de demo / contacto:"], list: [
      "Identidad y contacto: nombre y apellidos, dirección de correo electrónico, número de teléfono y nombre de la organización (la organización y el teléfono son opcionales).",
      "Datos de la solicitud: el producto o servicio que le interesa, su mensaje, y la página y el idioma desde los que se envió el formulario.",
      "Registro de conformidad: su confirmación de que ha leído este aviso.",
      "Seguridad: un resumen de su dirección IP obtenido mediante una función hash unidireccional que cambia cada día, utilizado para prevenir abusos. La dirección IP sin procesar no se almacena.",
    ] },
    { h: "3. Finalidades", list: [
      "Recibir y evaluar sus solicitudes de demo, acceso, información y proyectos, y responderle",
      "Iniciar procesos de propuesta y contrato cuando usted lo solicite",
      "Proteger el formulario frente a envíos automatizados y malintencionados, y mantener la seguridad de la información",
      "Cumplir las obligaciones legales",
    ] },
    { h: "4. Bases jurídicas", p: ["Sus datos personales se tratan sobre las siguientes bases jurídicas previstas en el artículo 5(2) de la KVKK:"], list: [
      "(c) El tratamiento está directamente relacionado con la celebración o ejecución de un contrato: responder a su solicitud y preparar demos y propuestas",
      "(f) Interés legítimo del responsable del tratamiento, siempre que no perjudique sus derechos y libertades fundamentales: seguridad del formulario y gestión de solicitudes",
      "(ç) Cumplimiento de una obligación legal del responsable del tratamiento",
    ] },
    { h: "5. Cómo se recogen los datos", p: ["Los datos se recogen de usted por medios electrónicos a través del formulario del sitio web y, de forma automática, de su navegador al enviar el formulario. Su solicitud se registra como solicitud de cliente en el propio panel ArvoOS de Arvo."] },
    { h: "6. Transferencias", p: [
      "Sus datos personales no se venden ni se comparten con terceros con fines de marketing.",
      "Los datos se almacenan en los servidores de los proveedores de infraestructura en la nube y de bases de datos que alojan el sitio web y el panel; estos servidores pueden estar ubicados fuera de Turquía. Dichas transferencias se realizan conforme al artículo 9 de la KVKK. Los datos solo pueden comunicarse a organismos públicos autorizados cuando la ley lo exija.",
    ] },
    { h: "7. Conservación", p: ["Los datos del formulario se conservan durante el tiempo necesario para evaluar su solicitud y llevar a cabo la relación comercial que pueda derivarse de ella, y durante los plazos exigidos por la legislación aplicable; después se suprimen, destruyen o anonimizan. Los resúmenes de IP de seguridad se eliminan automáticamente en pocos días."] },
    { h: "8. Cookies", p: ["Este sitio web no utiliza cookies ni herramientas de seguimiento con fines publicitarios, analíticos o de elaboración de perfiles. Solo pueden utilizarse las cookies técnicas que resulten necesarias para el funcionamiento seguro del sitio."] },
    { h: "9. Sus derechos conforme al artículo 11 de la KVKK", p: ["Dirigiéndose al responsable del tratamiento, usted puede:"], list: [
      "Saber si se tratan sus datos personales y, en tal caso, solicitar información al respecto",
      "Conocer la finalidad del tratamiento y si los datos se utilizan conforme a ella",
      "Conocer los terceros, en Turquía o en el extranjero, a los que se transfieren los datos",
      "Solicitar la rectificación de los datos incompletos o inexactos",
      "Solicitar la supresión o destrucción de los datos en las condiciones del artículo 7 de la KVKK",
      "Solicitar que las rectificaciones, supresiones y destrucciones se notifiquen a los terceros a los que se transfirieron los datos",
      "Oponerse a un resultado desfavorable derivado exclusivamente de un análisis automatizado",
      "Reclamar una indemnización por los daños causados por un tratamiento ilícito",
    ] },
    { h: "10. Cómo presentar una solicitud", p: [`Envíe sus solicitudes por correo electrónico a ${COMPANY.email} o por escrito a ${COMPANY.address.display}, Turquía. Las solicitudes se resuelven de forma gratuita en un plazo máximo de treinta días, según su naturaleza (artículo 13 de la KVKK).`] },
    { h: "11. Cambios", p: ["Este aviso puede actualizarse cuando sea necesario; la versión vigente se publica siempre en esta página."] },
  ],
};
