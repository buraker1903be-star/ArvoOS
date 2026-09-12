// Durum rozetlerinin renk tonu. Eskiden paneldeki 74 rozetin hepsi aynı
// renkteydi; "Onaylandı" ile "Reddedildi" tabloda ayırt edilemiyordu.
// Ton, rozetin data-tone özelliğine yazılır (app/panel/panel-tables.css).
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

const tones: Record<string, StatusTone> = {
  // talepler
  lead: "gold", qualified: "info", proposal: "info", contract: "info", won: "success", lost: "neutral",
  // teklifler
  draft: "neutral", sent: "info", accepted: "success", rejected: "danger", expired: "warning", archived: "neutral",
  // sözleşmeler
  signed: "success", cancelled: "danger", completed: "success",
  // operasyon
  planned: "neutral", in_progress: "info", blocked: "warning",
  // ödeme / prim / belge
  paid: "success", pending: "warning", overdue: "danger", accrued: "gold", approved: "info", revoked: "danger",
};

export function statusTone(status?: string | null): StatusTone {
  return (status && tones[status]) || "neutral";
}
