"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/*
  Canlı ekranı 15 saniyede bir tazeler. Panelin anlık yayını
  (os-canli-yenile) burada işlemiyor: olay tablosu RLS'li ve
  politikasız, yayın kimseye satır göndermez. Sekme arka plandayken
  tazelenmez; geri dönülünce hemen tazelenir.
*/
export function CanliYenile({ saniye = 15 }: { saniye?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tazele = () => { if (document.visibilityState === "visible") router.refresh(); };
    const zamanlayici = window.setInterval(tazele, saniye * 1000);
    document.addEventListener("visibilitychange", tazele);
    return () => {
      window.clearInterval(zamanlayici);
      document.removeEventListener("visibilitychange", tazele);
    };
  }, [router, saniye]);
  return null;
}
