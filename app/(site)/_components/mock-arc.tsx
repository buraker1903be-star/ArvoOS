// Arc maketi: ürün kataloğu + siparişler (tanımdaki iki temel iş). Ödeme,
// kargo veya entegrasyon öğesi GÖSTERİLMEZ.
import type { Locale } from "@/lib/site/routes";

const T = {
  tr: {
    label: "Arc paneli — örnek görünüm", cap: "Örnek arayüz",
    catalog: "Ürünler", products: ["Seramik kupa", "Keten örtü", "Mum seti", "Ahşap tepsi"],
    orders: "Siparişler", rows: [["#1048", "Yeni", "info"], ["#1047", "Hazırlanıyor", "gold"], ["#1046", "Tamamlandı", "success"]],
  },
  en: {
    label: "Arc panel — sample view", cap: "Illustrative interface",
    catalog: "Products", products: ["Ceramic mug", "Linen throw", "Candle set", "Wooden tray"],
    orders: "Orders", rows: [["#1048", "New", "info"], ["#1047", "Preparing", "gold"], ["#1046", "Completed", "success"]],
  },
} as const;

const SWATCH = ["#e9dcc3", "#cfd6e2", "#e7e1d6", "#d8c3a0"];

export function ArcMock({ locale }: { locale: Locale }) {
  const t = T[locale];
  return (
    <figure className="mock mock-arc" aria-label={t.label}>
      <div className="mock-win" aria-hidden="true">
        <div className="mock-chrome"><i /><i /><i /><span className="mock-url">arc.arvo-os.com</span></div>
        <div className="ma-body">
          <p className="ma-h">{t.catalog}</p>
          <div className="ma-grid">
            {t.products.map((p, i) => <div key={p} className="ma-prod"><span style={{ background: SWATCH[i] }} /><b>{p}</b><small>SKU-{210 + i}</small></div>)}
          </div>
          <p className="ma-h">{t.orders}</p>
          {t.rows.map(([id, s, tone]) => <div key={id} className="ma-row"><b>{id}</b><span className="mo-pill" data-tone={tone}>{s}</span></div>)}
        </div>
      </div>
      <figcaption className="mock-cap">{t.cap}</figcaption>
    </figure>
  );
}
