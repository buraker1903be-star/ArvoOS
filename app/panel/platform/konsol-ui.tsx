import Link from "next/link";
import type { ReactNode } from "react";
import { MobilSatir, type MobilIsaret } from "../crm/table-cells";
import { SatirTiklama } from "../crm/satir-tiklama";
// Panelin liste ve kart düzeni: sayfa kullandığı sınıfın CSS'ini kendi import eder (AGENTS.md).
import "../crm/crm.css";
import "../crm/kayit-detay/kayit-detay.css";
import "../components/mobil-satir.css";
import "./konsol-ui.css";

/*
  KONSOLUN GÖRÜNÜŞÜ = PANELİN GÖRÜNÜŞÜ (14.10.2026, kurum sahibinin
  tarifi: "bizim ArvoOS panel gibi olmalı").

  Konsol iki tasarım dilinden oluşuyordu: ayarlar ekranının kart dili
  (StgSection — renkli simge kutusu, büyük harfli üst başlık, açıklama
  paragrafı) ve kendi tablo stili (.plt-table). Panelin liste sayfaları
  (talepler, işler, sözleşmeler) ise sade kart + başlık satırı ve
  .talep-tablo .crm-data-table kullanıyor: sabit başlık, satıra tıklama,
  telefonda tek kompakt satır (MobilSatir). Kurucu gün içinde iki kabuk
  arasında gidip geliyor ve iki ayrı ürün görüyordu.

  Bu dosya o dilin konsoldaki karşılığı. Yeni bir konsol ekranı tablo ve
  kart için bunları kullanır; StgSection ve .plt-table'a dönülmez.
*/

/** Panel kartı: başlık satırı (başlık + kısa açıklama + sağda eylem) ve içerik. */
export function KKart({ id, baslik, aciklama, sag, children, sinif }: {
  id?: string;
  baslik: ReactNode;
  aciklama?: ReactNode;
  sag?: ReactNode;
  children?: ReactNode;
  sinif?: string;
}) {
  return (
    <section id={id} className={`panel-card k-kart${sinif ? ` ${sinif}` : ""}`} aria-label={typeof baslik === "string" ? baslik : undefined}>
      <header className="k-kart-bas">
        <div>
          <h2>{baslik}</h2>
          {aciklama ? <p>{aciklama}</p> : null}
        </div>
        {sag ? <div className="k-kart-sag">{sag}</div> : null}
      </header>
      {children}
    </section>
  );
}

export type KKolon = { ad: string; sinif?: string };

/**
 * Panel tablosu. Satırlar <KSatir> ya da elle yazılmış <tr>; ilk hücrede
 * .crm-row-link varsa satırın tamamı tıklanır (SatirTiklama).
 */
export function KTablo({ kolonlar, children }: { kolonlar: KKolon[]; children: ReactNode }) {
  return (
    <div className="talep-tablo k-tablo">
      <table className="crm-data-table" data-cols="konsol">
        <thead><tr>{kolonlar.map((k, i) => <th key={`${k.ad}-${i}`} className={k.sinif}>{k.ad}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      <SatirTiklama />
    </div>
  );
}

/** İlk hücre: başlık (bağlantıysa satırın tamamı tıklanır) ve altında kısa bilgi. */
export function KBaslik({ href, baslik, alt, etiket = "Kayıt" }: { href?: string | null; baslik: string; alt?: ReactNode; etiket?: string }) {
  return (
    <td data-label={etiket}>
      {href
        ? <Link className="crm-row-link" href={href}><span className="crm-table-title" title={baslik}>{baslik}</span></Link>
        : <span className="crm-table-title" title={baslik}>{baslik}</span>}
      {alt ? <span className="crm-table-sub">{alt}</span> : null}
    </td>
  );
}

/** Durum hücresi: panelin durum rozeti. */
export function KDurum({ etiket, ton, ek, baslik = "Durum" }: { etiket: string; ton: string; ek?: ReactNode; baslik?: string }) {
  return <td data-label={baslik}><span className="status-pill" data-tone={ton}>{etiket}</span>{ek}</td>;
}

/** Satırın sonundaki ok ve telefondaki tek görünüm. */
export function KSatirSonu({ mobil }: {
  mobil: { href?: string | null; baslik: string; durum?: { etiket: string; ton: string } | null; alt?: (string | null | undefined | false)[]; isaretler?: (MobilIsaret | null | undefined | false)[] };
}) {
  return <>
    <td className="crm-table-actions"><span className="crm-row-chevron" aria-hidden="true">›</span></td>
    <MobilSatir {...mobil} />
  </>;
}

/** Boş liste: panelin boş durum kutusu. */
export function KBos({ baslik, aciklama, eylem }: { baslik: string; aciklama?: string; eylem?: ReactNode }) {
  return (
    <div className="crm-empty-state talep-bos-kutu k-bos">
      <h2>{baslik}</h2>
      {aciklama ? <p>{aciklama}</p> : null}
      {eylem ? <div className="crm-empty-actions">{eylem}</div> : null}
    </div>
  );
}

/** Kartın içindeki uyarı satırı (banner yerine sade not). */
export function KNot({ ton = "bilgi", children }: { ton?: "bilgi" | "uyari" | "tehlike" | "basari"; children: ReactNode }) {
  return <p className="k-not" data-ton={ton}>{children}</p>;
}
