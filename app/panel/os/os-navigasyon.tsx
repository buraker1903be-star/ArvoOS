"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { MarkaLogosu, type DigerUygulama } from "../panel-navigation";
import { aramaAnahtari, etkinUygulama, mobilAltCubuk, type OsUygulama } from "./os-apps";
import { OsSimge } from "./os-icons";
import { masaustuAbone, masaustuMu, yanMenuAbone, yanMenuDarMi, yanMenuTercihiniUygula } from "./gezinme-istemci";
import { ArvoOsIsareti, ArvoOsLogosu } from "./arvoos-markasi";
import "./os-navigasyon.css";
import "./os-yanmenu.css";

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

/*
  Sunucuda tercih ve ekran genişliği bilinmiyor; ilk çizim "açık" ve
  "masaüstü değil" der, istemci hemen gerçeğine geçer. Görünümü CSS
  belirlediği için bu fark ekranda görünmez — yalnızca daralt
  düğmesinin etiketi ve varlığı buna bakar.
*/
const sunucuDar = () => false;
const sunucuMasaustu = () => false;

export function OsNavigasyon({ uygulamalar, digerUygulamalar, yanMenu = false, yanMenuSirasi, marka }: {
  uygulamalar: OsUygulama[];
  digerUygulamalar: DigerUygulama[];
  /**
   * Masaüstü/tablette altta dock yerine SOL MENÜ (kurucu konsolu).
   * Telefon her iki durumda da alt çubuk kullanır; liste, rota, yetki
   * ve rozetler tek kaynaktan — üç biçim aynı `uygulamalar` dizisini
   * okur (26.11.2026, onaylı mockup).
   */
  yanMenu?: boolean;
  /** Sol menüdeki birincil sıra (anahtarlar); verilmezse liste sırası. */
  yanMenuSirasi?: string[];
  /** Sol menünün tepesinde resmî ArvoOS markası (logo/işaret). */
  marka?: boolean;
}) {
  const yol = usePathname();
  const pencere = useRef<HTMLDialogElement>(null);
  const [arama, setArama] = useState("");
  /*
    Uygulamalar PENCERESİ açık mı. Sol menüde düğmenin vurgusu buna
    bakıyor; dock'ta rotaya bakmaya devam ediyor (aşağıdaki not).
  */
  const [pencereAcik, setPencereAcik] = useState(false);

  const etkin = etkinUygulama(uygulamalar, yol);
  const { birincil, digerleri } = mobilAltCubuk(uygulamalar);
  /*
    DOCK'un "Uygulamalar" düğmesi: dock yalnızca ilk dört girişi
    gösteriyor, o yüzden etkin uygulama dışarıda kaldığında düğme
    "burayı buradan açtın" demek için vurgulanıyor. SOL MENÜ'de bu
    yanlış: orada beş birincil giriş var ve ürün detayında "Ürünler"
    ile "Uygulamalar" AYNI ANDA seçili görünüyordu (26.11.2026,
    inceleme bulgusu). Sol menü kendi kuralını YanMenu'de kuruyor.
  */
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
    setPencereAcik(true);
    pencere.current?.showModal();
  };
  const kapat = () => pencere.current?.close();

  const rozetMetni = (n: number) => (n > 99 ? "99+" : String(n));

  return (
    <>
      {yanMenu ? (
        <YanMenu
          uygulamalar={uygulamalar}
          sira={yanMenuSirasi}
          etkinKey={etkin?.key}
          pencereAcik={pencereAcik}
          panelRozeti={panelRozeti}
          ac={ac}
          marka={marka}
          rozetMetni={rozetMetni}
        />
      ) : null}
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
        /* close(), Esc ve zemine tıklama: üçü de "close" olayını veriyor,
           tek yerden dinlemek üçünü birden kapsıyor. */
        onClose={() => setPencereAcik(false)}
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

/*
  SOL MENÜ (masaüstü 240 px · tablet 64 px ray), onaylı mockup.

  Kaynak yapı ArvoLab'ın çalışan kabuğundan (app/dashboard/_components/os-gezinme.tsx
  + app/styles/os-shell.css, canlı commit b3fab7a4): üstte marka, ortada
  liste, altta ikincil bölüm ve daralt düğmesi. Liste, rota, yetki ve
  rozet verisi DOCK İLE AYNI diziden gelir — üç ekran boyutu tek
  kaynaktan beslenir.

  Ray (tablet) ve dar masaüstü aynı görünümü kullanır: yalnızca ikon,
  ad `title` ve `aria-label` olarak kalır. Erişilebilir ad hiçbir
  biçimde kaybolmaz; rozetler görünür durur.
*/
function YanMenu({ uygulamalar, sira, etkinKey, pencereAcik, panelRozeti, ac, marka, rozetMetni }: {
  uygulamalar: OsUygulama[];
  sira?: string[];
  etkinKey?: string;
  /** Uygulamalar penceresi açık mı; düğmenin vurgusu buna bakıyor. */
  pencereAcik: boolean;
  panelRozeti: number;
  ac: () => void;
  /** Menünün tepesinde resmî ArvoOS markası çizilsin mi. */
  marka?: boolean;
  rozetMetni: (n: number) => string;
}) {
  const dar = useSyncExternalStore(yanMenuAbone, yanMenuDarMi, sunucuDar);
  const masaustu = useSyncExternalStore(masaustuAbone, masaustuMu, sunucuMasaustu);

  /* Birincil sıra mockup'tan; listede olmayan anahtar atlanır, sırada
     olmayan uygulama "Uygulamalar" penceresinde kalır (yetki süzgeci
     zaten listeyi kısaltmış olabilir). */
  const birincilMenu = sira
    ? sira.map((k) => uygulamalar.find((u) => u.key === k)).filter((u): u is OsUygulama => Boolean(u))
    : uygulamalar.filter((u) => !u.yalnizBaslatici);

  return (
    <nav className="os-yan" aria-label="Konsol menüsü" data-dar={dar ? "evet" : undefined}>
      {marka ? (
        <Link className="os-yan-marka" href="/panel" aria-label="ArvoOS ana ekran">
          {/*
            İKİ BİÇİM BİRDEN ÇİZİLİR, HANGİSİNİN GÖRÜNECEĞİNE CSS KARAR
            VERİR (26.11.2026). Açık menüde resmî KELİME LOGOSU, dar
            menüde ve tablet rayında resmî İŞARET. JavaScript ile
            seçmek menü daraltılırken bir kare yanlış logo demek; aynı
            gerekçe açık/koyu varyantında da geçerli (panel-navigation).
          */}
          <span className="os-yan-logo"><ArvoOsLogosu /></span>
          <span className="os-yan-isaret"><ArvoOsIsareti /></span>
        </Link>
      ) : null}

      <ul className="os-yan-liste">
        {birincilMenu.map((u) => {
          const acik = etkinKey === u.key;
          const etiket = u.rozet ? `${u.label}, ${u.rozet} bekleyen` : u.label;
          return (
            <li key={u.key}>
              <Link
                href={u.href}
                className={acik ? "os-yan-oge is-active" : "os-yan-oge"}
                aria-current={acik ? "page" : undefined}
                aria-label={etiket}
                title={u.kisaEtiket ?? u.label}
              >
                <span className="os-yan-simge"><OsSimge ad={u.ikon} boyut={20} /></span>
                <span className="os-yan-etiket">{u.kisaEtiket ?? u.label}</span>
                {u.rozet ? <b className="os-yan-rozet" aria-hidden="true">{rozetMetni(u.rozet)}</b> : null}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="os-yan-alt">
        {/* İkincil bölüm: bütün uygulamalar ve diğer Arvo ürünleri aynı
            pencereden (dock'takiyle tek bileşen, tek liste). */}
        {/*
          VURGU PENCEREYE BAĞLI, ROTAYA DEĞİL. "Uygulamalar" bir sayfa
          değil, bir pencere açıyor: rotaya bağlanınca birincil listede
          duran bir uygulamada (ürün detayı → Ürünler) iki öğe birden
          seçili görünüyordu. Durum artık YALNIZCA aria-expanded'da ve
          görünümü de oradan geliyor (os-yanmenu.css): is-active etkin
          SAYFAYI işaretliyor, pencere durumu ondan ayrı okunmalı.
          Birincil listede hiç karşılığı olmayan bir rotada da vurgu yok;
          yanlış yeri işaretlemek yerine hiçbir yeri işaretlemiyor.
        */}
        <button
          type="button"
          className="os-yan-oge"
          aria-haspopup="dialog"
          aria-expanded={pencereAcik}
          onClick={ac}
          aria-label={panelRozeti ? `Uygulamalar, ${panelRozeti} bekleyen` : "Uygulamalar"}
          title="Uygulamalar"
        >
          <span className="os-yan-simge"><OsSimge ad="apps" boyut={20} /></span>
          <span className="os-yan-etiket">Uygulamalar</span>
          {panelRozeti ? <b className="os-yan-rozet" aria-hidden="true">{rozetMetni(panelRozeti)}</b> : null}
        </button>

        {/* Daralt/genişlet yalnızca masaüstünde: tablette ray zaten dar,
            orada düğme tercihi değiştirir ama ekranda hiçbir şey olmaz. */}
        {masaustu ? (
          <button
            type="button"
            className="os-yan-daralt"
            onClick={() => yanMenuTercihiniUygula(!dar)}
            aria-pressed={dar}
            title={dar ? "Menüyü genişlet" : "Menüyü daralt"}
          >
            <span className="os-yan-simge" aria-hidden="true"><OsSimge ad={dar ? "chevron-right" : "chevron-left"} boyut={18} /></span>
            <span className="os-yan-etiket">{dar ? "Menüyü genişlet" : "Menüyü daralt"}</span>
          </button>
        ) : null}
      </div>
    </nav>
  );
}
