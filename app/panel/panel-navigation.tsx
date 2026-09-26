"use client";

import Link from "next/link";
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
  ikinci kez giriş yapmıyor. Arc ve Randevu şimdilik düz bağlantı — onlar
  için böyle bir köprü henüz yok ve olmayan bir kolaylığı varmış gibi
  göstermek, kullanıcıyı şaşırtan bir giriş ekranına çıkarır.

  MİNİ IZGARA. Uygulamalar menüde düz bir bağlantı listesiydi; artık
  başlığın üstüne gelince yanda açılan küçük bir ızgarada, ikon ve adıyla
  duruyorlar. Önce tam sayfa bir "Uygulamalar" ekranı denendi ve bırakıldı:
  ürünler arası geçiş bir varış noktası değil, bir açma hareketi — araya
  bir sayfa koymak her geçişe fazladan bir tıklama ekliyordu.

  YALNIZCA GİDİLEBİLEN ürünler görünüyor (lisansı açık olanlar). Kapalı
  ürünleri de listeleyen sürüm denendi ve bırakıldı: menüde basılınca
  hiçbir şey açmayan satırlar duruyordu.

  Açılma CSS ile: :hover ve :focus-within. Klavyeyle gelen kullanıcı
  başlığa sekince ızgara açılıyor ve bağlantılara sekmeyle geçiyor —
  JavaScript'e bağlanan bir menü, sunucu bileşeni olan bu ağaçta ayrı bir
  istemci bileşeni demekti.
*/
export type DigerUygulama = { kod: string; ad: string; href: string; ayniSekme: boolean };

export function PanelNavigation({ modules, role, hiddenModuleKeys, digerUygulamalar = [] }: {
  modules: PanelModule[];
  role?: string;
  hiddenModuleKeys?: string[];
  digerUygulamalar?: DigerUygulama[];
}) {
  const pathname = usePathname();
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
        <button className="panel-nav-apps-head" type="button" aria-haspopup="true" title="Arvo uygulamaları">
          <em aria-hidden="true">⊞</em>
          <small>UYGULAMALAR</small>
          <span aria-hidden="true">{digerUygulamalar.length}</span>
        </button>
        <div className="panel-nav-apps-mini">
          <small>ARVO UYGULAMALARI</small>
          <div>
            {digerUygulamalar.map((uygulama) => (
              <a
                key={uygulama.kod}
                href={uygulama.href}
                title={`${uygulama.ad} uygulamasını aç`}
                {...(uygulama.ayniSekme ? {} : { target: "_blank", rel: "noreferrer" })}
              >
                <i aria-hidden="true">{uygulama.ad.replace(/^Arvo\s*/, "").slice(0, 1)}</i>
                <span>{uygulama.ad}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    ) : null}
    <Link className={pathname.startsWith("/panel/settings") ? "panel-nav-group-link active" : "panel-nav-group-link"} href="/panel/settings" title="Ayarlar"><i>A</i><span>Ayarlar</span></Link>
    {/* Platform yönetimi uygulama panelinden kaldırıldı: kendi alan adında
        (yonetim.arvo-os.com). Aynı kabukta durduğu sürece "şu an hangi kurum
        adına iş yapıyorum" sorusu karışıyordu. */}
  </nav>;
}
