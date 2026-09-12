"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// lib/panel-action.ts'in yazdığı sonuç mesajlarını gösterir: hata
// (arvo_flash) ve başarı (arvo_flash_ok). Çerez okunur okunmaz silinir;
// mesaj yalnızca bir kez görünür. Başarıda "arvo:action-success" olayı
// yayılır; açık giriş penceresi (PanelDrawer) kendiliğinden kapanır.
const ERROR_COOKIE = "arvo_flash";
const SUCCESS_COOKIE = "arvo_flash_ok";

function takeCookie(name: string) {
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  if (!entry) return null;
  document.cookie = `${name}=; Max-Age=0; path=/`;
  try {
    return decodeURIComponent(decodeURIComponent(entry.slice(name.length + 1)));
  } catch {
    return null;
  }
}

type Flash = { kind: "error" | "success"; text: string; id: number };

export function FlashToast() {
  const pathname = usePathname();
  const [flash, setFlash] = useState<Flash | null>(null);
  const hideTimer = useRef<number | null>(null);
  const pollTimer = useRef<number | null>(null);

  const show = useCallback((next: Flash) => {
    setFlash(next);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setFlash(null), next.kind === "success" ? 3800 : 10000);
    if (next.kind === "success") window.dispatchEvent(new CustomEvent("arvo:action-success", { detail: next.text }));
  }, []);

  const check = useCallback(() => {
    const error = takeCookie(ERROR_COOKIE);
    const success = takeCookie(SUCCESS_COOKIE);
    if (error) show({ kind: "error", text: error, id: Date.now() });
    else if (success) show({ kind: "success", text: success, id: Date.now() });
    return Boolean(error || success);
  }, [show]);

  // Sayfa açılışında ve her gezinmede (yönlendirmeyle biten işlemler)
  useEffect(() => {
    const timer = window.setTimeout(check, 0);
    return () => window.clearTimeout(timer);
  }, [pathname, check]);

  // Form gönderiminden sonra işlem yanıtı gelene kadar kısa aralıklarla bak.
  useEffect(() => {
    function handleSubmit() {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      const startedAt = Date.now();
      pollTimer.current = window.setInterval(() => {
        if (check() || Date.now() - startedAt > 15000) {
          if (pollTimer.current) window.clearInterval(pollTimer.current);
          pollTimer.current = null;
        }
      }, 400);
    }
    document.addEventListener("submit", handleSubmit);
    return () => {
      document.removeEventListener("submit", handleSubmit);
      if (pollTimer.current) window.clearInterval(pollTimer.current);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [check]);

  if (!flash) return null;

  // Görünüm panel-motion.css'te: üstten kayan, temaya uyan cam bildirim
  if (flash.kind === "success") {
    return (
      <div className="panel-toast is-success" role="status" aria-live="polite" key={flash.id}>
        <span className="panel-toast-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <div className="panel-toast-body">
          <strong>{flash.text}</strong>
          <span>İşlem başarıyla tamamlandı.</span>
        </div>
        <button className="panel-toast-close" type="button" onClick={() => setFlash(null)} aria-label="Kapat">×</button>
      </div>
    );
  }
  return (
    <div className="panel-toast" role="alert" aria-live="assertive" key={flash.id}>
      <span className="panel-toast-icon" aria-hidden="true">!</span>
      <div className="panel-toast-body">
        <strong>İşlem tamamlanamadı</strong>
        <span>{flash.text}</span>
      </div>
      <button className="panel-toast-close" type="button" onClick={() => setFlash(null)} aria-label="Kapat">×</button>
    </div>
  );
}
