"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// lib/panel-action.ts'in yazdığı hata mesajını gösterir. Çerez okunur okunmaz
// silinir; mesaj yalnızca bir kez görünür.
const FLASH_COOKIE = "arvo_flash";

function takeFlash() {
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${FLASH_COOKIE}=`));
  if (!entry) return null;
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
  try {
    return decodeURIComponent(decodeURIComponent(entry.slice(FLASH_COOKIE.length + 1)));
  } catch {
    return null;
  }
}

export function FlashToast() {
  const pathname = usePathname();
  const [message, setMessage] = useState<string | null>(null);
  const hideTimer = useRef<number | null>(null);
  const pollTimer = useRef<number | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setMessage(null), 10000);
  }, []);

  const check = useCallback(() => {
    const text = takeFlash();
    if (text) show(text);
    return Boolean(text);
  }, [show]);

  // Sayfa açılışında ve her gezinmede
  useEffect(() => {
    check();
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

  if (!message) return null;

  return (
    // Görünüm panel-motion.css'te: üstten kayan, temaya uyan cam bildirim
    // (eskiden sabit renkli, koyu temada da açık kırmızı bir kutuydu).
    <div className="panel-toast" role="alert" aria-live="assertive">
      <span className="panel-toast-icon" aria-hidden="true">!</span>
      <div className="panel-toast-body">
        <strong>İşlem tamamlanamadı</strong>
        <span>{message}</span>
      </div>
      <button className="panel-toast-close" type="button" onClick={() => setMessage(null)} aria-label="Kapat">
        ×
      </button>
    </div>
  );
}
