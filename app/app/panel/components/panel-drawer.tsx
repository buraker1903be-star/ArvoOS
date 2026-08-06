"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
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

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return <>
    <button className="panel-primary" type="button" onClick={() => setOpen(true)}>{triggerLabel}</button>
    <div className={open ? "panel-drawer-root open" : "panel-drawer-root"} aria-hidden={!open}>
      <button className="panel-drawer-backdrop" type="button" aria-label="Çekmeceyi kapat" onClick={() => setOpen(false)} />
      <aside className="panel-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="panel-drawer-header">
          <div><small className="panel-kicker">YENİ KAYIT</small><h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button className="panel-drawer-close" type="button" aria-label="Kapat" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="panel-drawer-body">{children}</div>
      </aside>
    </div>
  </>;
}
