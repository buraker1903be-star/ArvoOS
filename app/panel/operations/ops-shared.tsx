import type { ReactNode } from "react";

// Operasyon ekranlarının ortak etiketleri, tarih yardımcıları ve simgeleri.
// Yönergesiz modül: sunucu sayfalarından içe aktarılır. Saat okuyan
// yardımcılar burada (bileşen gövdesinde saat okunmaz — react-hooks/purity).

export const TZ = "Europe/Istanbul";

export const workflowStatusNames: Record<string, string> = {
  planned: "Planlandı",
  in_progress: "Devam ediyor",
  blocked: "Beklemede",
  completed: "Tamamlandı",
  cancelled: "İptal",
  archived: "Arşivlendi",
};
export const priorityNames: Record<string, string> = { low: "Düşük", normal: "Normal", high: "Yüksek", urgent: "Acil" };
export const priorityTones: Record<string, string> = { low: "info", normal: "neutral", high: "warning", urgent: "danger" };
/** Aktif işler tablosunda ve genel bakışta sayılan durumlar */
export const activeStatuses = ["planned", "in_progress", "blocked"] as const;

/** Bugünün İstanbul tarihi, "YYYY-MM-DD" */
export const todayIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** "YYYY-MM-DD" + n gün */
export function addDaysKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** İki gün anahtarı arasındaki gün farkı (b - a) */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Termin rozeti: geciken kırmızı, bugün/3 gün sarı, sonrası mavi */
export function dueBadge(due: string, today: string): { tone: "danger" | "warning" | "info"; label: string; late: boolean } {
  const days = daysBetween(today, due);
  if (days < 0) return { tone: "danger", label: `${-days} gün gecikti`, late: true };
  if (days === 0) return { tone: "warning", label: "Bugün teslim", late: false };
  if (days <= 3) return { tone: "warning", label: `${days} gün kaldı`, late: false };
  return { tone: "info", label: `${days} gün kaldı`, late: false };
}

/** "12 Eyl 2026" (tarih ya da zaman damgası) */
export function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(date);
}

/** Görev ilerlemesi yüzdesi */
export function stepProgress(steps: { is_completed: boolean }[] | null | undefined) {
  const list = steps ?? [];
  const done = list.filter((step) => step.is_completed).length;
  return { done, total: list.length, percentage: list.length ? Math.round((done / list.length) * 100) : 0 };
}

const iconPaths: Record<string, ReactNode> = {
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M5.5 5h13L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  progress: <><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15 7h5v5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  message: <><path d="M20 12.5a7.5 7.5 0 0 1-11 6.6L4 20l1-4.3A7.5 7.5 0 1 1 20 12.5Z" /><path d="M9 11h6" /><path d="M9 14.5h3.5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16 9.6" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 13h4" /></>,
  unarchive: <><rect x="3" y="4" width="18" height="5" rx="1.5" /><path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M12 17v-5" /><path d="m9.5 14.5 2.5-2.5 2.5 2.5" /></>,
  user: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
};

export function OpsIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}
