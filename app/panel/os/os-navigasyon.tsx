"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MarkaLogosu, type DigerUygulama } from "../panel-navigation";
import { aramaAnahtari, etkinUygulama, mobilAltCubuk, type OsUygulama } from "./os-apps";
import { OsSimge } from "./os-icons";
import "./os-navigasyon.css";

/*
  ETİKETLİ DOCK + UYGULAMALAR PANELİ (10.11.2026, ürün kararı).

  Geçmiş: 2026-10'dan beri altta yüzen YAZISIZ bir dock vardı (ad yalnızca
  fareyle görünüyordu, bölümler fareyle açılan ikinci bir menüdeydi). PR
  #314'ün ilk sürümü onu sürekli bir sol menüyle değiştirdi; ürün kararı
  dock'ta kalmak ve onu geliştirmek oldu. Bu sürüm:

  - Masaüstü: altta ortalı, kompakt dock; ikonun ALTINDA modül adı sürekli
    görünür. Ana ekran + öncelik sırasıyla en fazla üç modül (CRM,
    Operasyon, Finans…; os-apps.ts · mobilAltCubuk) + "Uygulamalar".
  - Telefon: aynı yapı ekranın altına yapışık; son düğmenin adı "Daha fazla".
    En fazla dört ana giriş.
  - Uygulamalar paneli: kişinin bütün yetkili modülleri (bölümleriyle) ve
    lisanslı diğer Arvo ürünleri, ARANABİLİR. Ctrl+K ayrı ve değişmedi.
  - Bölümler (Talepler, Teklifler…) artık içeriğin üstünde
    (os-bolum-menusu.tsx); fareyle açılan ikinci dock ve telefondaki yatay
    kayan şerit kalktı.
  - Hover tek yol değil: her şey bağlantı/düğme, klavye ve dokunmayla aynı.
    Zıplayan/büyüyen ikon ve yoğun cam efekti yok (düz yüzey, ince gölge).

  Liste tek kaynaktan (osUygulamalari) geliyor; burada yetki hesaplanmıyor.
*/

export function OsNavigasyon({ uygulamalar, digerUygulamalar }: {
  uygulamalar: OsUygulama[];
  digerUygulamalar: DigerUygulama[];
}) {
  const yol = usePathname();
  const pencere = useRef<HTMLDialogElement>(null);
  const [arama, setArama] = useState("");

  const etkin = etkinUygulama(uygulamalar, yol);
  const { birincil, digerleri } = mobilAltCubuk(uygulamalar);
  const panelEtkin = Boolean(etkin && digerleri.some((u) => u.key === etkin.key));
  const panelRozeti = digerleri.reduce((t, u) => t + (u.rozet ?? 0), 0);

  const anahtar = aramaAnahtari(arama.trim());
  const bulunanlar = useMemo(() => {
    const eslesir = (metin: string) => !anahtar || aramaAnahtari(metin).includes(anahtar);
    return uygulamalar
      .map((u) => ({ u, bolumler: (u.bolumler ?? []).filter((b) => b.key !== "genel-bakis" && (eslesir(u.label) || eslesir(b.label))) }))
      .filter(({ u, bolumler }) => eslesir(u.label) || bolumler.length > 0);
  }, [uygulamalar, anahtar]);
  const bulunanUrunler = digerUygulamalar.filter((urun) => !anahtar || aramaAnahtari(urun.ad).includes(anahtar));

  const ac = () => {
    setArama("");
    pencere.current?.showModal();
  };
  const kapat = () => pencere.current?.close();

  const rozetMetni = (n: number) => (n > 99 ? "99+" : String(n));

  return (
    <>
      <nav className="os-dock" aria-label="Ana menü">
        {birincil.map((u) => {
          const acik = etkin?.key === u.key;
          return (
            <Link
              key={u.key}
              href={u.href}
              className={acik ? "os-dock-oge is-active" : "os-dock-oge"}
              aria-current={acik ? "page" : undefined}
              aria-label={u.rozet ? `${u.label}, ${u.rozet} okunmamış` : undefined}
            >
              <OsSimge ad={u.ikon} boyut={20} />
              <span className="os-dock-ad">{u.label}</span>
              {u.rozet ? <b className="os-dock-rozet" aria-hidden="true">{rozetMetni(u.rozet)}</b> : null}
            </Link>
          );
        })}
        <button
          type="button"
          className={panelEtkin ? "os-dock-oge is-active" : "os-dock-oge"}
          aria-haspopup="dialog"
          onClick={ac}
          aria-label={panelRozeti ? `Uygulamalar, ${panelRozeti} okunmamış` : undefined}
        >
          <OsSimge ad="apps" boyut={20} />
          {/* Masaüstünde "Uygulamalar", telefonda "Daha fazla" (os-navigasyon.css). */}
          <span className="os-dock-ad"><span className="os-dock-ad-genis">Uygulamalar</span><span className="os-dock-ad-dar">Daha fazla</span></span>
          {panelRozeti ? <b className="os-dock-rozet" aria-hidden="true">{rozetMetni(panelRozeti)}</b> : null}
        </button>
      </nav>

      <dialog
        ref={pencere}
        className="os-uygulamalar"
        aria-labelledby="os-uygulamalar-baslik"
        onClick={(olay) => { if (olay.target === pencere.current) kapat(); }}
      >
        <header className="os-uygulamalar-bas">
          <h2 id="os-uygulamalar-baslik">Uygulamalar</h2>
          <button type="button" className="os-icon-btn" aria-label="Kapat" onClick={kapat}>
            <OsSimge ad="close" boyut={18} />
          </button>
        </header>
        <div className="os-uygulamalar-ara">
          <OsSimge ad="search" boyut={16} />
          <input
            type="search"
            value={arama}
            onChange={(olay) => setArama(olay.target.value)}
            placeholder="Modül ya da bölüm adı"
            aria-label="Uygulamalarda ara"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <div className="os-uygulamalar-govde">
          {bulunanlar.length ? (
            <ul className="os-uygulamalar-liste" aria-label="Modüller">
              {bulunanlar.map(({ u, bolumler }) => {
                const acik = etkin?.key === u.key;
                return (
                  <li key={u.key}>
                    <Link href={u.href} className={acik ? "os-uygulama is-active" : "os-uygulama"} aria-current={acik ? "page" : undefined} onClick={kapat}>
                      <span className="os-uygulama-simge"><OsSimge ad={u.ikon} boyut={20} /></span>
                      <span className="os-uygulama-ad">{u.label}</span>
                      {u.rozet ? <b className="os-dock-rozet os-dock-rozet--satir">{rozetMetni(u.rozet)}<span className="sr-only"> okunmamış</span></b> : null}
                    </Link>
                    {bolumler.length ? (
                      <ul className="os-uygulama-bolumler" aria-label={`${u.label} bölümleri`}>
                        {bolumler.map((b) => (
                          <li key={b.key}><Link href={b.href} onClick={kapat}>{b.label}</Link></li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {bulunanUrunler.length ? (
            <section className="os-uygulamalar-urunler" aria-labelledby="os-uygulamalar-urunler">
              <h3 id="os-uygulamalar-urunler">Diğer Arvo ürünleri</h3>
              <ul className="os-uygulamalar-liste">
                {bulunanUrunler.map((urun) => (
                  <li key={urun.kod}>
                    <a href={urun.href} className="os-uygulama" onClick={kapat} {...(urun.ayniSekme ? {} : { target: "_blank", rel: "noreferrer" })}>
                      <span className="os-uygulama-simge os-uygulama-simge--urun">
                        {urun.marka ? <MarkaLogosu marka={urun.marka} ad="" /> : <i aria-hidden="true">{urun.ad.replace(/^Arvo\s*/, "").slice(0, 1)}</i>}
                      </span>
                      <span className="os-uygulama-ad">{urun.ad}</span>
                      {urun.ayniSekme ? null : <><OsSimge ad="external" boyut={14} /><span className="sr-only"> (yeni sekmede açılır)</span></>}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {!bulunanlar.length && !bulunanUrunler.length ? <p className="os-uygulamalar-bos" role="status">“{arama.trim()}” ile eşleşen uygulama yok.</p> : null}
        </div>
      </dialog>
    </>
  );
}
