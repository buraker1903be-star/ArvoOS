"use client";

import { MASAUSTU_EN_AZ, YANMENU_ANAHTARI, YANMENU_DAR, YANMENU_OZNITELIGI, darDegeri } from "@/lib/konsol/gezinme";

/*
  Yan menü tercihini kaydedip <html>'e uygular. Karar lib/konsol/gezinme.ts'te;
  burası yalnızca tarayıcıya dokunur — ön boyama betiğiyle AYNI özniteliği
  yazar, yoksa seçimden sonraki ilk yenilemede eski genişlik geri gelirdi.
*/
export function yanMenuTercihiniUygula(dar: boolean) {
  try {
    window.localStorage.setItem(YANMENU_ANAHTARI, darDegeri(dar));
  } catch {
    // Gizli sekmede depolama kapalı olabilir: seçim yalnızca bu sayfada geçerli olur.
  }
  const kok = document.documentElement;
  if (dar) kok.setAttribute(YANMENU_OZNITELIGI, YANMENU_DAR);
  else kok.removeAttribute(YANMENU_OZNITELIGI);
}

/** <html>'deki güncel durum (ön boyama betiği ya da düğme yazar). Sunucuda çağrılmaz. */
export function yanMenuDarMi(): boolean {
  return document.documentElement.getAttribute(YANMENU_OZNITELIGI) === YANMENU_DAR;
}

/*
  useSyncExternalStore aboneliği: özniteliği izler. Başka sekmedeki
  değişikliği ön boyama betiği zaten özniteliğe yansıtıyor; ayrıca
  storage dinlemek aynı değişikliği iki yoldan getirirdi.
*/
export function yanMenuAbone(degisti: () => void) {
  const gozcu = new MutationObserver(degisti);
  gozcu.observe(document.documentElement, { attributes: true, attributeFilter: [YANMENU_OZNITELIGI] });
  return () => gozcu.disconnect();
}

/*
  Daralt düğmesi yalnızca MASAÜSTÜNDE anlamlı: tablette ray, telefonda
  alt çubuk var; orada tercihi değiştirmek ekranda hiçbir şeyi
  değiştirmez ama kaydı değiştirir ve kullanıcı masaüstüne dönünce
  beklemediği bir hâlle karşılaşırdı. Sınır CSS'le aynı sabitten.
*/
const MASAUSTU_SORGUSU = `(min-width: ${MASAUSTU_EN_AZ}px)`;

export function masaustuMu(): boolean {
  return window.matchMedia(MASAUSTU_SORGUSU).matches;
}

export function masaustuAbone(degisti: () => void) {
  const sorgu = window.matchMedia(MASAUSTU_SORGUSU);
  sorgu.addEventListener("change", degisti);
  return () => sorgu.removeEventListener("change", degisti);
}
