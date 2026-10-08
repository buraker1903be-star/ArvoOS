"use client";

import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import { MarkaLogosu, type DigerUygulama } from "../panel-navigation";
import { etkinUygulama, type OsUygulama } from "./os-apps";
import { OsSimge } from "./os-icons";

/*
  DOCK. Eski kenar menüsünün yerini alır: ekranın altında yüzen tek sıra
  uygulama. Açık uygulamanın altında kurum renginde bir nokta durur.
  Telefonda da aynı dock alt gezinme çubuğu olur; sığmayan uygulamalar
  yana kayar, hepsi başlatıcıda.

  BAŞLATICI. Sağdaki ızgara düğmesi ekranın ortasında bir pencere açar:
  kurumun bütün uygulamaları büyük ikonlarla, altta kurumun lisanslı diğer
  Arvo ürünleri. Ürünler yeni sekmede açılır (gerekçe panel-navigation.tsx).
*/
export function OsDock({ uygulamalar, digerUygulamalar }: { uygulamalar: OsUygulama[]; digerUygulamalar: DigerUygulama[] }) {
  const yol = usePathname();
  const pencere = useRef<HTMLDialogElement>(null);
  const etkin = etkinUygulama(uygulamalar, yol);
  const home = uygulamalar.find((u) => u.key === "home");
  const dockta = uygulamalar.filter((u) => u.key !== "home" && u.key !== "settings");

  const simge = (uygulama: OsUygulama) => {
    const acik = etkin?.key === uygulama.key;
    return (
      <Link
        key={uygulama.key}
        href={uygulama.href}
        className={acik ? "os-dock-item is-active" : "os-dock-item"}
        aria-label={uygulama.rozet ? `${uygulama.label}, ${uygulama.rozet} okunmamış` : uygulama.label}
        aria-current={acik ? "page" : undefined}
        title={uygulama.label}
      >
        <OsSimge ad={uygulama.ikon} boyut={22} />
        <span className="os-dock-label">{uygulama.label}</span>
        {uygulama.rozet ? <b className="os-dock-badge">{uygulama.rozet > 99 ? "99+" : uygulama.rozet}</b> : null}
      </Link>
    );
  };

  return (
    <>
      <nav className="os-dock" aria-label="Uygulamalar">
        {home ? simge(home) : null}
        <span className="os-dock-sep" aria-hidden="true" />
        {dockta.map(simge)}
        <span className="os-dock-sep" aria-hidden="true" />
        <button type="button" className="os-dock-item" aria-haspopup="dialog" title="Tüm uygulamalar" onClick={() => pencere.current?.showModal()}>
          <OsSimge ad="apps" boyut={22} />
          <span className="os-dock-label">Uygulamalar</span>
        </button>
      </nav>

      <dialog
        ref={pencere}
        className="os-launcher"
        aria-label="Uygulamalar"
        /* Pencerenin dışına basınca kapanır: hedef dialog ise tıklama boşluğa gelmiştir. */
        onClick={(olay) => { if (olay.target === pencere.current) pencere.current?.close(); }}
      >
        <header className="os-launcher-head">
          <div>
            <h2>Uygulamalar</h2>
            <p>Kurumunuzda açık ve yetkinizin olduğu modüller.</p>
          </div>
          <button type="button" className="os-icon-btn" aria-label="Kapat" onClick={() => pencere.current?.close()}>
            <OsSimge ad="close" boyut={18} />
          </button>
        </header>
        <div className="os-launcher-grid">
          {uygulamalar.map((uygulama) => (
            <Link key={uygulama.key} href={uygulama.href} className="os-launcher-app" onClick={() => pencere.current?.close()}>
              <span className={etkin?.key === uygulama.key ? "os-app-tile is-active" : "os-app-tile"}>
                <OsSimge ad={uygulama.ikon} boyut={30} />
              </span>
              <span>{uygulama.label}</span>
            </Link>
          ))}
        </div>
        {digerUygulamalar.length ? (
          <section className="os-launcher-products" aria-label="Diğer Arvo ürünleri">
            <h3>Diğer Arvo ürünleri</h3>
            <div className="os-launcher-grid">
              {digerUygulamalar.map((urun) => (
                <a
                  key={urun.kod}
                  href={urun.href}
                  className="os-launcher-app"
                  onClick={() => pencere.current?.close()}
                  {...(urun.ayniSekme ? {} : { target: "_blank", rel: "noreferrer" })}
                >
                  <span className="os-app-tile os-app-tile--product">
                    {urun.marka ? <MarkaLogosu marka={urun.marka} ad={urun.ad} /> : <i aria-hidden="true">{urun.ad.replace(/^Arvo\s*/, "").slice(0, 1)}</i>}
                  </span>
                  <span>{urun.ad} {urun.ayniSekme ? null : <OsSimge ad="external" boyut={12} />}</span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </dialog>
    </>
  );
}
