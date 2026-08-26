"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordPresence } from "./presence-actions";
export function PresenceHeartbeat() {
  const pathname = usePathname();
  useEffect(() => {
    let active = true;
    const send = () => { if (active && document.visibilityState !== "hidden") void recordPresence(pathname).catch(() => undefined); };
    send();
    const timer = window.setInterval(send, 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") send(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [pathname]);
  return null;
}
