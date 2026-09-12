import type { ReactNode } from "react";
import type { NotificationIconName } from "./describe";

// Bildirim türü simgeleri: sayfa ve çekmece aynı çizimleri kullanır.
const icons: Record<NotificationIconName, ReactNode> = {
  bubble: <path d="M21 12a8.5 8.5 0 0 1-12.4 7.5L3 21l1.6-5.1A8.5 8.5 0 1 1 21 12Z" />,
  comment: <><path d="M4 5h16v11H9l-5 4Z" /><path d="M8 9.5h8" /><path d="M8 12.5h5" /></>,
  person: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.7-3.6 3.3-5.5 6.5-5.5 1.6 0 3 .4 4.1 1.2" /><path d="M18 14v6" /><path d="M15 17h6" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2.5" /><path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7" /><path d="M3 12.5h18" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16.5 9" /></>,
  card: <><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19" /><path d="M6.5 14.5h4" /></>,
  lifebuoy: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /><path d="m5.6 5.6 3.9 3.9" /><path d="m14.5 14.5 3.9 3.9" /><path d="m18.4 5.6-3.9 3.9" /><path d="m9.5 14.5-3.9 3.9" /></>,
  megaphone: <><path d="M3 10.5v3a1 1 0 0 0 1 1h2l6 4V5.5l-6 4H4a1 1 0 0 0-1 1Z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" /></>,
  bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></>,
};

export function NotificationIcon({ name, size = 19 }: { name: NotificationIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}
