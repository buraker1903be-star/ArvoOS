import type { DescribedNotification, NotificationIconName, NotificationTone } from "./describe";

// Çekmeceye giden sade bildirim kaydı (metadata vb. tarayıcıya taşınmaz) ve
// çekmecenin gün gruplama / göreli zaman yardımcıları. Saf modül: hem sunucu
// işlemi (actions.ts) hem istemci bileşeni kullanır.

export type NotificationFeedItem = {
  id: string;
  category: string;
  label: string;
  tone: NotificationTone;
  icon: NotificationIconName;
  headline: string;
  detail: string;
  context: string | null;
  href: string | null;
  actionLabel: string;
  createdAt: string;
  read: boolean;
};

export type NotificationFeedResult =
  | { ok: true; items: NotificationFeedItem[]; unread: number | null }
  | { ok: false; error: string };

export function toFeedItem(item: DescribedNotification): NotificationFeedItem {
  // Duyurunun bağlantısı bildirim sayfasının kendisi; sayfa da düğme göstermiyor.
  // Yalnızca panel içi yollar izlenir (dışarıya yönlendirme yok).
  const href = item.action_url && item.category !== "management_announcement" && item.action_url.startsWith("/") && !item.action_url.startsWith("//") ? item.action_url : null;
  return {
    id: item.id,
    category: item.category,
    label: item.label,
    tone: item.tone,
    icon: item.icon,
    headline: item.headline,
    detail: item.detail,
    context: item.context,
    href,
    actionLabel: item.actionLabel,
    createdAt: item.created_at,
    read: Boolean(item.read_at),
  };
}

const TZ = "Europe/Istanbul";
const DAY = 24 * 60 * 60 * 1000;
const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const clockFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "short" });
const weekdayFormat = new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long" });
const dayKey = (value: number) => dayFormat.format(new Date(value));
/** İstanbul takvim günü farkı (0 = bugün, 1 = dün…) */
const daysAgo = (value: number, now: number) => Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(value))) / DAY);

export type DayGroupKey = "today" | "yesterday" | "week" | "older";
export const dayGroupLabels: Record<DayGroupKey, string> = { today: "Bugün", yesterday: "Dün", week: "Bu hafta", older: "Daha eski" };

/** Bugün / Dün / Bu hafta (son 7 gün) / Daha eski — sıralama korunur. */
export function groupFeedByDay(items: NotificationFeedItem[], now: number) {
  const groups: { key: DayGroupKey; label: string; items: NotificationFeedItem[] }[] = [];
  for (const item of items) {
    const ago = daysAgo(Date.parse(item.createdAt), now);
    const key: DayGroupKey = ago <= 0 ? "today" : ago === 1 ? "yesterday" : ago < 7 ? "week" : "older";
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, label: dayGroupLabels[key], items: [item] });
  }
  return groups;
}

/** iOS tarzı kısa zaman: "şimdi", "5 dk", "2 sa", "Dün 14:30", "Salı", "3 Eyl" */
export function relativeTime(value: string, now: number) {
  const at = Date.parse(value);
  const diff = Math.max(0, now - at);
  if (diff < 60_000) return "şimdi";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} dk`;
  const ago = daysAgo(at, now);
  if (ago <= 0) return `${Math.floor(diff / (60 * 60_000))} sa`;
  if (ago === 1) return `Dün ${clockFormat.format(new Date(at))}`;
  if (ago < 7) return weekdayFormat.format(new Date(at));
  return dateFormat.format(new Date(at));
}

export const fullTime = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
