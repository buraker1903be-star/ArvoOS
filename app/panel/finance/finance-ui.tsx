import type { ReactNode } from "react";

// Finans ekranlarının ortak görsel parçaları: simgeler, özet widget'ı,
// boş durum ve temsilci rozeti. Yönergesiz modül: hem sunucu sayfalarından
// hem istemci bileşenlerinden içe aktarılabilir. Stiller finance.css'te.

export type FinTone = "neutral" | "info" | "success" | "warning" | "danger" | "gold" | "brand";

const paths: Record<string, ReactNode> = {
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  wallet: <><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" /></>,
  refund: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  scale: <><path d="M12 3v18" /><path d="M5 7h14" /><path d="m5 7-3 7a3.5 3.5 0 0 0 6 0Z" /><path d="m19 7-3 7a3.5 3.5 0 0 0 6 0Z" /><path d="M8 21h8" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16.5 9.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  alert: <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></>,
  link: <><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" /><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6" /><path d="M9 12h6" /></>,
  trend: <><path d="M4 16.5 9 11l3.5 3.5L20 7" /><path d="M15 7h5v5" /></>,
  percent: <><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></>,
  chevron: <path d="m9 18 6-6-6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
};

export function FinIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** Ad-soyaddan iki harfli rozet (ör. "Ayşe Kaya" → "AK"). */
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("tr-TR");
}

/** iOS widget'ı: tonlu simge kutusu, etiket, büyük rakam, not. */
export function FinWidget({ tone, icon, label, value, note, emphasis = false }: { tone: FinTone; icon: string; label: string; value: ReactNode; note?: ReactNode; emphasis?: boolean }) {
  return (
    <article className={emphasis ? "fin-widget is-emphasis" : "fin-widget"} data-tone={tone}>
      <span className="fin-widget-icon"><FinIcon name={icon} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      {note ? <span className="fin-widget-note">{note}</span> : null}
    </article>
  );
}

/** Kart içinde tek tip boş durum. */
export function FinEmpty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="fin-empty">
      <span className="fin-empty-icon"><FinIcon name={icon} size={22} /></span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/** Temsilci: baş harf rozeti + ad. "Atanmamış" soluk görünür. */
export function FinPerson({ name }: { name: string }) {
  const empty = name === "Atanmamış";
  return (
    <span className={empty ? "fin-person is-empty" : "fin-person"} title={name}>
      <i aria-hidden="true">{empty ? "—" : initials(name)}</i>
      <span>{name}</span>
    </span>
  );
}
