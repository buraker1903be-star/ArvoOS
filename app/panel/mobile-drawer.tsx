"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanelModule,
  resolveGroupHref,
  resolveNavigationGroups,
} from "./panel-navigation-config";
import { NotificationsNavButton } from "./notifications-drawer";

// match: grubun alt modül önekleri. Grup bağlantısı genel bakışa gittiği
// için (ör. /panel/finance/genel-bakis) cari veya talepler sayfasındayken
// de grup seçili görünsün.
type MobileItem = { href: string; label: string; icon: string; match?: string[] };

export function MobileDrawer({
  modules,
  organizationName,
  roleName,
  role,
  brandName,
  brandLogoUrl,
  brandTagline,
  hiddenModuleKeys,
  notificationUnreadCount = 0,
  messageUnreadCount: initialMessageUnreadCount = 0,
}: {
  modules: PanelModule[];
  organizationName: string;
  roleName: string;
  role?: string;
  brandName?: string;
  brandLogoUrl?: string | null;
  brandTagline?: string;
  hiddenModuleKeys?: string[];
  notificationUnreadCount?: number;
  messageUnreadCount?: number;
}) {
  const pathname = usePathname();
  // Menü açıldığı sayfaya bağlı: başka sayfaya geçilince kendiliğinden
  // kapanır. Eskiden pathname değişince efektte setOpen(false) çağrılıyordu
  // (react-hooks/set-state-in-effect, fazladan bir çizim).
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const setOpen = (value: boolean) => setOpenPath(value ? pathname : null);
  const [messageUnreadCount, setMessageUnreadCount] = useState(initialMessageUnreadCount);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const items = useMemo<MobileItem[]>(() => {
    const groups = resolveNavigationGroups(modules, role, new Set(hiddenModuleKeys ?? []))
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        href: resolveGroupHref(group),
        label: group.label,
        icon: group.icon,
        match: group.items.map((item) => `/panel/${item.code}`),
      }));

    const result: MobileItem[] = [
      { href: "/panel", label: "Ana Sayfa", icon: "⌂" },
      ...groups,
    ];

    result.push({ href: "/panel/settings", label: "Ayarlar", icon: "A" });
    // Platform yönetimi uygulama panelinden kaldırıldı; kendi alan adında.
    return result;
  }, [modules, role, hiddenModuleKeys]);

  useEffect(() => {
    document.documentElement.classList.toggle("mobile-drawer-open", open);
    if (open) window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => document.documentElement.classList.remove("mobile-drawer-open");
  }, [open]);

  useEffect(()=>{const handler=(event:Event)=>setMessageUnreadCount((event as CustomEvent<number>).detail??0);window.addEventListener("arvo:message-unread-count",handler);return()=>window.removeEventListener("arvo:message-unread-count",handler)},[]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPath(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const under = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
  const active = (href: string, match: string[] = []) => href === "/panel" ? pathname === href : under(href) || match.some(under);
  const initials = organizationName.trim().slice(0, 1).toUpperCase() || "A";
  const hasMessages = modules.some((module) => module.code.replaceAll("-", "_").toLowerCase() === "messages");

  return (
    <>
      <button className="mobile-drawer-trigger" type="button" onClick={() => setOpen(true)} aria-label="Menüyü aç" aria-expanded={open} aria-controls="mobile-drawer">
        <span /><span /><span />
      </button>

      <button className="mobile-drawer-backdrop" type="button" aria-label="Menüyü kapat" onClick={() => setOpen(false)} tabIndex={open ? 0 : -1} />

      <aside id="mobile-drawer" className="mobile-drawer" aria-hidden={!open} aria-label="Mobil menü">
        <header className="mobile-drawer-header">
            <div className="mobile-drawer-brand">{brandLogoUrl?<img src={brandLogoUrl} alt={brandName??"Logo"}/>:<i>{(brandName??"ArvoOS").slice(0,1).toUpperCase()}</i>}<span><b>{brandName??"ArvoOS"}</b><small>{brandTagline??"BUSINESS OPERATING SYSTEM"}</small></span></div>
          <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="Menüyü kapat" tabIndex={open ? 0 : -1}>×</button>
        </header>

        <section className="mobile-drawer-workspace">
          <span>{initials}</span>
          <div><b>{organizationName}</b><small>{roleName}</small></div>
        </section>

        <nav className="mobile-drawer-nav" aria-label="Mobil ana menü">
          {hasMessages?<button type="button" onClick={()=>{setOpen(false);window.dispatchEvent(new Event("arvo:open-messages"));}}><i>M</i><span>Mesajlar</span>{messageUnreadCount?<em className="mobile-unread-badge">{messageUnreadCount>99?"99+":messageUnreadCount}</em>:null}<b>›</b></button>:null}
          <NotificationsNavButton variant="menu" initialCount={notificationUnreadCount} onOpen={() => setOpen(false)} />
          {items.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} onClick={() => setOpen(false)} className={active(item.href, item.match) ? "active" : ""} aria-current={active(item.href, item.match) ? "page" : undefined}>
              <i>{item.icon}</i><span>{item.label}</span><b>›</b>
            </Link>
          ))}
        </nav>

        <footer className="mobile-drawer-footer">
          <div><i>✓</i><span><b>Güvenli oturum</b><small>Kurumsal veriler korunuyor</small></span></div>
        </footer>
      </aside>

      <nav className="mobile-bottom-nav" aria-label="Mobil hızlı erişim">
        <Link href="/panel" className={active("/panel") ? "active" : ""} aria-current={active("/panel") ? "page" : undefined}><i>⌂</i><span>Ana Sayfa</span></Link>
        {hasMessages?<button type="button" onClick={()=>window.dispatchEvent(new Event("arvo:open-messages"))}><i>◇</i><span>Mesajlar</span>{messageUnreadCount?<em className="mobile-bottom-badge">{messageUnreadCount>99?"99+":messageUnreadCount}</em>:null}</button>:null}
        <NotificationsNavButton variant="bottom" initialCount={notificationUnreadCount} />
        <button type="button" onClick={() => setOpen(!open)} className={open ? "active" : ""} aria-expanded={open} aria-controls="mobile-drawer"><i>☰</i><span>Menü</span></button>
      </nav>
    </>
  );
}
