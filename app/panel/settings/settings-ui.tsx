import Link from "next/link";
import type { ReactNode } from "react";

// Ayarlar ekranlarının ortak görsel parçaları: simgeler, özet widget'ı,
// bölüm kartı ve iOS "gruplanmış liste" satırları. Yönergesiz modül:
// sunucu sayfalarından içe aktarılır. Stiller settings.css'te.

export type StgTone = "neutral" | "info" | "success" | "warning" | "danger" | "gold";

const paths: Record<string, ReactNode> = {
  building: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10" /><path d="M8 7h4M8 11h4M8 15h4" /><path d="M3 21h18" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" /></>,
  palette: <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.1-4-7.4-9-7.4Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10.5" cy="7.5" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></>,
  plug: <><path d="M9 3v5M15 3v5" /><path d="M6 8h12v3a6 6 0 0 1-12 0Z" /><path d="M12 17v4" /></>,
  box: <><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5" /><path d="M12 13v8" /></>,
  shield: <><path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  lock: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>,
  support: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="m5.6 5.6 3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" /></>,
  wallet: <><rect x="2.5" y="5.5" width="19" height="14" rx="2.5" /><path d="M16 12.5h2.5" /><path d="M2.5 9.5h19" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  chart: <><path d="M4 20V11" /><path d="M10 20V5" /><path d="M16 20v-6" /><path d="M21 20H3" /></>,
  chat: <><path d="M20.5 11.5a7.5 7.5 0 0 1-10.9 6.7L4.5 19.5l1.3-4.5A7.5 7.5 0 1 1 20.5 11.5Z" /><path d="M9 11h6" /><path d="M9 14h3.5" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  chevron: <path d="m9 18 6-6-6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
};

export function StgIcon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

/** iOS widget'ı: tonlu simge kutusu, etiket, büyük değer, not. */
export function StgWidget({ tone, icon, label, value, note }: { tone: StgTone; icon: string; label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <article className="stg-widget" data-tone={tone}>
      <span className="stg-widget-icon"><StgIcon name={icon} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      {note ? <span className="stg-widget-note">{note}</span> : null}
    </article>
  );
}

/** Bölüm kartı: tonlu simge, küçük üst başlık, başlık, açıklama, sağda isteğe bağlı rozet. */
export function StgSection({ id, icon, tone = "neutral", kicker, title, description, aside, wide = false, children }: {
  id: string; icon: string; tone?: StgTone; kicker: string; title: string; description?: ReactNode; aside?: ReactNode; wide?: boolean; children: ReactNode;
}) {
  return (
    <section id={id} className={wide ? "stg-card is-wide" : "stg-card"} aria-labelledby={`${id}-title`}>
      <header className="stg-card-head">
        <span className="stg-card-icon" data-tone={tone}><StgIcon name={icon} size={20} /></span>
        <div className="stg-card-title">
          <small>{kicker}</small>
          <h2 id={`${id}-title`}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {aside ? <div className="stg-card-aside">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Gruplanmış listede etiket / değer satırı. Boş değer soluk "Belirtilmedi" olur. */
export function StgValueRow({ label, value, mono = false }: { label: string; value?: string | null; mono?: boolean }) {
  const empty = !value;
  return (
    <div>
      <dt>{label}</dt>
      <dd className={empty ? "is-empty" : mono ? "is-mono" : undefined}>{empty ? "Belirtilmedi" : value}</dd>
    </div>
  );
}

/** Gruplanmış listede gezinme satırı: simge, başlık, not, sağda ok. */
export function StgLinkRow({ href, icon, tone = "neutral", title, note }: { href: string; icon: string; tone?: StgTone; title: string; note?: string }) {
  return (
    <Link className="stg-link-row" href={href}>
      <span className="stg-row-main">
        <span className="stg-row-icon" data-tone={tone}><StgIcon name={icon} size={16} /></span>
        <span><b>{title}</b>{note ? <small>{note}</small> : null}</span>
      </span>
      <StgIcon name="chevron" size={16} />
    </Link>
  );
}

/** Yetkisi olmayana gösterilen küçük "salt okunur" rozeti. */
export function StgReadOnly() {
  return <span className="stg-readonly"><StgIcon name="lock" size={14} />Salt okunur</span>;
}
