"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function ProgressBarInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const activeRef = useRef(false);
  const isFirstRun = useRef(true);

  function start() {
    if (activeRef.current) return;
    activeRef.current = true;
    setVisible(true);
    setWidth(16);
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => {
      setWidth((current) => (current < 86 ? current + (86 - current) * 0.12 : current));
    }, 160);
  }

  function finish() {
    if (!activeRef.current) return;
    activeRef.current = false;
    if (intervalRef.current) window.clearInterval(intervalRef.current);
    setWidth(100);
    window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 240);
  }

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      start();
    }
    /*
      Form gönderimi de çubuğu başlatır (22.10.2026): eskiden yalnızca
      bağlantılar başlatıyordu; düğmeye basınca üstte hiçbir şey kıpırdamıyor,
      kapsül de gecikmeli geldiği için ilk yarım saniye tepkisiz geçiyordu.
      İşlem aynı sayfada bittiğinde adres değişmez; çubuk sayfa içeriği
      yenilenince (gözlemci) ya da en geç 8 sn sonra kapanır.
    */
    function handleSubmit(event: SubmitEvent) {
      const form = event.target as HTMLFormElement;
      if (form.dataset.noFeedback === "true") return;
      start();
      const icerik = document.querySelector(".panel-content");
      const gozlemci = icerik ? new MutationObserver(() => { gozlemci?.disconnect(); window.setTimeout(finish, 120); }) : null;
      if (icerik && gozlemci) gozlemci.observe(icerik, { childList: true, subtree: true });
      window.setTimeout(() => { gozlemci?.disconnect(); finish(); }, 8000);
    }
    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);
    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit);
    };
  }, []);


  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    finish();
  }, [pathname, searchParams]);

  useEffect(() => () => {
    if (intervalRef.current) window.clearInterval(intervalRef.current);
  }, []);

  return (
    <div className={visible ? "nav-progress visible" : "nav-progress"} style={{ width: `${width}%` }} aria-hidden="true">
      <span className="nav-progress-glow" />
    </div>
  );
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressBarInner />
    </Suspense>
  );
}
