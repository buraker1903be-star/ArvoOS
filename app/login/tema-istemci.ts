"use client";

import { KOYU_SORGUSU, TEMA_ANAHTARI, TEMA_RENGI, temaCoz, tercihOku, type Tema, type TemaTercihi } from "@/lib/konsol-giris/tema";

/*
  Tema tercihini kaydedip <html>'e uygular. Karar lib/konsol-giris/tema.ts'te;
  burası yalnızca tarayıcıya dokunur — ön boyama betiğiyle aynı iki
  özniteliği yazar, yoksa seçimden sonraki ilk yenilemede eski tema
  geri gelirdi.
*/
export function temaTercihiniUygula(tercih: TemaTercihi) {
  try {
    window.localStorage.setItem(TEMA_ANAHTARI, tercih);
  } catch {
    // Gizli sekmede depolama kapalı olabilir: seçim yalnızca bu sayfada geçerli olur.
  }
  let sistemKoyu = false;
  try {
    sistemKoyu = window.matchMedia(KOYU_SORGUSU).matches;
  } catch {
    // matchMedia yoksa sistem açık sayılır.
  }
  const kok = document.documentElement;
  const tema = temaCoz(tercih, sistemKoyu);
  kok.setAttribute("data-theme", tema);
  kok.setAttribute("data-theme-tercih", tercih);
  document.querySelectorAll('meta[name="theme-color"]').forEach((etiket) => etiket.setAttribute("content", TEMA_RENGI[tema]));
}

/** <html>'deki güncel durum (ön boyama betiği yazar). Sunucuda çağrılmaz. */
export function temaDurumu(): { tercih: TemaTercihi; tema: Tema } {
  const kok = document.documentElement;
  return {
    tercih: tercihOku(kok.getAttribute("data-theme-tercih")),
    tema: kok.getAttribute("data-theme") === "dark" ? "dark" : "light",
  };
}

/** useSyncExternalStore aboneliği: iki özniteliği de dinler. */
export function temaAbone(degisti: () => void) {
  const gozcu = new MutationObserver(degisti);
  gozcu.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-theme-tercih"] });
  return () => gozcu.disconnect();
}
