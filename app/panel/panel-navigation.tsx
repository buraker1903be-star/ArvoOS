"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { usePathname } from "next/navigation";
import {
  normalizeModuleCode,
  PanelModule,
  resolveGroupHref,
  resolveNavigationGroups,
} from "./panel-navigation-config";

/*
  Kurumun sahip olduğu DİĞER Arvo ürünleri. Panelde bunların hiçbir izi
  yoktu: ArvoLab'ı da alan bir kurum, ürüne nasıl gideceğini bilmiyordu —
  adresi bilen elle yazıyor, bilmeyen "bize ArvoLab verilmemiş" sanıyordu.

  ArvoLab'a geçiş kendi yolundan gidiyor (/panel/uygulama/arvolab): orada
  tek kullanımlık bir oturum bağlantısı üretilip yönlendiriliyor, kişi
  ikinci kez giriş yapmıyor. ArvoARC ve Randevu şimdilik düz bağlantı — onlar
  için böyle bir köprü henüz yok ve olmayan bir kolaylığı varmış gibi
  göstermek, kullanıcıyı şaşırtan bir giriş ekranına çıkarır.

  AÇILIR PENCERE. Uygulamalar menüde düz bir bağlantı listesiydi; şimdi
  "UYGULAMALAR" düğmesi ekranın ORTASINDA bir pencere açıyor ve ürünler
  orada ikon + ad ızgarasında duruyor.

  İki ara sürüm denendi ve bırakıldı:
   - Tam sayfa "Uygulamalar" ekranı: ürünler arası geçiş bir varış noktası
     değil, bir açma hareketi; araya sayfa koymak her geçişe fazladan bir
     tıklama ekliyordu.
   - Menünün yanında hover ile açılan mini ızgara: dar şeridin yanında
     açıldığı için panelin içeriğiyle üst üste biniyor ve arkasındaki
     kartlar okunuyordu; dokunmatikte de hiç açılmıyordu.

  YALNIZCA GİDİLEBİLEN ürünler görünüyor (lisansı açık olanlar). Kapalı
  ürünleri de listeleyen sürüm denendi ve bırakıldı: basılınca hiçbir şey
  açmayan satırlar duruyordu.
*/
export type DigerUygulama = {
  kod: string;
  ad: string;
  href: string;
  ayniSekme: boolean;
  /*
    public/brand/ altındaki marka dosyasının adı. Logosu olan ürün gerçek
    logosuyla, olmayan (Randevu, Kurucu Konsolu) baş harfiyle görünüyor —
    olmayan bir logoyu harfle taklit etmek yerine ayrımı açıkça bırakmak.
  */
  marka?: MarkaKodu;
};

/*
  Logo dosyalarının kendi en-boy oranı ve uzantısı; kırpılmadan sığdırmak
  için. Ürünlerin kelime logosu PNG (tasarımdan geldiği gibi), kurucu
  merkezinin işareti SVG — o bir ürün değil, platformun kendisi ve
  kardeşleri gibi bir kelime logosu yok.
*/
export const MARKA_OLCU = {
  arvoos: { w: 1901, h: 395, uzanti: "png" },
  arvolab: { w: 1920, h: 468, uzanti: "png" },
  arc: { w: 1909, h: 373, uzanti: "png" },
  yonetim: { w: 64, h: 64, uzanti: "svg" },
} as const;
export type MarkaKodu = keyof typeof MARKA_OLCU;

/*
  Logo iki kez çiziliyor, biri CSS ile gizli: markaların koyu zemin için
  ayrı dosyası var (-on-dark) ve panel teması html[data-theme] ile
  değişiyor. Tek dosyayı süzgeçle koyulaştırmak marka kılavuzuna aykırı;
  JavaScript ile seçmek ise tema değişiminde bir kare yanlış logo demek.
*/
function MarkaLogosu({ marka, ad }: { marka: MarkaKodu; ad: string }) {
  const { w, h, uzanti } = MARKA_OLCU[marka];
  return (
    <>
      <Image className="marka-acik" src={`/brand/${marka}.${uzanti}`} alt={ad} width={w} height={h} />
      <Image className="marka-koyu" src={`/brand/${marka}-on-dark.${uzanti}`} alt={ad} width={w} height={h} />
    </>
  );
}

export function PanelNavigation({ modules, role, hiddenModuleKeys, digerUygulamalar = [] }: {
  modules: PanelModule[];
  role?: string;
  hiddenModuleKeys?: string[];
  digerUygulamalar?: DigerUygulama[];
}) {
  const pathname = usePathname();
  const pencere = useRef<HTMLDialogElement>(null);
  const resolved = resolveNavigationGroups(modules, role, new Set(hiddenModuleKeys ?? []));

  return <nav className="panel-nav panel-nav-v2" aria-label="Ana menü">
    <Link className={pathname === "/panel" ? "panel-nav-home active" : "panel-nav-home"} href="/panel" title="Ana Sayfa"><i>⌂</i><span>Ana Sayfa</span></Link>
    <div className="panel-nav-groups">
      {resolved.filter((group) => group.items.length > 0).map((group) => {
        const groupHref = resolveGroupHref(group);
        const active = pathname === groupHref || pathname.startsWith(`${groupHref}/`) || group.items.some((item) => pathname.startsWith(`/panel/${item.code}`));

        if (["crm", "operations"].includes(group.key)) {
          return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href={groupHref} title={group.label}><i>{group.icon}</i><span>{group.label}</span></Link>;
        }

        const visibleItems = group.key === "finance"
          ? group.items.filter((item) => !["accounts", "banking"].includes(normalizeModuleCode(item.code)))
          : group.items;

        // Grubun ana modülü (ör. finance, hr) genel bakış sayfasını açar
        // (resolveGroupHref → preferredHref). Eskiden tek öğeli gruplar
        // doğrudan /panel/<kod>'a gidiyor, Finans ve İK genel bakışı hiç açılmıyordu.
        const itemHref = (code: string) => (normalizeModuleCode(code) === group.key ? groupHref : `/panel/${code}`);

        if (visibleItems.length <= 1) {
          const href = visibleItems[0] ? itemHref(visibleItems[0].code) : groupHref;
          return <Link className={active ? "panel-nav-group-link active" : "panel-nav-group-link"} key={group.key} href={href} title={group.label}><i>{group.icon}</i><span>{group.label}</span></Link>;
        }

        return <details className={active ? "panel-nav-group active" : "panel-nav-group"} key={group.key} open={active}>
          <summary title={group.label}><i>{group.icon}</i><span>{group.label}</span><em>{visibleItems.length}</em></summary>
          <div className="panel-nav-children">
            {visibleItems.map((item) => <Link className={pathname.startsWith(`/panel/${item.code}`) ? "active" : ""} href={itemHref(item.code)} key={item.code}><span>{item.name}</span></Link>)}
          </div>
        </details>;
      })}
    </div>
    {digerUygulamalar.length ? (
      <div className="panel-nav-apps" role="group" aria-label="Diğer uygulamalar">
        <button
          className="panel-nav-apps-head"
          type="button"
          aria-haspopup="dialog"
          title="Arvo uygulamaları"
          onClick={() => pencere.current?.showModal()}
        >
          <em aria-hidden="true">⊞</em>
          <small>UYGULAMALAR</small>
          <span aria-hidden="true">{digerUygulamalar.length}</span>
        </button>
        <dialog
          className="panel-apps-pencere"
          ref={pencere}
          aria-label="Arvo uygulamaları"
          /*
            Pencerenin DIŞINA basınca kapanıyor. dialog elemanının kendisi
            arka planı da kaplıyor, yani hedef dialog ise tıklama içeriğe
            değil boşluğa gelmiştir.
          */
          onClick={(olay) => { if (olay.target === pencere.current) pencere.current?.close(); }}
        >
          <header>
            <b>Arvo uygulamaları</b>
            <button type="button" onClick={() => pencere.current?.close()} aria-label="Kapat">✕</button>
          </header>
          <div className="panel-apps-izgara">
            {digerUygulamalar.map((uygulama) => (
              <a
                key={uygulama.kod}
                href={uygulama.href}
                /* Platform yönetimi bir ürün değil: ızgarada ayrı tonda. */
                data-kod={uygulama.kod}
                title={`${uygulama.ad} uygulamasını aç`}
                onClick={() => pencere.current?.close()}
                {...(uygulama.ayniSekme ? {} : { target: "_blank", rel: "noreferrer" })}
              >
                <span className="panel-apps-simge">
                  {uygulama.marka
                    ? <MarkaLogosu marka={uygulama.marka} ad={uygulama.ad} />
                    : <i aria-hidden="true">{uygulama.ad.replace(/^Arvo\s*/, "").slice(0, 1)}</i>}
                </span>
                <span>{uygulama.ad}</span>
              </a>
            ))}
          </div>
          <footer>Uygulamalar yeni sekmede açılır; paneldeki işiniz açık kalır.</footer>
        </dialog>
      </div>
    ) : null}
    <Link className={pathname.startsWith("/panel/settings") ? "panel-nav-group-link active" : "panel-nav-group-link"} href="/panel/settings" title="Ayarlar"><i>A</i><span>Ayarlar</span></Link>
    {/* Platform yönetimi uygulama panelinden kaldırıldı: kendi alan adında
        (yonetim.arvo-os.com). Aynı kabukta durduğu sürece "şu an hangi kurum
        adına iş yapıyorum" sorusu karışıyordu. */}
  </nav>;
}
