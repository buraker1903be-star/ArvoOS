"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./panel-modal.css";

type PanelModalProps = {
  /** Düğmenin üstündeki metin. */
  triggerLabel: string;
  /** Düğmenin ikinci satırı (ör. "3 dosya"). */
  triggerNote?: string;
  /** Düğmedeki sayı rozeti; 0 ya da boşsa basılmaz. */
  triggerBadge?: string | null;
  /** Düğmenin rengi: success / danger / brand / neutral. */
  triggerTone?: string;
  triggerClassName?: string;
  title: string;
  description?: string;
  kicker?: string;
  /** Pencerenin genişliği: dar (sohbet) ya da genis (dosya yükleme). */
  boy?: "dar" | "orta" | "sohbet" | "genis";
  /** Adresten gelen derin bağlantı pencereyi açık başlatır. */
  baslangicAcik?: boolean;
  /**
   * Form kaydedilince pencere kapansın mı?
   *
   * Varsayılan HAYIR: sohbet ve dosya yükleme pencereleri her işlemden
   * sonra açık kalmalı (mesaj gönderince sohbet kapanmamalı, dosya
   * yükleyince liste görünmeli). Tek seferlik bir formda ise tersi
   * doğru — kaydedip kapanmak bekleniyor.
   */
  basaridaKapan?: boolean;
  children: ReactNode;
};

const subscribeNothing = () => () => undefined;

/*
  PANELİN ORTASINDA AÇILAN PENCERE.

  PanelDrawer (yandan açılan çekmece) form doldurmak için doğru; mesajlaşma
  ve dosya yükleme gibi "içinde bir süre kalınan" ekranlar için dar kalıyor.
  Bu pencere ortada açılıyor, arkayı karartıyor ve sağ üstte × taşıyor.

  İÇERİK YALNIZCA AÇIKKEN BASILIYOR. Kapalıyken de basmak iki şeyi bozardı:
  müşteri mesajlarını "okundu" sayan etki pencere açılmadan çalışır ve
  okunmamış rozeti kimse görmeden sönerdi; dosya yükleme kartı da her sayfa
  yüklenişinde kendi istemci durumunu kurardı.

  PENCERE KENDİLİĞİNDEN KAPANMIYOR (PanelDrawer "arvo:action-success"
  duyunca kapanır). Burada her işlem bir adım: mesaj gönderince sohbet
  kapanmamalı, dosya yükleyince liste görünmeli.

  Pencere düğmenin yanında değil panelin kökünde (.panel-root) çizilir:
  üst öğelerden biri transform/filter taşıyınca position:fixed ona
  hapsoluyor (PanelDrawer'da yaşandı).
*/
export function PanelModal({
  triggerLabel, triggerNote, triggerBadge, triggerTone = "neutral", triggerClassName = "panel-secondary",
  title, description, kicker, boy = "orta", baslangicAcik = false, basaridaKapan = false, children,
}: PanelModalProps) {
  const [open, setOpen] = useState(baslangicAcik);
  const titleId = useId();
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const portalTarget = isClient ? (document.querySelector(".panel-root") ?? document.body) : null;

  /* İşlem başarıyla bitince (FlashToast "arvo:action-success" yayar)
     pencere kapanır — yalnızca bunu isteyen pencerelerde. */
  useEffect(() => {
    if (!open || !basaridaKapan) return;
    const onSuccess = () => setOpen(false);
    window.addEventListener("arvo:action-success", onSuccess);
    return () => window.removeEventListener("arvo:action-success", onSuccess);
  }, [open, basaridaKapan]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);

    /*
      KİLİT HEM <html> HEM <body> ÜZERİNDE.

      Yalnızca body kilitleniyordu ve arka sayfa pencere açıkken tekerlekle
      kayıyordu. Sebep panel.css'in ilk satırı: html'e de body'ye de
      overflow-x veriliyor. html'in overflow'u "visible" olmaktan çıkınca
      body'ninki görünüm alanına YAYILMIYOR; belge html üzerinden kayıyor
      ve body'yi kilitlemek hiçbir şey yapmıyor.
    */
    const kok = document.documentElement;
    const oncekiKok = kok.style.overflow;
    const oncekiGovde = document.body.style.overflow;
    kok.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      kok.style.overflow = oncekiKok;
      document.body.style.overflow = oncekiGovde;
    };
  }, [open]);

  const pencere = (
    <div className="panel-modal-root" data-boy={boy}>
      <button className="panel-modal-backdrop" type="button" aria-label="Pencereyi kapat" onClick={() => setOpen(false)} />
      <div className="panel-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="panel-modal-header">
          <div>
            {kicker ? <small className="panel-kicker">{kicker}</small> : null}
            <h2 id={titleId}>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="panel-modal-close" type="button" aria-label="Kapat" onClick={() => setOpen(false)}>×</button>
        </header>
        <div className="panel-modal-body">{children}</div>
      </div>
    </div>
  );

  return <>
    <button className={triggerClassName} data-tone={triggerTone} type="button" onClick={() => setOpen(true)}>
      <span className="panel-modal-trigger-text">
        {triggerLabel}
        {triggerNote ? <small>{triggerNote}</small> : null}
      </span>
      {triggerBadge ? <em className="panel-modal-trigger-rozet">{triggerBadge}</em> : null}
    </button>
    {open && portalTarget ? createPortal(pencere, portalTarget) : null}
  </>;
}
