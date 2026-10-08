"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CANLI_GUNCELLEME_OLAYI, canliTablolar } from "./os-apps";

/*
  "SÜREKLİ YAŞAYAN SİSTEM": sayfadaki sunucu verisini kendiliğinden tazeler.

  Eskiden ana sayfa, CRM ve operasyon listeleri yalnızca gezinince
  değişiyordu; bir çalışma arkadaşının girdiği talep, sayfa yenilenene
  kadar görünmüyordu.

  İki yol birlikte çalışır:
   1. Supabase anlık değişiklikleri (postgres_changes) — kurumun ilgili
      tablolarına bir satır eklenince ya da değişince. RLS kişinin
      göremeyeceği satırı göndermez. Tabloların anlık yayına eklenmesi
      20261008073550_canli_panel_anlik_yayin migration'ında; uygulanana
      kadar bu yol sessizce boş kalır.
   2. Yedek: sekme görünürken 60 saniyede bir ve sekmeye geri dönülünce
      (30 saniyeden eskiyse) tazele. Anlık yol kapalıyken de ekran bayat
      kalmasın diye.

  Tazeleme router.refresh(): yalnızca sunucu bileşenleri yeniden okunur,
  formdaki yazı ve açık pencereler korunur. Art arda gelen değişiklikler
  tek tazelemeye toplanır. Kullanıcı bir alana yazıyorken beklenir.
*/
const TOPLAMA_MS = 1200;
const YEDEK_ARALIK_MS = 60_000;
const DONUS_ESIGI_MS = 30_000;

export function OsCanliYenile({ organizationId, tablolar }: { organizationId: string; tablolar: string[] }) {
  const router = useRouter();
  const sonTazeleme = useRef(0);
  const bekleyen = useRef<number | null>(null);
  const tabloAnahtari = tablolar.join(",");

  useEffect(() => {
    sonTazeleme.current = Date.now();
    const yaziyor = () => {
      const odak = document.activeElement;
      return Boolean(odak && (odak.matches("input, textarea, select, [contenteditable='true']")) && odak.closest(".panel-content"));
    };
    const tazele = (anlik: boolean) => {
      if (bekleyen.current) window.clearTimeout(bekleyen.current);
      bekleyen.current = window.setTimeout(() => {
        bekleyen.current = null;
        if (yaziyor()) { tazele(anlik); return; }
        sonTazeleme.current = Date.now();
        router.refresh();
        if (anlik) window.dispatchEvent(new Event(CANLI_GUNCELLEME_OLAYI));
      }, TOPLAMA_MS);
    };

    const istemci = createClient();
    let kanal = istemci.channel(`os-yenile:${organizationId}:${tabloAnahtari}`);
    for (const tablo of tabloAnahtari.split(",").filter(Boolean)) {
      kanal = kanal.on(
        "postgres_changes",
        { event: "*", schema: "public", table: tablo, filter: `organization_id=eq.${organizationId}` },
        () => tazele(true),
      );
    }
    kanal.subscribe();

    const aralik = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - sonTazeleme.current >= YEDEK_ARALIK_MS) tazele(false);
    }, YEDEK_ARALIK_MS / 2);
    const gorunurluk = () => {
      if (document.visibilityState === "visible" && Date.now() - sonTazeleme.current >= DONUS_ESIGI_MS) tazele(false);
    };
    document.addEventListener("visibilitychange", gorunurluk);

    return () => {
      window.clearInterval(aralik);
      document.removeEventListener("visibilitychange", gorunurluk);
      if (bekleyen.current) window.clearTimeout(bekleyen.current);
      void istemci.removeChannel(kanal);
    };
  }, [organizationId, tabloAnahtari, router]);

  return null;
}

/* Kabukta tek kez çizilir; açık sayfaya göre hangi tabloların dinleneceğini
   os-apps.ts'teki canliTablolar seçer. Detay ve form sayfalarında hiçbir
   şey dinlenmez. */
export function OsCanliSayfa({ organizationId }: { organizationId: string }) {
  const yol = usePathname();
  const tablolar = canliTablolar(yol);
  return tablolar.length ? <OsCanliYenile key={yol} organizationId={organizationId} tablolar={tablolar} /> : null;
}
