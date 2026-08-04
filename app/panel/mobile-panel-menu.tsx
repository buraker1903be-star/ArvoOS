"use client";

import { useEffect } from "react";

export function MobilePanelMenu() {
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

  return (
    <>
      <button className="panel-mobile-menu-button" type="button" onClick={open} aria-label="Menüyü aç" aria-controls="panel-sidebar">
        <span />
        <span />
        <span />
      </button>
      <button className="panel-mobile-menu-overlay" type="button" onClick={close} aria-label="Menüyü kapat" />
      <button className="panel-mobile-menu-close" type="button" onClick={close} aria-label="Menüyü kapat">×</button>
    </>
  );
}
