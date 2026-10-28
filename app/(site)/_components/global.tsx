// Global düzenin ortak parçaları (28.10.2026): açılış rozetleri, "her
// yerde çalışır" şeridi ve başlangıç fiyatı yazısı. Ana sayfa, ürün
// sayfaları ve ücretler sayfası aynı parçaları kullanıyor.
import { baslangicFiyati, paraYaz } from "@/lib/site/doviz";
import type { Fiyatlar } from "@/lib/site/fiyat-kaynagi";
import type { SiteProduct } from "@/lib/site/pricing";
import type { Locale } from "@/lib/site/routes";
import type { HomeContent } from "../_content/home";
import { Ikon } from "./marks";
import { SectionHead } from "./ui";

type Global = HomeContent["global"];
const ROZET_IKONU = ["globe", "currency", "devices"] as const;
const SERIT_IKONU = ["globe", "currency", "devices", "shield"] as const;

export function HeroBadges({ items, style }: { items: Global["badges"]; style?: React.CSSProperties }) {
  return (
    <ul className="hero-badges rise" style={style}>
      {items.map((b, i) => <li key={b}><Ikon ad={ROZET_IKONU[i]} />{b}</li>)}
    </ul>
  );
}

export function GlobalStrip({ g, id = "global-title" }: { g: Global; id?: string }) {
  return (
    <section className="section-s gstrip" aria-labelledby={id}>
      <div className="wrap">
        <SectionHead eyebrow={g.eyebrow} title={g.title} lead={g.lead} center id={id} />
        <ul className="gstrip-grid">
          {g.items.map((x, i) => (
            <li key={x.title} className="gstrip-item" data-reveal style={{ ["--i" as string]: i }}>
              <span className="gstrip-icon"><Ikon ad={SERIT_IKONU[i]} /></span>
              <h3>{x.title}</h3>
              <p>{x.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** "From $59/mo" · "Başlangıç: 1.990 TL/ay" · rakam yoksa "Teklif usulü". */
export function baslangicYazisi(urun: SiteProduct, locale: Locale, g: Global, fiyatlar?: Fiyatlar): string {
  const f = baslangicFiyati(urun, locale, fiyatlar);
  if (!f) return g.onRequest;
  return g.from.replace("{price}", paraYaz(f.tutar, locale)) + (f.kisiBasi ? g.perUserMonth : g.perMonth);
}
