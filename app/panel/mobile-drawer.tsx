"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

type PanelModule = { code: string; name: string; icon?: string | null };
type MobileItem = { href: string; label: string; icon: string };

const normalize = (value: string) => value.replaceAll("-", "_").toLowerCase();

export function MobileDrawer({
  modules,
  organizationName,
  roleName,
  isPlatformOwner,
}: {
  modules: PanelModule[];
  organizationName: string;
  roleName: string;
  isPlatformOwner: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const items = useMemo<MobileItem[]>(() => {
    const normalizedModules = modules.map((module) => ({ ...module, normalizedCode: normalize(module.code) }));
    const codes = new Set(normalizedModules.map((module) => module.normalizedCode));
    const firstModuleHref = (acceptedCodes: string[], fallback: string) => {
      const module = normalizedModules.find((item) => acceptedCodes.includes(item.normalizedCode));
      return module ? `/panel/${module.code}` : fallback;
    };

    const result: MobileItem[] = [{ href: "/panel", label: "Ana Sayfa", icon: "⌂" }];

    if (["crm", "requests", "sales", "proposals", "contracts"].some((code) => codes.has(code))) {
      result.push({ href: "/panel/crm", label: "CRM", icon: "C" });
    }
    if (["operations", "tasks", "calendar", "workflows"].some((code) => codes.has(code))) {
      result.push({ href: "/panel/operations", label: "Operasyon", icon: "O" });
    }
    if (["finance", "accounts", "banking", "billing", "payments", "e_invoice"].some((code) => codes.has(code))) {
      result.push({ href: firstModuleHref(["finance", "billing", "payments", "e_invoice", "accounts", "banking"], "/panel/finance"), label: "Finans", icon: "F" });
    }
    if (codes.has("hr")) {
      result.push({ href: firstModuleHref(["hr"], "/panel/hr"), label: "İnsan Kaynakları", icon: "İK" });
    }
    if (["documents", "files", "templates"].some((code) => codes.has(code))) {
      result.push({ href: firstModuleHref(["documents", "files", "templates"], "/panel/documents"), label: "Dokümanlar", icon: "D" });
    }
    if (["reporting", "reports", "analytics"].some((code) => codes.has(code))) {
      result.push({ href: firstModuleHref(["reporting", "reports", "analytics"], "/panel/reporting"), label: "Raporlar", icon: "R" });
    }
    if (codes.has("messages")) {
      result.push({ href: firstModuleHref(["messages"], "/panel/messages"), label: "Mesajlar", icon: "M" });
    }

    result.push({ href: "/panel/notifications", label: "Bildirimler", icon: "B" });
    result.push({ href: "/panel/settings", label: "Ayarlar", icon: "A" });
    if (isPlatformOwner) result.push({ href: "/panel/platform", label: "Platform Yönetimi", icon: "P" });
    return result;
  }, [modules, isPlatformOwner]);

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
          <div className="mobile-drawer-brand"><i>A</i><span><b>ArvoOS</b><small>BUSINESS OPERATING SYSTEM</small></span></div>
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
