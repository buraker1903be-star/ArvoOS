import Link from "next/link";
import { DONEMLER, type DonemKodu } from "@/lib/konsol/donem";
import { OLCUTLER, type OlcutKodu } from "@/lib/konsol/urun-performansi";
import "./konsol-donem-secici.css";

/*
  DÖNEM SEÇİCİ (26.11.2026, onaylı mockup).

  Kart bileşenlerinden AYRI dosyada: ürün detayı yalnızca seçiciyi
  kullanıyor ve kartların .dash-* sınıfları o rotaya yüklenmiyor
  (npm run check:css bunu yakalıyor — sınıfı kullanan modül CSS'ini de
  getirmeli). Seçim adreste: sorgu sunucuda, geri tuşu çalışıyor,
  bağlantı paylaşılabiliyor.
*/
/** Adrese ikinci parametreyi ekler; biri seçilince öteki kaybolmasın. */
const adres = (taban: string, sorgu: string, ek?: string) => `${taban}?${[sorgu, ek].filter(Boolean).join("&")}`;

export function DonemSecici({ secili, taban, ek }: { secili: DonemKodu; taban: string; ek?: string }) {
  const etiket = DONEMLER.find((d) => d.kod === secili)?.etiket ?? DONEMLER[0].etiket;
  return (
    <details className="os-menu kds-donem">
      <summary className="panel-secondary" aria-label="Dönem seç">{etiket}</summary>
      <div className="os-menu-list" role="menu">
        {DONEMLER.map((d) => (
          <Link key={d.kod} className="os-menu-item" role="menuitem"
            href={adres(taban, `donem=${d.kod}`, ek)} aria-current={d.kod === secili ? "true" : undefined}>
            {d.etiket}
          </Link>
        ))}
      </div>
    </details>
  );
}

/*
  ÖLÇÜT SEÇİCİ (26.11.2026). Dar ekranda tablo yatay kaymıyor; tek ölçüt
  gösteriliyor ve hangisi olduğu buradan seçiliyor. Geniş kartta üç
  ölçüt birden çizildiği için seçici gizleniyor (CSS).
*/
export function OlcutSecici({ secili, taban, ek }: { secili: OlcutKodu; taban: string; ek?: string }) {
  const etiket = OLCUTLER.find((o) => o.kod === secili)?.etiket ?? OLCUTLER[0].etiket;
  return (
    <details className="os-menu kds-donem kds-olcut">
      <summary className="panel-secondary" aria-label="Gösterilecek ölçüt">{etiket}</summary>
      <div className="os-menu-list" role="menu">
        {OLCUTLER.map((o) => (
          <Link key={o.kod} className="os-menu-item" role="menuitem"
            href={adres(taban, `olcut=${o.kod}`, ek)} aria-current={o.kod === secili ? "true" : undefined}>
            {o.etiket}
          </Link>
        ))}
      </div>
    </details>
  );
}
