"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { MarkaLogosu, type DigerUygulama } from "../panel-navigation";
import { aramaAnahtari, etkinUygulama, mobilAltCubuk, type OsUygulama } from "./os-apps";
import { etkinBolum } from "./os-bolumler";
import { OsSimge } from "./os-icons";
import { masaustuAbone, masaustuMu, yanMenuAbone, yanMenuDarMi, yanMenuTercihiniUygula } from "./gezinme-istemci";
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

export function OsNavigasyon({ uygulamalar, digerUygulamalar, yanMenu = false, yanMenuSirasi }: {
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
          etkin={etkin ?? undefined}
          pencereAcik={pencereAcik}
          panelRozeti={panelRozeti}
          ac={ac}
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
function YanMenu({ uygulamalar, sira, etkin, pencereAcik, panelRozeti, ac, rozetMetni }: {
  uygulamalar: OsUygulama[];
  sira?: string[];
  /** Rotadan çözülen etkin uygulama; alt menü de ondan geliyor. */
  etkin?: OsUygulama;
  /** Uygulamalar penceresi açık mı; düğmenin vurgusu buna bakıyor. */
  pencereAcik: boolean;
  panelRozeti: number;
  ac: () => void;

  rozetMetni: (n: number) => string;
}) {
  const dar = useSyncExternalStore(yanMenuAbone, yanMenuDarMi, sunucuDar);
  const masaustu = useSyncExternalStore(masaustuAbone, masaustuMu, sunucuMasaustu);
  const yol = usePathname();
  const sorgu = useSearchParams();
  const etkinKey = etkin?.key;

  /*
    İKİ KATLI MENÜ (26.11.2026, onaylı mockup). Bir modüle girince AYNI
    240 px'lik panelde ana liste yerini o modülün bölümlerine bırakıyor;
    başında "Ana menüye dön" var. Eskiden bölümler yalnızca içeriğin
    üstündeki yatay şeritteydi ve sol menü hangi modülün içinde
    olduğunu söylemekle yetiniyordu — kurucunun gözü iki ayrı yere
    bakıyordu.

    Geri dönüş bir DÜĞME, bağlantı değil: adres, içerik, süzgeçler ve
    tarayıcı geçmişi olduğu gibi kalmalı. Kapalı tutma isteği
    MODÜLE bağlı (altKapali = o modülün anahtarı): başka bir modüle
    geçince alt menü yeniden açılıyor, aynı modüle geri dönünce
    kullanıcının kararı duruyor.

    RAY GÖRÜNÜMÜNDE (tablet ve daraltılmış masaüstü) iki kat YOK:
    64 px'te yalnızca ikon çiziliyor, bölümlerin ikonu yok ve ad
    gizlenince satırlar birbirinden ayırt edilemezdi. Orada bölümler
    içeriğin üstündeki şeritte kalıyor (os-bolum-menusu.tsx); şerit
    yalnızca alt menünün göründüğü genişlikte gizleniyor
    (os-yanmenu.css).
  */
  const genis = masaustu && !dar;
  const bolumler = etkin?.bolumler ?? [];
  const [altKapali, setAltKapali] = useState<string | null>(null);
  const altAcik = genis && bolumler.length >= 2 && altKapali !== etkinKey;
  const etkinBolumKey = altAcik ? etkinBolum(bolumler, yol, sorgu.toString())?.key : undefined;

  /*
    ODAK KAYBOLMASIN: modüle girince odak "Ana menüye dön"e, geri
    dönünce girilen modülün satırına taşınıyor. Panel yerinde değişiyor;
    odak eski düğmede kalsaydı klavye kullanıcısı listenin başına
    dönmek zorunda kalırdı. İstek ref'te tutuluyor — doğrudan bağlantıyla
    ya da yenilemeyle gelen kullanıcının odağı ÇALINMASIN.
  */
  const odakIstegi = useRef<"geri" | "modul" | null>(null);
  const geriRef = useRef<HTMLButtonElement>(null);
  const kokRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const istek = odakIstegi.current;
    if (!istek) return;
    odakIstegi.current = null;
    const hedef = istek === "geri"
      ? geriRef.current
      : kokRef.current?.querySelector<HTMLElement>(`[data-modul="${etkinKey ?? ""}"]`);
    hedef?.focus();
  }, [altAcik, etkinKey]);

  /* Birincil sıra mockup'tan; listede olmayan anahtar atlanır, sırada
     olmayan uygulama "Uygulamalar" penceresinde kalır (yetki süzgeci
     zaten listeyi kısaltmış olabilir). */
  const birincilMenu = sira
    ? sira.map((k) => uygulamalar.find((u) => u.key === k)).filter((u): u is OsUygulama => Boolean(u))
    : uygulamalar.filter((u) => !u.yalnizBaslatici);

  return (
    <nav ref={kokRef} className="os-yan" aria-label="Konsol menüsü" data-dar={dar ? "evet" : undefined} data-kat={altAcik ? "alt" : "ana"}>

      {altAcik && etkin ? (
        <div className="os-yan-kat">
          <button
            ref={geriRef}
            type="button"
            className="os-yan-geri"
            onClick={() => { odakIstegi.current = "modul"; setAltKapali(etkinKey ?? null); }}
          >
            <span className="os-yan-simge" aria-hidden="true"><OsSimge ad="chevron-left" boyut={18} /></span>
            <span className="os-yan-etiket">Ana menüye dön</span>
          </button>
          {/* Hangi modülün içindeyiz: başlık listenin erişilebilir adı
              da oluyor (aria-labelledby), yoksa ekran okuyucuda iki
              "Konsol menüsü" listesi ayırt edilemiyordu. */}
          <p className="os-yan-modul" id="os-yan-modul-adi">
            <span className="os-yan-simge" aria-hidden="true"><OsSimge ad={etkin.ikon} boyut={20} /></span>
            <span className="os-yan-etiket">{etkin.kisaEtiket ?? etkin.label}</span>
          </p>
          <ul className="os-yan-liste" aria-labelledby="os-yan-modul-adi">
            {bolumler.map((b) => {
              const acik = etkinBolumKey === b.key;
              return (
                <li key={b.key}>
                  <Link
                    href={b.href}
                    className={acik ? "os-yan-oge is-active" : "os-yan-oge"}
                    aria-current={acik ? "page" : undefined}
                    title={b.label}
                  >
                    <span className="os-yan-etiket">{b.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <ul className="os-yan-liste">
          {birincilMenu.map((u) => {
            const acik = etkinKey === u.key;
            const etiket = u.rozet ? `${u.label}, ${u.rozet} bekleyen` : u.label;
            /* Bölümü olan modül alt menüyü AÇAR: tıklanınca odak "Ana
               menüye dön"e geçsin diye istek burada konuyor. */
            const altiVar = (u.bolumler?.length ?? 0) >= 2;
            return (
              <li key={u.key}>
                <Link
                  href={u.href}
                  data-modul={u.key}
                  className={acik ? "os-yan-oge is-active" : "os-yan-oge"}
                  aria-current={acik ? "page" : undefined}
                  aria-label={etiket}
                  title={u.kisaEtiket ?? u.label}
                  onClick={() => {
                    setAltKapali(null);
                    if (altiVar && genis) odakIstegi.current = "geri";
                  }}
                >
                  <span className="os-yan-simge"><OsSimge ad={u.ikon} boyut={20} /></span>
                  <span className="os-yan-etiket">{u.kisaEtiket ?? u.label}</span>
                  {u.rozet ? <b className="os-yan-rozet" aria-hidden="true">{rozetMetni(u.rozet)}</b> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

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
