export const requestStages = [
  { code: "lead", name: "Yeni Talep" },
  { code: "qualified", name: "Talep İnceleniyor" },
  { code: "proposal", name: "Tekliflere Devredildi" },
  { code: "lost", name: "Arşivlendi" },
] as const;

/**
 * Yedek aşama adları.
 *
 * requestStages yalnızca talep ekranında seçilebilen aşamaları içeriyor.
 * Ama veritabanı otomatik olarak "contract" ve "won" aşamalarına da
 * geçiriyor (teklif sözleşmeye dönüşünce, sözleşme imzalanınca). Bunlar
 * listede olmadığı için ekranda ham kod görünüyordu: "CRM Aşaması: won".
 *
 * Kurumun kendi aşama yapılandırması varsa organization_crm_stages
 * tablosundan okunmalı; bu harita yalnızca yedek.
 */
export const requestStageNames = {
  ...Object.fromEntries(requestStages.map((stage) => [stage.code, stage.name])),
  contract: "Sözleşme Aşamasında",
  won: "Kazanıldı",
} as Record<string, string>;
