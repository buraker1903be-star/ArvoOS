"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanelModule,
  resolveGroupHref,
  resolveNavigationGroups,
} from "./panel-navigation-config";

type MobileItem = { href: string; label: string; icon: string };

export function MobileDrawer({
  modules,
  organizationName,
  roleName,
  isPlatformOwner,
  role,
  brandName,
  brandLogoUrl,
  brandTagline,
}: {
  modules: PanelModule[];
  organizationName: string;
  roleName: string;
  isPlatformOwner: boolean;
  role?: string;
  brandName?: string;
  brandLogoUrl?: string | null;
  brandTagline?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const items = useMemo<MobileItem[]>(() => {
    const groups = resolveNavigationGroups(modules, role)
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        href: resolveGroupHref(group),
        label: group.label,
        icon: group.icon,
      }));

    const result: MobileItem[] = [
      { href: "/panel", label: "Ana Sayfa", icon: "⌂" },
      ...groups,
    ];

    const hasMessages = modules.some((module) => module.code.replaceAll("-", "_").toLowerCase() === "messages");
    if (hasMessages) result.push({ href: "/panel/messages", label: "Mesajlar", icon: "M" });

    result.push({ href: "/panel/notifications", label: "Bildirimler", icon: "B" });
    result.push({ href: "/panel/settings", label: "Ayarlar", icon: "A" });
    if (isPlatformOwner) result.push({ href: "/panel/platform", label: "Platform Yönetimi", icon: "P" });
    return result;
  }, [modules, isPlatformOwner, role]);

  useEffect(() => {
    document.documentElement.classList.toggle("mobile-drawer-open", open);
    if (open) window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => document.documentElement.classList.remove("mobile-drawer-open");
  }, [open]);

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const active = (href: string) => href === "/panel" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const initials = organizationName.trim().slice(0, 1).toUpperCase() || "A";

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
          {items.map((item) => (
            <Link key={`${item.href}-${item.label}`} href={item.href} onClick={() => setOpen(false)} className={active(item.href) ? "active" : ""} aria-current={active(item.href) ? "page" : undefined}>
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
        <Link href="/panel/notifications" className={active("/panel/notifications") ? "active" : ""} aria-current={active("/panel/notifications") ? "page" : undefined}><i>♢</i><span>Bildirimler</span></Link>
        <button type="button" onClick={() => setOpen((value) => !value)} className={open ? "active" : ""} aria-expanded={open} aria-controls="mobile-drawer"><i>☰</i><span>Menü</span></button>
      </nav>
    </>
  );
}
