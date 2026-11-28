"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useOdakTuzagi } from "./odak-tuzagi";
import "./panel-drawer.css";

type PanelDrawerProps = {
  triggerLabel: string;
  title: string;
  description?: string;
  /** Başlığın üstündeki küçük etiket. Varsayılan "YENİ KAYIT" idi ve
   *  "Düzenle" gibi pencerelerde yanlış görünüyordu; artık isteğe bağlı. */
  kicker?: string;
  /** Tetikleyici butonun stili (panel-primary / panel-secondary) */
  triggerClassName?: string;
  /** Geniş pencere (960 px): içinde liste ya da tablo olan formlar için (ör. prim ödemesinin iş listesi). */
  genis?: boolean;
  children: ReactNode;
};

const subscribeNothing = () => () => undefined;

// Pencere, düğmenin bulunduğu yerde değil panelin kökünde (.panel-root;
// tema değişkenleri orada) çizilir. Düğmenin üst öğelerinden biri transform,
// filter ya da backdrop-filter taşıyınca position:fixed o öğeye hapsoluyor
// ve pencere görünmez oluyordu ("+ Yeni talep" açılmıyordu).
export function PanelDrawer({ triggerLabel, title, description, kicker, triggerClassName = "panel-primary", genis = false, children }: PanelDrawerProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const pencereRef = useRef<HTMLElement>(null);
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const portalTarget = isClient ? (document.querySelector(".panel-root") ?? document.body) : null;

  // İşlem başarıyla bitince (FlashToast "arvo:action-success" yayar) pencere kapanır
  useEffect(() => {
    if (!open) return;
    const onSuccess = () => setOpen(false);
    window.addEventListener("arvo:action-success", onSuccess);
    return () => window.removeEventListener("arvo:action-success", onSuccess);
  }, [open]);

  /* Klavye penceredeyken dışarı kaçmasın (components/odak-tuzagi); açılışta
     odak ilk form kontrolüne (fareli cihazda). */
  useOdakTuzagi(open, pencereRef, "panel-drawer-root", [], true);

  /*
    Sabit kaydet çubuğu odaklanan alanı ÖRTMESİN (10.11.2026, PR #316).
    Tab ile gezerken tarayıcı alanı gövdenin alt kenarına kaydırıyor; alt
    kenarda yapışık kaydet çubuğu durduğu için alan onun altında kalıyordu
    (Yeni talep: kaynak ve iç not; teklif/sözleşme: tarih). Gövdenin
    scroll-padding'i çubuğun GERÇEK yüksekliğinden (hata özeti açılınca
    büyüyor) — panel-drawer.css · --drawer-eylem-h.
  */
  useEffect(() => {
    if (!open) return;
    const govde = pencereRef.current?.querySelector<HTMLElement>(".panel-drawer-body");
    const cubuk = govde?.querySelector<HTMLElement>(".panel-form-actions");
    if (!govde || !cubuk) return;
    const olc = () => govde.style.setProperty("--drawer-eylem-h", `${Math.ceil(cubuk.getBoundingClientRect().height)}px`);
    olc();
    const gozcu = new ResizeObserver(olc);
    gozcu.observe(cubuk);
    /* Chromium Tab ile odaklanan alanı kaydırırken scroll-padding'e her
       zaman uymuyor (390×844'te iç not çubuğun altında kaldı); tarayıcının
       kaydırmasından sonra alan hâlâ çubuğun altındaysa gövde o kadar kayar. */
    const goster = (olay: FocusEvent) => {
      const alan = olay.target;
      if (!(alan instanceof HTMLElement) || cubuk.contains(alan)) return;
      window.requestAnimationFrame(() => {
        const r = alan.getBoundingClientRect(), g = govde.getBoundingClientRect(), c = cubuk.getBoundingClientRect();
        const alt = (c.top > g.top ? Math.min(c.top, g.bottom) : g.bottom) - 12, ust = g.top + 12;
        if (r.height > alt - ust || r.top < ust) govde.scrollTop += r.top - ust;
        else if (r.bottom > alt) govde.scrollTop += r.bottom - alt;
      });
    };
    govde.addEventListener("focusin", goster);
    return () => { gozcu.disconnect(); govde.removeEventListener("focusin", goster); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Açık bir tarih seçicinin Escape'i yalnızca onu kapatır (tarih-secici.tsx).
      if (event.key === "Escape" && !event.defaultPrevented) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  const drawer = (
    <div className={open ? "panel-drawer-root open" : "panel-drawer-root"} aria-hidden={!open}>
      {/* Arka plan katmanı yalnızca fareyle/dokunarak kapatır: Tab sırasında
          DEĞİL (F-01: odak pencereden çıkınca buraya düşüyordu). Klavyeyle
          kapatma Esc ve başlıktaki Kapat düğmesi. */}
      <button className="panel-drawer-backdrop" type="button" aria-label="Pencereyi kapat" tabIndex={-1} onClick={() => setOpen(false)} />
      {/* tabIndex -1: açılışta odak buraya alınır, ilk Tab pencerenin
          kendi ilk alanına geçer. */}
      <aside ref={pencereRef} tabIndex={-1} className={genis ? "panel-drawer is-genis" : "panel-drawer"} role="dialog" aria-modal="true" aria-labelledby={titleId} inert={!open}>
        <header className="panel-drawer-header">
          <div>{kicker ? <small className="panel-kicker">{kicker}</small> : null}<h2 id={titleId}>{title}</h2>{description ? <p>{description}</p> : null}</div>
          <button className="panel-drawer-close" type="button" aria-label="Kapat" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="panel-drawer-body">{children}</div>
      </aside>
    </div>
  );

  return <>
    <button className={triggerClassName} type="button" onClick={() => setOpen(true)}>{triggerLabel}</button>
    {portalTarget ? createPortal(drawer, portalTarget) : null}
  </>;
}
