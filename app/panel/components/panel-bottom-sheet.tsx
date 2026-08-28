"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import "./panel-bottom-sheet.css";

export function PanelBottomSheet({
  triggerLabel,
  title,
  children,
}: {
  triggerLabel: string;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) =>
      event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", close);
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button
        className="panel-secondary"
        type="button"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      <div
        className={open ? "panel-sheet-root open" : "panel-sheet-root"}
        aria-hidden={!open}
      >
        <button
          className="panel-sheet-backdrop"
          type="button"
          aria-label="Ayarları kapat"
          onClick={() => setOpen(false)}
        />
        <section
          className="panel-sheet"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="panel-sheet-handle" />
          <header>
            <div>
              <small className="panel-kicker">İŞLEMLER</small>
              <h2 id={titleId}>{title}</h2>
            </div>
            <button
              type="button"
              aria-label="Kapat"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>
          <div className="panel-sheet-actions">{children}</div>
        </section>
      </div>
    </>
  );
}
