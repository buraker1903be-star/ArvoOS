"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function MobilePanelMenu({ hasMessages }: { hasMessages: boolean }) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const close = () => setIsOpen(false);
  const open = () => setIsOpen(true);

  useEffect(() => {
    document.documentElement.classList.toggle("panel-menu-open", isOpen);
    return () => document.documentElement.classList.remove("panel-menu-open");
  }, [isOpen]);

  useEffect(() => {
    close();
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const isActive = (href: string) => {
    if (href === "/panel") return pathname === "/panel";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      <button
        className="panel-mobile-menu-button"
        type="button"
        onClick={open}
        aria-label="Menüyü aç"
        aria-controls="panel-sidebar"
        aria-expanded={isOpen}
      >
        <span />
        <span />
        <span />
      </button>

      <button
        className="panel-mobile-menu-overlay"
        type="button"
        onClick={close}
        aria-label="Menüyü kapat"
        tabIndex={isOpen ? 0 : -1}
      />

      <button
        className="panel-mobile-menu-close"
        type="button"
        onClick={close}
        aria-label="Menüyü kapat"
        tabIndex={isOpen ? 0 : -1}
      >×</button>

      <nav className={`panel-mobile-bottom-nav ${hasMessages ? "has-four-items" : "has-three-items"}`} aria-label="Mobil hızlı erişim">
        <Link onClick={close} className={isActive("/panel") ? "is-active" : ""} href="/panel" aria-current={isActive("/panel") ? "page" : undefined}>
          <span aria-hidden="true">⌂</span><b>Ana Sayfa</b>
        </Link>
        {hasMessages ? (
          <Link onClick={close} className={isActive("/panel/messages") ? "is-active" : ""} href="/panel/messages" aria-current={isActive("/panel/messages") ? "page" : undefined}>
            <span aria-hidden="true">◇</span><b>Mesajlar</b>
          </Link>
        ) : null}
        <Link onClick={close} className={isActive("/panel/notifications") ? "is-active" : ""} href="/panel/notifications" aria-current={isActive("/panel/notifications") ? "page" : undefined}>
          <span aria-hidden="true">♢</span><b>Bildirimler</b>
        </Link>
        <button className={isOpen ? "is-active" : ""} type="button" onClick={isOpen ? close : open} aria-expanded={isOpen} aria-controls="panel-sidebar">
          <span aria-hidden="true">☰</span><b>Menü</b>
        </button>
      </nav>
    </>
  );
}
