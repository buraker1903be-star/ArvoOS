"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/*
  "Buradayım" sinyali: her sayfa açılışında, dakikada bir ve sekmeye
  dönülünce. Sunucu işlemi DEĞİL, düz bir istek (app/api/varlik): Next
  sunucu işlemlerini sırayla çalıştırdığı için eskiden sayfa açılır
  açılmaz basılan düğme bu sinyalin bitmesini bekliyordu (22.10.2026).
  keepalive: sayfa kapanırken de gitsin.
*/
export function PresenceHeartbeat() {
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    const send = () => {
      if (!active || document.visibilityState === "hidden") return;
      void fetch("/api/varlik", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ yol: pathname }),
        keepalive: true,
      }).catch(() => undefined);
    };
    send();
    const timer = window.setInterval(send, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") send(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [pathname]);
  return null;
}
