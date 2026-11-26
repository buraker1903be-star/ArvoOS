import Link from "next/link";
import { DONEMLER, type DonemKodu } from "@/lib/konsol/donem";
import "./konsol-donem-secici.css";

/*
  DÖNEM SEÇİCİ (26.11.2026, onaylı mockup).

  Kart bileşenlerinden AYRI dosyada: ürün detayı yalnızca seçiciyi
  kullanıyor ve kartların .dash-* sınıfları o rotaya yüklenmiyor
  (npm run check:css bunu yakalıyor — sınıfı kullanan modül CSS'ini de
  getirmeli). Seçim adreste: sorgu sunucuda, geri tuşu çalışıyor,
  bağlantı paylaşılabiliyor.
*/
export function DonemSecici({ secili, taban }: { secili: DonemKodu; taban: string }) {
  const etiket = DONEMLER.find((d) => d.kod === secili)?.etiket ?? DONEMLER[0].etiket;
  return (
    <details className="os-menu kds-donem">
      <summary className="panel-secondary" aria-label="Dönem seç">{etiket}</summary>
      <div className="os-menu-list" role="menu">
        {DONEMLER.map((d) => (
          <Link key={d.kod} className="os-menu-item" role="menuitem"
            href={`${taban}?donem=${d.kod}`} aria-current={d.kod === secili ? "true" : undefined}>
            {d.etiket}
          </Link>
        ))}
      </div>
    </details>
  );
}
