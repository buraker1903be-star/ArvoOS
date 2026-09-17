// Mesaj listesinin saf yardımcıları: tarih/saat etiketleri, dosya boyutu,
// baş harfler ve balon gruplama. React'e bağlı değil, bu yüzden birim
// testlenebilir (tests/unit/message-format.test.ts).

import { isOnline, timeOf, type Channel, type Message, type Person } from "./messages-shared";

export const TZ = "Europe/Istanbul";
export const DAY = 24 * 60 * 60 * 1000;
export const GROUP_GAP = 5 * 60 * 1000;

export const dayKey = (value: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
export const clock = (value: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(value));

export function dayLabel(value: string) {
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return "Bugün";
  if (key === dayKey(Date.now() - DAY)) return "Dün";
  const sameYear = key.slice(0, 4) === dayKey(Date.now()).slice(0, 4);
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(value));
}

export function listTime(value: string | null) {
  if (!value) return "";
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return clock(value);
  if (key === dayKey(Date.now() - DAY)) return "Dün";
  if (Date.now() - timeOf(value) < 6 * DAY) return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, weekday: "short" }).format(new Date(value));
  return new Intl.DateTimeFormat("tr-TR", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(value));
}

export function lastSeenLabel(value: string | null | undefined) {
  if (!value) return "Çevrimdışı";
  if (isOnline(value)) return "Çevrimiçi";
  const key = dayKey(value);
  if (key === dayKey(Date.now())) return `Son görülme ${clock(value)}`;
  if (key === dayKey(Date.now() - DAY)) return `Son görülme dün ${clock(value)}`;
  return `Son görülme ${listTime(value)}`;
}

export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("tr-TR") || "?";
export const fileSize = (size: number | null) =>
  size ? (size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.ceil(size / 1024))} KB`) : "";
export const lower = (value: string) => value.toLocaleLowerCase("tr-TR");

// ---------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------
export function otherUserId(channel: Channel, userId: string) {
  return channel.directKey?.split(":").find((id) => id !== userId) ?? null;
}

export function channelTitle(channel: Channel, userId: string, people: Map<string, Person>) {
  if (channel.channelType === "direct") {
    const other = otherUserId(channel, userId);
    return (other && people.get(other)?.name) || "Ekip üyesi";
  }
  return channel.name;
}

export type Row =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message; first: boolean; last: boolean };

export function buildRows(messages: Message[]): Row[] {
  const rows: Row[] = [];
  let previous: Message | null = null;
  let previousDay = "";
  messages.forEach((message, index) => {
    const currentDay = dayKey(message.created_at);
    if (currentDay !== previousDay) {
      rows.push({ kind: "day", key: `day-${currentDay}`, label: dayLabel(message.created_at) });
      previousDay = currentDay;
      previous = null;
    }
    const next = messages[index + 1];
    const continues = (a: Message | null, b: Message | undefined) =>
      Boolean(a && b && a.sender_id === b.sender_id && dayKey(a.created_at) === dayKey(b.created_at) && timeOf(b.created_at) - timeOf(a.created_at) < GROUP_GAP);
    rows.push({
      kind: "message",
      key: message.id,
      message,
      first: !continues(previous, message),
      last: !continues(message, next),
    });
    previous = message;
  });
  return rows;
}

