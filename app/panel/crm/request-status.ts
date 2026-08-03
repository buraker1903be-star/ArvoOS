export const requestStages = [
  { code: "lead", name: "Yeni Talep" },
  { code: "qualified", name: "Talep İnceleniyor" },
  { code: "proposal", name: "Tekliflere Devredildi" },
  { code: "lost", name: "Arşivlendi" },
] as const;

export const requestStageNames = Object.fromEntries(requestStages.map((stage) => [stage.code, stage.name])) as Record<string, string>;
