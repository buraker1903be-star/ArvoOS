"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./panel-drawer.css";

type PanelDrawerProps = {
  triggerLabel: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function PanelDrawer({ triggerLabel, title, description, children }: PanelDrawerProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const drawerId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    // Açıldığında odağı kapatma butonuna ver (küçük timeout DOM render için)
    setTimeout(() => closeRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      // drawer kapandığında trigger'a odağı geri ver
      triggerRef.current?.focus();
    }
  }, [open]);

  return <>
    <button
      ref={triggerRef}
      className="panel-primary"
      type="button"
      aria-expanded={open}
      aria-controls={drawerId}
      onClick={() => setOpen(true)}
    >{triggerLabel}</button>

    <div className={open ? "panel-drawer-root open" : "panel-drawer-root"} aria-hidden={!open}>
      <button className="panel-drawer-backdrop" type="button" aria-label="Çekmeceyi kapat" onClick={() => setOpen(false)} />
      <aside id={drawerId} className="panel-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="panel-drawer-header">
          <div><small className="panel-kicker">YENİ KAYIT</small><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button ref={closeRef} className="panel-drawer-close" type="button" aria-label="Kapat" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="panel-drawer-body">{children}</div>
      </aside>
    </div>
  </>;
}
