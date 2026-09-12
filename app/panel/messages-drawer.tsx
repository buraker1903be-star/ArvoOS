"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { MessagesApp } from "./messages/messages-app";
import { createInitialState, initMessages, useMessagesState } from "./messages/messages-store";
import type { MessagesInit } from "./messages/messages-shared";

// Üst çubuktaki "Mesajlar" düğmesi ve sağdan açılan mesaj penceresi.
// Depo pencere hiç açılmasa da başlar: okunmamış rozeti canlı kalır.
// Pencere içeriği ilk açılışta yüklenir; kapalıyken klavyeyle erişilmez (inert).
export function MessagesDrawer({ init }: { init: MessagesInit }) {
  const pathname = usePathname();
  const onPage = pathname.startsWith("/panel/messages");
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const fallback = useMemo(() => createInitialState(init), [init]);
  const s = useMessagesState(fallback);
  const unread = Object.values(s.unread).reduce((total, count) => total + (count || 0), 0);

  useEffect(() => {
    initMessages(init);
  }, [init]);

  useEffect(() => {
    const show = () => {
      setMounted(true);
      setOpen(true);
    };
    window.addEventListener("arvo:open-messages", show);
    return () => window.removeEventListener("arvo:open-messages", show);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("messages-drawer-open", open);
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".msg-sheet, .msg-lightbox")) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("messages-drawer-open");
    };
  }, [open]);

  const badge = unread ? <span className="panel-unread-badge">{unread > 99 ? "99+" : unread}</span> : null;
  const label = `Mesajlar${unread ? `, ${unread} okunmamış` : ""}`;

  return (
    <>
      {onPage ? (
        <Link className="panel-quick-action" href="/panel/messages" aria-current="page" aria-label={label}>
          <span className="panel-quick-icon" aria-hidden="true">◇</span>
          <b>Mesajlar</b>
          {badge}
        </Link>
      ) : (
        <button
          className="panel-quick-action"
          type="button"
          onClick={() => {
            setMounted(true);
            setOpen(true);
          }}
          aria-label={label}
          aria-expanded={open}
          aria-controls="messages-drawer"
        >
          <span className="panel-quick-icon" aria-hidden="true">◇</span>
          <b>Mesajlar</b>
          {badge}
        </button>
      )}
      {!onPage ? (
        <div className={`msg-drawer-root${open ? " is-open" : ""}`}>
          <button className="msg-drawer-backdrop" type="button" aria-label="Mesajları kapat" tabIndex={open ? 0 : -1} onClick={() => setOpen(false)} />
          <div id="messages-drawer" className="msg-drawer" role="dialog" aria-modal="true" aria-label="Mesajlar" inert={!open}>
            {mounted ? <MessagesApp init={init} variant="drawer" active={open} onClose={() => setOpen(false)} /> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
