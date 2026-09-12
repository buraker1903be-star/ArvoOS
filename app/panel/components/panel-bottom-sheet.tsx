"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./panel-bottom-sheet.css";

const subscribeNothing = () => () => undefined;

// Sayfa panelin köküne (.panel-root; tema değişkenleri orada) çizilir.
// Düğmenin üst öğelerinden biri transform/animasyon taşıyınca
// position:fixed o öğeye hapsoluyor, sayfa mobil sekme çubuğunun
// altında kalıyordu (PanelDrawer'daki düzeltmenin aynısı).
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
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const portalTarget = isClient ? (document.querySelector(".panel-root") ?? document.body) : null;
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
  const sheet = (
    <div
      className={open ? "panel-sheet-root open" : "panel-sheet-root"}
      aria-hidden={!open}
    >
      <button
        className="panel-sheet-backdrop"
        type="button"
        aria-label="Ayarları kapat"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />
      <section
        className="panel-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        inert={!open}
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
  );
  return (
    <>
      <button
        className="panel-secondary"
        type="button"
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </button>
      {portalTarget ? createPortal(sheet, portalTarget) : null}
    </>
  );
}
