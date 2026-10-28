// İspanyolca: legal.ts'teki *_EN metinlerinin çevirisi. Hukuki içerik değiştirilmedi; yalnızca "Türkçe metin esastır" cümlesi eklendi.
import { COMPANY, PRODUCT_APPS, productList, ROUTES } from "@/lib/site/routes";
import type { PrivacyContent } from "../privacy";

const actualizado = "Última actualización: 30 de septiembre de 2026";
const aviso = "Esta traducción se ofrece con fines informativos; en caso de discrepancia prevalece la versión en turco.";

/** Künyenin dolu satırları; boş alan satır üretmez (legal.ts'teki kunye ile aynı kural). */
function kunye(): string[] {
  const satirlar: [string, string][] = [
    ["Razón social", COMPANY.legalName],
    ["Dirección", COMPANY.address.display],
    ["Correo electrónico", COMPANY.email],
    ["Teléfono", COMPANY.phone],
    ["Oficina tributaria", COMPANY.taxOffice],
    ["Número fiscal", COMPANY.taxNumber],
    ["MERSİS", COMPANY.mersis],
  ];
  return satirlar.filter(([, deger]) => deger).map(([ad, deger]) => `${ad}: ${deger}`);
}

const productos = productList("es");
const erisimSatirlari = Object.values(PRODUCT_APPS).map((u) => `${u.name}: ${u.host}`);

export const DISTANCE_SALES_ES: PrivacyContent = {
  meta: {
    title: "Contrato de venta a distancia",
    description: `Contrato para la venta a distancia de los servicios de suscripción de ArvoOS (${productos}): partes, objeto, precio, pago, prestación y desistimiento.`,
  },
  hero: {
    eyebrow: "Venta a distancia", title: "Contrato de", subtitle: "venta a distancia",
    lead: `Este contrato se aplica a la venta online de los servicios de software por suscripción de ArvoOS (${productos} y los productos que se añadan en el futuro).`,
    actions: [],
  },
  updated: actualizado,
  sections: [
    { h: "1. Partes", p: [aviso, "Proveedor del servicio (Vendedor):"], list: kunye() },
    { h: "", p: ["Suscriptor (Comprador): la persona física o jurídica que se suscribe y para la que se abre una cuenta."] },
    { h: "2. Objeto", p: [`La suscripción a uno o varios de los productos ${productos}, y los derechos y obligaciones de las partes conforme a la Ley turca n.º 6502 de Protección del Consumidor y al Reglamento de Contratos a Distancia. Los servicios se prestan en la nube y se utilizan en un navegador; no se entregan bienes físicos.`] },
    { h: "3. Precio y pago", list: [
      `La cuota de suscripción es el precio de lista publicado en ${ROUTES.pricing.es}; para los niveles con alcance definido (bajo presupuesto), es el importe indicado en la oferta.`,
      "Los importes están en la moneda indicada en el pedido (liras turcas, dólares estadounidenses o euros) y no incluyen el IVA; el IVA se añade en la factura al tipo vigente.",
      "Las suscripciones mensuales se facturan al inicio de cada periodo. Las suscripciones anuales se facturan una sola vez al inicio del periodo de 12 meses, por el importe de 10 meses de cuota.",
      "Cuando se superan los usuarios, sedes, tiendas o productos incluidos en un plan, solo se aplican las tarifas de complementos publicadas en la misma página; la cuota del plan no cambia.",
      "El pago se realiza con tarjeta de crédito o débito a través del proveedor de pagos del Vendedor, o mediante transferencia bancaria. El Vendedor no almacena los datos de la tarjeta.",
      "No hay cargos recurrentes automáticos; cada periodo se paga mediante un enlace que el suscriptor aprueba.",
    ] },
    { h: "4. Cambios de precio y de plan", list: [
      "El Vendedor puede actualizar los precios de lista. Un cambio de precio no afecta al periodo en curso (ya pagado) del suscriptor.",
      "Los cambios se comunican a la dirección de correo electrónico registrada del suscriptor con al menos 30 días de antelación y solo se aplican a partir del periodo que comience tras dicha notificación. El suscriptor que no acepte la nueva cuota puede cancelar al final del periodo.",
      "Una mejora de plan surte efecto el día en que se solicita; solo se cobra la diferencia correspondiente a los días restantes del periodo.",
      "Una reducción de plan surte efecto al final del periodo en curso; no procede reembolso alguno por un periodo ya iniciado.",
    ] },
    { h: "5. Prestación", p: [`La cuenta se pone a disposición en el plazo de un día hábil tras la confirmación del pago, normalmente de inmediato. Consulte ${ROUTES.delivery.es}.`] },
    { h: "6. Derecho de desistimiento", p: [
      "El Comprador puede desistir en un plazo de 14 días sin necesidad de indicar el motivo.",
      "Conforme al artículo 15/1-(ğ) del Reglamento de Contratos a Distancia, el derecho de desistimiento no se aplica a los servicios prestados de forma instantánea en formato electrónico una vez iniciada la prestación con el consentimiento del Comprador, que es lo que ocurre cuando la cuenta se abre de inmediato a petición del suscriptor.",
    ] },
    { h: "7. Cancelación y reembolso", p: [`Se regulan por separado en ${ROUTES.refund.es}, que forma parte integrante de este contrato.`] },
    { h: "8. Datos y privacidad", p: [`Los datos introducidos por el suscriptor pertenecen al suscriptor. El tratamiento de los datos personales se explica en ${ROUTES.privacy.es}.`] },
    { h: "9. Responsabilidad", p: ["El Vendedor presta el servicio con una diligencia razonable, pero no garantiza un funcionamiento ininterrumpido ni libre de errores. La responsabilidad se limita a las cuotas de suscripción pagadas en los últimos 12 meses."] },
    { h: "10. Ley aplicable y controversias", p: ["Se aplica la legislación turca. Son competentes las comisiones de arbitraje de consumo y los tribunales de consumo dentro de los límites económicos anunciados por el Ministerio de Comercio; en los demás casos, los tribunales de Estambul."] },
  ],
};

export const REFUND_ES: PrivacyContent = {
  meta: {
    title: "Política de cancelación y reembolso",
    description: "Condiciones de cancelación, desistimiento y reembolso de los servicios de suscripción de ArvoOS, incluidos los periodos de prueba, los finales de periodo y los cargos incorrectos.",
  },
  hero: {
    eyebrow: "Cancelación", title: "Política de cancelación", subtitle: "y reembolso",
    lead: `Cómo funcionan las cancelaciones y los reembolsos en los productos de suscripción de ArvoOS (${productos} y los productos que se añadan en el futuro).`,
    actions: [],
  },
  updated: actualizado,
  sections: [
    { h: "1. Cancelación de una suscripción", p: [aviso], list: [
      `Las suscripciones pueden cancelarse desde el panel o escribiendo a ${COMPANY.email}.`,
      "La cancelación surte efecto al final del periodo pagado; el servicio sigue disponible hasta entonces.",
      "Tras la cancelación no se realiza ningún cargo automático.",
      "Una suscripción anual tiene una duración de 12 meses; la cancelación antes de que finalice el año se liquida conforme a la sección 5.",
    ] },
    { h: "2. Periodos de prueba", p: ["Los periodos de prueba son gratuitos y no se convierten automáticamente en una suscripción de pago. Si no se realiza ningún pago, la cuenta simplemente se cierra."] },
    { h: "3. Derecho de desistimiento", p: ["Los consumidores pueden desistir en un plazo de 14 días. Cuando la cuenta se abre de inmediato a petición del suscriptor, la prestación ya ha comenzado y el derecho de desistimiento deja de aplicarse (Reglamento de Contratos a Distancia, art. 15/1-(ğ))."] },
    { h: "4. Reembolsos", list: [
      "Cuando procede el desistimiento, el importe se reembolsa en un plazo de 14 días mediante el método de pago original.",
      "En las suscripciones mensuales no se realizan reembolsos parciales por un periodo ya iniciado; el servicio sigue disponible hasta el final de ese periodo.",
      "En las suscripciones anuales, la cancelación anticipada se liquida conforme a la sección 5; se reembolsa la parte no utilizada del importe pagado por adelantado.",
    ] },
    { h: "5. Cancelación anticipada de un plan anual", list: [
      "Una suscripción anual se paga por adelantado: 10 meses de cuota por 12 meses de uso.",
      "Si el suscriptor cancela antes de que finalice el año, los meses durante los que el servicio estuvo disponible se recalculan al precio de lista mensual. Ese importe se descuenta de lo pagado y se reembolsa el saldo restante. Un mes ya iniciado cuenta como mes completo.",
      "El cálculo no puede ser inferior a cero: si el valor de los meses utilizados a la tarifa mensual supera el importe pagado por adelantado, el suscriptor no debe nada más; simplemente no hay reembolso.",
      "Los reembolsos se realizan en un plazo de 14 días desde la solicitud, mediante el método de pago original.",
    ] },
    { h: "6. Cambios de plan", list: [
      "Una mejora de plan surte efecto el día en que se solicita; solo se cobra la diferencia correspondiente a los días restantes del periodo y no procede reembolso alguno.",
      "Una reducción de plan surte efecto al final del periodo en curso; no se realiza reembolso alguno por un periodo ya iniciado.",
      "Si se prescinde por completo de un producto que estaba en un plan anual, se aplica la sección 5.",
    ] },
    { h: "7. Cargos incorrectos o duplicados", p: [`Se reembolsan íntegramente una vez detectados, sin condiciones. Contacto: ${COMPANY.email}.`] },
    { h: "8. Interrupciones imputables a ArvoOS", p: ["Si el servicio no está disponible durante un periodo prolongado por causas imputables a ArvoOS, el importe correspondiente se reembolsa o, previa solicitud, se abona en el periodo siguiente."] },
  ],
};

export const DELIVERY_ES: PrivacyContent = {
  meta: {
    title: "Entrega y prestación",
    description: "Cuándo se abren las cuentas, cómo se proporciona el acceso y por qué no hay entrega física en los servicios de suscripción de ArvoOS.",
  },
  hero: {
    eyebrow: "Entrega", title: "Entrega y", subtitle: "prestación",
    lead: `Los productos de ArvoOS (${productos} y los productos que se añadan en el futuro) funcionan en la nube: no hay entrega física; el servicio se presta cuando la cuenta se pone a disposición.`,
    actions: [],
  },
  updated: actualizado,
  sections: [
    { h: "1. Sin entrega física", p: [aviso, "Los servicios que se venden son digitales. No hay envío, gastos de entrega ni dirección de entrega; el servicio se presta a través de internet."] },
    { h: "2. Cuándo se abre la cuenta", list: [
      "En el plazo de un día hábil tras la confirmación del pago, normalmente de inmediato.",
      "Cuando se acuerdan trabajos de configuración (usuarios, ajustes de módulos, migración de datos), el plazo se indica en la oferta.",
      "El usuario autorizado recibe por correo electrónico un enlace de inicio de sesión y un paso para establecer la contraseña.",
    ] },
    { h: "3. Direcciones de acceso", p: ["Los servicios se utilizan en un navegador en:"], list: erisimSatirlari },
    { h: "4. Requisitos", p: ["Un navegador actualizado y una conexión a internet; no es necesario instalar nada. El mantenimiento programado se anuncia con antelación."] },
    { h: "5. Problemas", p: [`Si su cuenta no se abre a tiempo o no puede iniciar sesión, escriba a ${COMPANY.email}.`] },
  ],
};
