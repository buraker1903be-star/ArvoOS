"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MarkaLogosu, type DigerUygulama } from "../panel-navigation";
import { etkinUygulama, kenarGruplari, mobilAltCubuk, NAV_CEREZI, type OsUygulama } from "./os-apps";
import { etkinBolum } from "./os-bolumler";
import { OsSimge } from "./os-icons";
import "./os-navigasyon.css";

/*
  SOL MENÜ + MOBİL ALT ÇUBUK (10.11.2026). Dock'un yerini alır.

  Eskiden masaüstünde ekranın altında yüzen, yazısız bir ikon sırası
  vardı: modülün adı yalnızca fareyle üstüne gelince çıkıyordu, bölümler
  (Talepler, Teklifler…) ikonun üstünde fareyle açılan ikinci bir menüdeydi
  ve klavyeyle ↑ tuşunu bilmeyen o menüyü hiç bulamıyordu. Hizmet işletmesi
  ekibi için modüllerin adını sürekli görmek, ikonları ezberlemekten
  anlaşılır.

  - Masaüstü: sol menü, adlar görünür; açık modülün bölümleri onun altında.
    Daraltılabilir (seçim çerezde, sunucu ilk çizimde okur — sayfa açılırken
    menü genişleyip daralmasın). Daraltılmışken ad, fareyle ve KLAVYE
    odağıyla ipucu olarak görünür; ekran okuyucu her durumda adı okur.
  - Telefon: alta yapışık çubuk; Ana ekran + en fazla üç modül + etiketli
    "Daha fazla" (seçim os-apps.ts · mobilAltCubuk). Bölümler üst çubuğun
    altındaki şeritte (os-bolum-seridi.tsx), değişmedi.
  - İki menü de AYNI listeyi (osUygulamalari) gösteriyor; burada yetki
    hesaplanmıyor. Menüde gizlemek yetkinin üçüncü katmanı (AGENTS.md).

  Hangisinin görüneceğini CSS seçiyor (os-shell.css): görünmeyen menü
  display:none olduğu için erişilebilirlik ağacında da yok.
*/

const altBolumler = (u: OsUygulama) => (u.bolumler ?? []).filter((b) => b.key !== "genel-bakis");

export function OsNavigasyon({ uygulamalar, digerUygulamalar, dar: ilkDar }: {
  uygulamalar: OsUygulama[];
  digerUygulamalar: DigerUygulama[];
  /** Sunucunun çerezden okuduğu ilk durum. */
  dar: boolean;
}) {
  const yol = usePathname();
  const sorgu = useSearchParams();
  const [dar, setDar] = useState(ilkDar);
  const pencere = useRef<HTMLDialogElement>(null);

  const etkin = etkinUygulama(uygulamalar, yol);
  const etkinBolumu = etkin ? etkinBolum(altBolumler(etkin), yol, sorgu.toString()) : null;
  const { ana, ek, ayarlar } = kenarGruplari(uygulamalar);
  const { birincil, digerleri } = mobilAltCubuk(uygulamalar);
  const dahaEtkin = Boolean(etkin && digerleri.some((u) => u.key === etkin.key));
  const dahaRozeti = digerleri.reduce((t, u) => t + (u.rozet ?? 0), 0);

  const degistir = () => {
    const yeni = !dar;
    setDar(yeni);
    document.cookie = `${NAV_CEREZI}=${yeni ? "dar" : "genis"}; path=/; max-age=31536000; samesite=lax`;
    document.querySelector(".os-root")?.setAttribute("data-nav", yeni ? "dar" : "genis");
  };

  const rozet = (u: OsUygulama) => (u.rozet ? <b className="os-nav-rozet" aria-hidden="true">{u.rozet > 99 ? "99+" : u.rozet}</b> : null);
  const ad = (u: OsUygulama) => (u.rozet ? `${u.label}, ${u.rozet} okunmamış` : undefined);

  const menuOgesi = (u: OsUygulama) => {
    const acik = etkin?.key === u.key;
    const bolumler = acik && !dar ? altBolumler(u) : [];
    return (
      <li key={u.key}>
        <Link
          href={u.href}
          className={acik ? "os-nav-link is-active" : "os-nav-link"}
          /* Bölüm seçiliyse "sayfa" bölümdür; modül yalnızca "içinde olunan yer". */
          aria-current={acik ? (etkinBolumu ? "true" : "page") : undefined}
          aria-label={ad(u)}
        >
          <OsSimge ad={u.ikon} boyut={18} />
          <span className="os-nav-ad">{u.label}</span>
          {rozet(u)}
        </Link>
        {bolumler.length ? (
          <ul className="os-nav-bolumler" aria-label={`${u.label} bölümleri`}>
            {bolumler.map((b) => (
              <li key={b.key}>
                <Link href={b.href} className={etkinBolumu?.key === b.key ? "is-active" : undefined} aria-current={etkinBolumu?.key === b.key ? "page" : undefined}>
                  {b.label}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <nav className="os-nav" aria-label="Ana menü">
        <ul className="os-nav-list">{ana.map(menuOgesi)}</ul>
        {ek.length ? (
          <>
            <p className="os-nav-grup" aria-hidden={dar || undefined}>Diğer</p>
            <ul className="os-nav-list">{ek.map(menuOgesi)}</ul>
          </>
        ) : null}
        <div className="os-nav-alt">
          <ul className="os-nav-list">
            {ayarlar ? menuOgesi(ayarlar) : null}
            {digerUygulamalar.length ? (
              <li>
                <button type="button" className="os-nav-link" aria-haspopup="dialog" onClick={() => pencere.current?.showModal()}>
                  <OsSimge ad="apps" boyut={18} />
                  <span className="os-nav-ad">Arvo ürünleri</span>
                </button>
              </li>
            ) : null}
          </ul>
          <button type="button" className="os-nav-link os-nav-daralt" aria-expanded={!dar} onClick={degistir}>
            <OsSimge ad="panel" boyut={18} />
            <span className="os-nav-ad">{dar ? "Menüyü genişlet" : "Menüyü daralt"}</span>
          </button>
        </div>
      </nav>

      <nav className="os-tabbar" aria-label="Ana menü">
        {birincil.map((u) => {
          const acik = etkin?.key === u.key;
          return (
            <Link key={u.key} href={u.href} className={acik ? "os-tab is-active" : "os-tab"} aria-current={acik ? "page" : undefined} aria-label={ad(u)}>
              <OsSimge ad={u.ikon} boyut={22} />
              <span>{u.label}</span>
              {rozet(u)}
            </Link>
          );
        })}
        {digerleri.length || digerUygulamalar.length ? (
          <button type="button" className={dahaEtkin ? "os-tab is-active" : "os-tab"} aria-haspopup="dialog" onClick={() => pencere.current?.showModal()}
            aria-label={dahaRozeti ? `Daha fazla, ${dahaRozeti} okunmamış` : undefined}>
            <OsSimge ad="apps" boyut={22} />
            <span>Daha fazla</span>
            {dahaRozeti ? <b className="os-nav-rozet" aria-hidden="true">{dahaRozeti > 99 ? "99+" : dahaRozeti}</b> : null}
          </button>
        ) : null}
      </nav>

      <dialog
        ref={pencere}
        className="os-daha"
        aria-labelledby="os-daha-baslik"
        onClick={(olay) => { if (olay.target === pencere.current) pencere.current?.close(); }}
      >
        <header className="os-daha-bas">
          <h2 id="os-daha-baslik">Daha fazla</h2>
          <button type="button" className="os-icon-btn" aria-label="Kapat" onClick={() => pencere.current?.close()}>
            <OsSimge ad="close" boyut={18} />
          </button>
        </header>
        {/* Telefonda alt çubukta olmayanlar; masaüstünde hepsi solda olduğu için burada yalnızca ürünler var (os-shell.css). */}
        {digerleri.length ? (
          <ul className="os-daha-liste os-daha-moduller" aria-label="Diğer modüller">
            {digerleri.map((u) => {
              const acik = etkin?.key === u.key;
              return (
                <li key={u.key}>
                  <Link href={u.href} className={acik ? "os-daha-oge is-active" : "os-daha-oge"} aria-current={acik ? "page" : undefined} onClick={() => pencere.current?.close()}>
                    <span className="os-daha-simge"><OsSimge ad={u.ikon} boyut={20} /></span>
                    <span>{u.label}</span>
                    {u.rozet ? <b className="os-nav-rozet">{u.rozet > 99 ? "99+" : u.rozet}<span className="sr-only"> okunmamış</span></b> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
        {digerUygulamalar.length ? (
          <section className="os-daha-urunler" aria-labelledby="os-daha-urunler">
            <h3 id="os-daha-urunler">Diğer Arvo ürünleri</h3>
            <ul className="os-daha-liste">
              {digerUygulamalar.map((urun) => (
                <li key={urun.kod}>
                  <a href={urun.href} className="os-daha-oge" onClick={() => pencere.current?.close()} {...(urun.ayniSekme ? {} : { target: "_blank", rel: "noreferrer" })}>
                    <span className="os-daha-simge os-daha-simge--urun">
                      {urun.marka ? <MarkaLogosu marka={urun.marka} ad="" /> : <i aria-hidden="true">{urun.ad.replace(/^Arvo\s*/, "").slice(0, 1)}</i>}
                    </span>
                    <span>{urun.ad}</span>
                    {urun.ayniSekme ? null : <><OsSimge ad="external" boyut={14} /><span className="sr-only"> (yeni sekmede açılır)</span></>}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </dialog>
    </>
  );
}
