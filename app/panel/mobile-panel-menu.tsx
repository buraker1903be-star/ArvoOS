"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function MobilePanelMenu({ hasMessages }: { hasMessages: boolean }) {
  const pathname = usePathname();
  const close = () => document.documentElement.classList.remove("panel-menu-open");
  const open = () => document.documentElement.classList.add("panel-menu-open");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".panel-sidebar a")) close();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("click", onClick);
      close();
    };
  }, []);

  const isActive = (href: string) => pathname === href || (href !== "/panel" && pathname.startsWith(`${href}/`));

  return (
    <>
      <button className="panel-mobile-menu-button" type="button" onClick={open} aria-label="Menüyü aç" aria-controls="panel-sidebar">
        <span />
        <span />
        <span />
      </button>
      <button className="panel-mobile-menu-overlay" type="button" onClick={close} aria-label="Menüyü kapat" />
      <button className="panel-mobile-menu-close" type="button" onClick={close} aria-label="Menüyü kapat">×</button>
      <nav className="panel-mobile-bottom-nav" aria-label="Mobil hızlı erişim">
        <Link className={isActive("/panel") ? "is-active" : ""} href="/panel"><span aria-hidden="true">⌂</span><b>Ana Sayfa</b></Link>
        {hasMessages ? <Link className={isActive("/panel/messages") ? "is-active" : ""} href="/panel/messages"><span aria-hidden="true">◇</span><b>Mesajlar</b></Link> : null}
        <Link className={isActive("/panel/notifications") ? "is-active" : ""} href="/panel/notifications"><span aria-hidden="true">♢</span><b>Bildirimler</b></Link>
        <button type="button" onClick={open}><span aria-hidden="true">☰</span><b>Menü</b></button>
      </nav>
    </>
  );
}
