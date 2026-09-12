"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { fetchNotificationFeed, markAllNotificationsReadFromDrawer, markNotificationReadFromDrawer } from "./notifications/actions";
import { fullTime, groupFeedByDay, relativeTime, type NotificationFeedItem } from "./notifications/feed";
import { inNotificationFilter, notificationFilters } from "./notifications/filters";
import { NotificationIcon } from "./notifications/notification-icon";
import { OPEN_NOTIFICATIONS_EVENT, getNotificationUnread, openNotificationsDrawer, setNotificationUnread, useNotificationUnread } from "./notifications/unread-store";
import "./notifications/notifications-drawer.css";

// Üst çubuktaki "Bildirimler" düğmesi ve sağdan açılan bildirim çekmecesi
// (Mesajlar çekmecesiyle aynı davranış: messages-drawer.tsx).
// - Liste ilk açılışta, sonra her açılışta sunucu işlemiyle yüklenir
//   (fetchNotificationFeed → sayfayla ortak load-notifications.ts + describe.ts).
// - Okundu işaretleme anında yansır; sunucu işlemi revalidatePath ile
//   layout'taki sayacı yeniler, gelen kesin sayı rozetlere yazılır.
// - Başka bileşenler "arvo:open-notifications" olayıyla açabilir.
// - Pencere .panel-root'a portal ile taşınır: üst çubuğun backdrop-filter'ı
//   position:fixed'i çubuğa hapsediyordu.

const PAGE = "/panel/notifications";
const badgeText = (count: number) => (count > 99 ? "99+" : String(count));
const currentTime = () => Date.now();
const isOnPage = (pathname: string) => pathname === PAGE || pathname.startsWith(`${PAGE}/`);

type FilterKey = "all" | "unread" | (typeof notificationFilters)[number]["key"];
type Feed = { status: "idle" | "loading" | "ready" | "error"; items: NotificationFeedItem[]; error: string | null; loadedAt: number };

function CloseIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
function ExpandIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6" /><path d="M20 4l-7 7" /><path d="M10 20H4v-6" /><path d="M4 20l7-7" /></svg>;
}
function Chevron() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;
}

export function NotificationsDrawer({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const onPage = isOnPage(pathname);
  const unread = useNotificationUnread(unreadCount);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [feed, setFeed] = useState<Feed>({ status: "idle", items: [], error: null, loadedAt: 0 });
  const [filter, setFilter] = useState<FilterKey>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const requestRef = useRef(0);
  const loadedOnceRef = useRef(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // Sayfa değişince çekmece kapanır (render sırasında durum ayarı)
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Sunucudan gelen sayı (ilk çizim ve her revalidate) rozetlerin kaynağı
  useEffect(() => {
    setNotificationUnread(unreadCount);
  }, [unreadCount]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setFeed((prev) => ({ ...prev, status: prev.status === "ready" ? "ready" : "loading", error: null }));
    const result = await fetchNotificationFeed().catch(() => ({ ok: false as const, error: "Bağlantı kurulamadı. Lütfen tekrar deneyin." }));
    if (request !== requestRef.current) return; // daha yeni bir yükleme var
    if (result.ok) {
      loadedOnceRef.current = true;
      setFeed({ status: "ready", items: result.items, error: null, loadedAt: currentTime() });
      setNotificationUnread(result.unread);
    } else if (loadedOnceRef.current) {
      // Liste zaten gösteriliyor: silme, üstte uyarı göster
      setNotice(result.error);
    } else {
      setFeed((prev) => ({ ...prev, status: "error", error: result.error }));
    }
  }, []);

  const show = useCallback(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest(".ntd")) returnFocusRef.current = active;
    setMounted(true);
    setOpen(true);
    setNotice(null);
    void load();
  }, [load]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (onPage) return; // sayfanın kendisindeyken çekmece açılmaz
    window.addEventListener(OPEN_NOTIFICATIONS_EVENT, show);
    return () => window.removeEventListener(OPEN_NOTIFICATIONS_EVENT, show);
  }, [onPage, show]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.classList.add("notifications-drawer-open");
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      root.classList.remove("notifications-drawer-open");
      const back = returnFocusRef.current;
      if (back && back.isConnected && back.offsetParent !== null) back.focus({ preventScroll: true });
    };
  }, [open]);

  const setRead = (ids: Set<string> | null, read: boolean) =>
    setFeed((prev) => ({ ...prev, items: prev.items.map((item) => (!ids || ids.has(item.id) ? { ...item, read } : item)) }));

  async function markRead(item: NotificationFeedItem) {
    if (item.read) return;
    setRead(new Set([item.id]), true);
    setNotificationUnread(getNotificationUnread(unreadCount) - 1);
    const result = await markNotificationReadFromDrawer(item.id).catch(() => ({ ok: false as const, error: "Bildirim güncellenemedi. Bağlantınızı kontrol edin." }));
    if (!result.ok) {
      setRead(new Set([item.id]), false);
      setNotificationUnread(getNotificationUnread(unreadCount) + 1);
      setNotice(result.error);
    }
  }

  async function markAll() {
    const unreadIds = new Set(feed.items.filter((item) => !item.read).map((item) => item.id));
    const before = getNotificationUnread(unreadCount);
    setMarkingAll(true);
    setNotice(null);
    setRead(null, true);
    setNotificationUnread(0);
    const result = await markAllNotificationsReadFromDrawer().catch(() => ({ ok: false as const, error: "Bildirimler güncellenemedi. Bağlantınızı kontrol edin." }));
    setMarkingAll(false);
    if (!result.ok) {
      setRead(unreadIds, false);
      setNotificationUnread(before);
      setNotice(result.error);
    }
  }

  const portalTarget = mounted ? document.querySelector(".panel-root") : null;
  const label = `Bildirimler${unread ? `, ${unread} okunmamış` : ""}`;
  const badge = unread ? <span className="panel-unread-badge">{badgeText(unread)}</span> : null;

  // Filtreler: Tümü, Okunmamış ve listede karşılığı olan kategoriler
  const items = feed.items;
  const listUnread = items.filter((item) => !item.read).length;
  const categoryChips = notificationFilters
    .map((entry) => ({ ...entry, count: items.filter((item) => inNotificationFilter(item.category, entry)).length }))
    .filter((entry) => entry.count > 0 || filter === entry.key);
  const visible = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "unread") return !item.read;
    const entry = notificationFilters.find((candidate) => candidate.key === filter);
    return entry ? inNotificationFilter(item.category, entry) : true;
  });
  const groups = groupFeedByDay(visible, feed.loadedAt);

  const chip = (key: FilterKey, text: string, count: number) => (
    <button key={key} type="button" className={`ntd-chip${filter === key ? " is-active" : ""}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
      {text}<b>{count}</b>
    </button>
  );

  const renderItem = (item: NotificationFeedItem) => {
    const isExpanded = expanded === item.id;
    const content = (
      <>
        <span className="ntd-icon" aria-hidden="true"><NotificationIcon name={item.icon} size={18} /></span>
        <span className="ntd-body">
          <span className="ntd-top">
            <span className="ntd-label">{item.label}</span>
            <time dateTime={item.createdAt} title={fullTime(item.createdAt)}>{relativeTime(item.createdAt, feed.loadedAt)}</time>
          </span>
          <span className="ntd-headline">{item.headline}</span>
          <span className={`ntd-detail${isExpanded ? " is-expanded" : ""}`}>{item.detail}</span>
          {item.context ? <span className="ntd-context">{item.context}</span> : null}
          {item.href ? <span className="ntd-cta">{item.actionLabel}<Chevron /></span> : null}
          {!item.read ? <span className="ntd-sr">Okunmamış</span> : null}
        </span>
      </>
    );
    return (
      <li key={item.id} className={`ntd-item${item.read ? "" : " is-unread"}`} data-tone={item.tone}>
        {item.href ? (
          <Link
            className="ntd-main"
            href={item.href}
            onClick={(event) => {
              void markRead(item);
              // Yeni sekmede açılıyorsa çekmece açık kalır
              if (!(event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1)) close();
            }}
          >
            {content}
          </Link>
        ) : (
          <button
            type="button"
            className="ntd-main"
            aria-expanded={isExpanded}
            onClick={() => {
              void markRead(item);
              setExpanded((current) => (current === item.id ? null : item.id));
            }}
          >
            {content}
          </button>
        )}
        {item.read ? <span className="ntd-read-slot" aria-hidden="true" /> : (
          <button type="button" className="ntd-read" onClick={() => void markRead(item)} aria-label={`Okundu işaretle: ${item.headline}`} title="Okundu işaretle">
            <span className="ntd-dot" aria-hidden="true" />
          </button>
        )}
      </li>
    );
  };

  let body;
  if (feed.status === "idle" || feed.status === "loading") {
    body = (
      <div className="ntd-skeleton" aria-busy="true" aria-label="Bildirimler yükleniyor">
        {[0, 1, 2, 3, 4].map((index) => <div className="ntd-skel-row" key={index}><span /><div><i /><i /><i /></div></div>)}
      </div>
    );
  } else if (feed.status === "error") {
    body = (
      <div className="ntd-empty" role="alert">
        <span className="ntd-icon" data-tone="danger"><NotificationIcon name="bell" /></span>
        <h3>Bildirimler yüklenemedi</h3>
        <p>{feed.error}</p>
        <button type="button" className="ntd-retry" onClick={() => void load()}>Tekrar dene</button>
      </div>
    );
  } else if (!groups.length) {
    body = (
      <div className="ntd-empty">
        <span className="ntd-icon" data-tone="neutral"><NotificationIcon name="bell" /></span>
        <h3>{filter === "unread" ? "Okunmamış bildirim yok" : filter === "all" ? "Henüz bildiriminiz yok" : "Bu başlıkta bildirim yok"}</h3>
        <p>{filter === "unread" ? "Hepsini okudunuz. Yeni bir iş atandığında burada görünecek." : "Size bir iş atandığında, müşteri mesaj bıraktığında ya da duyuru geldiğinde burada görünecek."}</p>
      </div>
    );
  } else {
    body = groups.map((group) => (
      <section className="ntd-group" key={group.key} aria-label={group.label}>
        <h3 className="ntd-day">{group.label}</h3>
        <ul className="ntd-list">{group.items.map(renderItem)}</ul>
      </section>
    ));
  }

  return (
    <>
      {onPage ? (
        <Link className="panel-quick-action" href={PAGE} aria-current="page" aria-label={label}>
          <span className="panel-quick-icon" aria-hidden="true">♢</span>
          <b>Bildirimler</b>
          {badge}
        </Link>
      ) : (
        <button
          className="panel-quick-action"
          type="button"
          // Üzerine gelince pencere önceden kurulur ve liste yüklenmeye başlar;
          // böylece ilk açılışta da kayarak ve dolu gelir.
          onPointerEnter={() => {
            setMounted(true);
            if (feed.status === "idle") void load();
          }}
          onFocus={() => setMounted(true)}
          onClick={show}
          aria-label={label}
          aria-expanded={open}
          aria-controls="notifications-drawer"
        >
          <span className="panel-quick-icon" aria-hidden="true">♢</span>
          <b>Bildirimler</b>
          {badge}
        </button>
      )}
      {!onPage && portalTarget
        ? createPortal(
            <div className={`ntd-root${open ? " is-open" : ""}`}>
              <button className="ntd-backdrop" type="button" aria-label="Bildirimleri kapat" tabIndex={open ? 0 : -1} onClick={close} />
              <div id="notifications-drawer" className="ntd" role="dialog" aria-modal="true" aria-labelledby={titleId} inert={!open}>
                <header className="ntd-head">
                  <div className="ntd-title">
                    <h2 id={titleId}>Bildirimler</h2>
                    <p className="ntd-sub">
                      <span>{unread ? `${unread} okunmamış` : "Hepsi okundu"}</span>
                      {listUnread > 0 ? (
                        <button type="button" className="ntd-link" onClick={() => void markAll()} disabled={markingAll}>
                          {markingAll ? "İşaretleniyor…" : "Tümünü okundu işaretle"}
                        </button>
                      ) : null}
                    </p>
                  </div>
                  <div className="ntd-head-actions">
                    <Link className="ntd-icon-btn" href={PAGE} onClick={close} aria-label="Bildirim merkezini tam sayfada aç" title="Tam sayfada aç"><ExpandIcon /></Link>
                    <button ref={closeRef} type="button" className="ntd-icon-btn" onClick={close} aria-label="Bildirimleri kapat" title="Kapat"><CloseIcon /></button>
                  </div>
                </header>

                {feed.status === "ready" && items.length ? (
                  <div className="ntd-chips" role="group" aria-label="Bildirim filtreleri">
                    {chip("all", "Tümü", items.length)}
                    {chip("unread", "Okunmamış", listUnread)}
                    {categoryChips.map((entry) => chip(entry.key, entry.label, entry.count))}
                  </div>
                ) : null}

                {notice ? (
                  <div className="ntd-notice" role="alert">
                    <span>{notice}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Uyarıyı kapat"><CloseIcon /></button>
                  </div>
                ) : null}

                <div className="ntd-scroll">{body}</div>

                <footer className="ntd-foot">
                  <Link className="ntd-all" href={PAGE} onClick={close}>Tüm bildirimleri aç<Chevron /></Link>
                </footer>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}

// Mobil alt menü ve menü çekmecesindeki "Bildirimler" girişi (mobile-drawer.tsx).
// Rozet, üst çubuktaki düğmeyle aynı sayıyı gösterir (unread-store.ts).
export function NotificationsNavButton({ variant, initialCount = 0, onOpen }: { variant: "bottom" | "menu"; initialCount?: number; onOpen?: () => void }) {
  const pathname = usePathname();
  const onPage = isOnPage(pathname);
  const count = useNotificationUnread(initialCount);
  const label = `Bildirimler${count ? `, ${count} okunmamış` : ""}`;

  if (variant === "bottom") {
    const badge = count ? <em className="mobile-bottom-badge">{badgeText(count)}</em> : null;
    return onPage ? (
      <Link href={PAGE} className="active" aria-current="page" aria-label={label}><i>♢</i><span>Bildirimler</span>{badge}</Link>
    ) : (
      <button type="button" onClick={openNotificationsDrawer} aria-label={label} aria-controls="notifications-drawer"><i>♢</i><span>Bildirimler</span>{badge}</button>
    );
  }

  const badge = count ? <em className="mobile-unread-badge">{badgeText(count)}</em> : null;
  return onPage ? (
    <Link href={PAGE} className="active" aria-current="page" onClick={onOpen} aria-label={label}><i>B</i><span>Bildirimler</span>{badge}<b>›</b></Link>
  ) : (
    <button type="button" onClick={() => { onOpen?.(); openNotificationsDrawer(); }} aria-label={label}><i>B</i><span>Bildirimler</span>{badge}<b>›</b></button>
  );
}
