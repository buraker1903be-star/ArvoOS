"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const COOKIE = "arvo_nav";

// Kenar çubuğunu daraltma/genişletme. Tercih çerezde tutulur; layout.tsx
// çerezi okuyup .panel-root'a ilk çizimde doğru sınıfı verir, böylece sayfa
// açılırken menü genişleyip daralmaz. Görünüm: panel-motion.css.
export function SidebarToggle({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const pathname = usePathname();

  // Tercihi uygula. Sayfa değişince de uygulanır: daraltılmışken bir menü
  // grubuna tıklanınca menü geçici açılır (aşağıda), gezinince geri döner.
  useEffect(() => {
    document.querySelector(".panel-root")?.classList.toggle("is-nav-collapsed", collapsed);
  }, [collapsed, pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const summary = (event.target as HTMLElement | null)?.closest(".panel-nav-group summary");
      if (!summary) return;
      // Daraltılmış menüde alt sayfalar görünmez; grubu açınca menü açılsın.
      document.querySelector(".panel-root.is-nav-collapsed")?.classList.remove("is-nav-collapsed");
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  }

  const label = collapsed ? "Menüyü genişlet" : "Menüyü daralt";
  return (
    <button
      type="button"
      className="panel-sidebar-toggle"
      onClick={toggle}
      aria-pressed={collapsed}
      aria-label={label}
      title={label}
    >
      <i aria-hidden="true">{collapsed ? "»" : "«"}</i>
      <span>{label}</span>
    </button>
  );
}
