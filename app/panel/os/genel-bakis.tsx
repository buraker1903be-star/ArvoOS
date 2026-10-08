import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type { GunlukSeri } from "@/lib/gunluk-seri";
import "../dashboard.css";

/*
  GENEL BAKIŞ ŞABLONU (2026-10).

  Kurum sahibinin ana ekran için çizdiği düzen bütün modüllerin genel
  bakış sayfasının şablonu: başlık · tam genişlikte bir grafik kartı ·
  altında yan yana dört liste kartı, her biri en fazla 6 satır ve kendi
  sayfasına bağlantı. Tek ekrana sığar (dashboard.css, .dash-v2).

  Ana ekran (app/panel/page.tsx) ve modül genel bakışları bu parçaları
  kullanır; düzen tek yerde değişir.
*/

export const GENEL_BAKIS_SATIR = 6;

export function GenelBakis({ baslik, ust, eylemler, sekmeler, uyari, children }: {
  baslik: ReactNode;
  /** Başlığın üstündeki küçük etiket (ör. "CRM"); ana ekranda telefonda tarih. */
  ust?: ReactNode;
  eylemler?: ReactNode;
  /** Modülün sekme çubuğu (CrmTabs vb.), başlığın altında. */
  sekmeler?: ReactNode;
  /** Okunamayan veriler için uyarı satırı. */
  uyari?: string[];
  children: ReactNode;
}) {
  return (
    <div className="dash dash-v2">
      <header className="dash-hero">
        <div>
          {ust ? <small className="panel-kicker">{ust}</small> : null}
          <h1>{baslik}</h1>
        </div>
        {eylemler ? <div className="panel-page-actions">{eylemler}</div> : null}
      </header>
      {sekmeler}
      {uyari?.length ? (
        <p className="dash-uyari" data-tone="danger" role="alert">
          <span aria-hidden="true"><Simge ad="alert" /></span>
          <span>
            <b>Bazı veriler okunamadı</b>
            <small>{uyari.join(", ")} yüklenemedi; aşağıdaki listeler eksik olabilir. Sorun sürerse destek kaydı açın.</small>
          </span>
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** Tam genişlikte grafik: son 14 gün çubukları, toplam ve önceki döneme göre değişim. */
export function SeriKarti({ baslik, alt, seri, birim = (n) => String(n), adet, href }: {
  baslik: string;
  alt: string;
  seri: GunlukSeri;
  /** Toplamın ve çubuk etiketinin biçimi (ör. para). */
  birim?: (deger: number) => string;
  /** Çubuk ipucundaki ad: "talep", "tahsilat"… */
  adet: string;
  href?: string;
}) {
  const icerik = (
    <>
      <header className="dash-card-head">
        <div>
          <h2>{baslik}</h2>
          <p>{alt}</p>
        </div>
        <div className="dash-stat">
          <strong>{birim(seri.total)}</strong>
          {seri.delta !== null ? (
            <span data-tone={seri.delta >= 0 ? "success" : "danger"}>{seri.delta >= 0 ? "+" : ""}{seri.delta}% önceki döneme göre</span>
          ) : seri.total ? <span data-tone="neutral">önceki dönemde kayıt yok</span> : null}
        </div>
      </header>
      <div className="dash-bars" role="img" aria-label={`${alt}: toplam ${birim(seri.total)} ${adet}`}>
        {seri.days.map((gun) => (
          <div className={`dash-bar${gun.isToday ? " is-today" : ""}${gun.count ? "" : " is-empty"}`} key={gun.key} title={`${gun.title}: ${birim(gun.count)} ${adet}`}>
            <span className="dash-bar-value">{gun.count ? birim(gun.count) : ""}</span>
            <span className="dash-bar-fill" style={{ "--h": `${gun.count ? Math.max(10, (gun.count / seri.max) * 100) : 4}%` } as CSSProperties} />
            <small>{gun.day}</small>
          </div>
        ))}
      </div>
    </>
  );
  return (
    <article className="dash-card dash-chart">
      {icerik}
      {href ? <Link className="dash-card-link" href={href}>Ayrıntılar <Chevron /></Link> : null}
    </article>
  );
}

/** Dört sütunun ortak kartı: başlık, alt başlık, liste ya da boş durum, alt bağlantı. */
export function ListeKarti({ baslik, alt, bos, href, hrefEtiket, sayi, children }: {
  baslik: string;
  alt: string;
  bos: string;
  href?: string;
  hrefEtiket?: string;
  sayi: number;
  children?: ReactNode;
}) {
  return (
    <article className="dash-card dash-col">
      <header className="dash-card-head"><div><h2>{baslik}</h2><p>{alt}</p></div></header>
      {sayi ? <ul className="dash-col-list">{children}</ul> : <p className="dash-empty">{bos}</p>}
      {href ? <Link className="dash-card-link" href={href}>{hrefEtiket} <Chevron /></Link> : null}
    </article>
  );
}

/** Dört sütunluk ızgara. Kart sayısı azsa kalanlar genişler. */
export function ListeIzgarasi({ children, etiket = "Güncel işler" }: { children: ReactNode; etiket?: string }) {
  return <section className="dash-cols" aria-label={etiket}>{children}</section>;
}

/*
  Liste satırı. "yeni": son birkaç dakikada gelen kayıt kurum renginde
  belirir (anlık tazeleme); "okunmamis": kalın ad ve nokta.
*/
export function ListeSatiri({ href, baslik, baslikIpucu, alt, onizleme, sag, zaman, okunmamis, yeni }: {
  href: string;
  baslik: ReactNode;
  baslikIpucu?: string;
  alt?: ReactNode;
  /** Alt satır bir mesaj önizlemesiyse (tek satıra kırpılır). */
  onizleme?: boolean;
  /** Sağdaki rozet (status-pill) ya da tutar. */
  sag?: ReactNode;
  /** Sağ üstte göreli zaman ("3 gün önce"). */
  zaman?: string;
  okunmamis?: boolean;
  yeni?: boolean;
}) {
  const sinif = [okunmamis ? "is-unread" : "", yeni ? "is-new" : ""].filter(Boolean).join(" ") || undefined;
  return (
    <li className={sinif}>
      <Link className="dash-col-row" href={href}>
        <span className="dash-col-main">
          <b title={baslikIpucu}>{baslik}</b>
          {alt ? <small className={onizleme ? "dash-col-preview" : undefined}>{alt}</small> : null}
        </span>
        {sag}
        {zaman ? <small className="dash-col-time">{zaman}</small> : null}
      </Link>
    </li>
  );
}

const Chevron = () => (
  <svg className="dash-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

function Simge({ ad }: { ad: "alert" }) {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ad === "alert" ? <><path d="M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><path d="M12 17h.01" /></> : null}
    </svg>
  );
}

/** Son 3 dakikadaki kayıt "yeni" sayılır. Saat bileşen gövdesinde okunmaz. */
export const yeniMi = (zaman: string | null | undefined) => Boolean(zaman) && Date.now() - Date.parse(zaman!) < 3 * 60_000;
/** Grafik penceresi: son 28 gün (14 gün + önceki 14 günle kıyas). */
export const seriBaslangici = (gun = 14) => new Date(Date.now() - 2 * gun * 24 * 60 * 60 * 1000).toISOString();
export const simdi = () => Date.now();
