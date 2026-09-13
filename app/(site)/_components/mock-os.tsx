// ArvoOS panel maketi: gerçek paneldeki gece mavisi kenar çubuğu, iOS tarzı
// widget'lar ve tablolar. Veriler gösterim amaçlıdır (figcaption'da belirtilir).
import type { Locale } from "@/lib/site/routes";
import { BrandLogo } from "./marks";

const T = {
  tr: {
    label: "ArvoOS panel arayüzü — örnek görünüm", cap: "Örnek arayüz · gösterim amaçlı veriler",
    nav: ["Ana Sayfa", "CRM", "Operasyon", "Finans", "İnsan Kaynakları", "Dokümanlar", "Raporlar"],
    hello: "Günaydın", title: "Genel bakış",
    widgets: [["Yeni talep", "12", "info"], ["Teklif bekleyen", "5", "gold"], ["Aktif iş", "18", "brand"], ["Tahsilat bekleyen", "7", "success"]],
    table: "Son teklifler",
    rows: [["Kuzey Klinik", "İmza bekliyor", "gold"], ["Atlas Eğitim", "Onaylandı", "success"], ["Mavi Danışmanlık", "Gönderildi", "info"], ["Ege Tasarım", "Taslak", "neutral"]],
    flow: "İş akışı", steps: [["Keşif", 100], ["Uygulama", 64], ["Teslim", 28]], portal: "Müşteri portalı",
  },
  en: {
    label: "ArvoOS panel interface — sample view", cap: "Illustrative interface · sample data",
    nav: ["Home", "CRM", "Operations", "Finance", "People", "Documents", "Reports"],
    hello: "Good morning", title: "Overview",
    widgets: [["New requests", "12", "info"], ["Awaiting proposal", "5", "gold"], ["Active jobs", "18", "brand"], ["Awaiting payment", "7", "success"]],
    table: "Recent proposals",
    rows: [["Northside Clinic", "Awaiting signature", "gold"], ["Atlas Academy", "Accepted", "success"], ["Blue Consulting", "Sent", "info"], ["Aegean Studio", "Draft", "neutral"]],
    flow: "Job workflow", steps: [["Discovery", 100], ["Delivery", 64], ["Handover", 28]], portal: "Customer portal",
  },
} as const;

export function OsPanelMock({ locale }: { locale: Locale }) {
  const t = T[locale];
  return (
    <figure className="mock" aria-label={t.label}>
      <div className="mock-win" aria-hidden="true">
        <div className="mock-chrome"><i /><i /><i /><span className="mock-url">app.arvo-os.com/panel</span></div>
        <div className="mo-body">
          <div className="mo-side">
            <div className="mo-brand"><BrandLogo brand="arvoos" tone="dark" /></div>
            {t.nav.map((n, i) => <div key={n} className={`mo-nav${i === 0 ? " on" : ""}`}><span>{n.slice(0, 1)}</span>{n}</div>)}
          </div>
          <div className="mo-main">
            <div className="mo-top"><div><small>{t.hello}</small><b>{t.title}</b></div><span className="mo-search" /><span className="mo-avatar" /></div>
            <div className="mo-widgets">
              {t.widgets.map(([k, v, tone]) => <div key={k} className="mo-w" data-tone={tone}><span className="mo-dot" /><small>{k}</small><strong>{v}</strong></div>)}
            </div>
            <div className="mo-grid">
              <div className="mo-card">
                <p className="mo-h">{t.table}</p>
                {t.rows.map(([name, status, tone]) => (
                  <div key={name} className="mo-row"><span className="mo-av">{name.slice(0, 1)}</span><span className="mo-name">{name}</span><span className="mo-pill" data-tone={tone}>{status}</span></div>
                ))}
              </div>
              <div className="mo-card">
                <p className="mo-h">{t.flow}</p>
                {t.steps.map(([s, p]) => <div key={s} className="mo-prog"><span>{s}</span><i><b style={{ width: `${p}%` }} /></i></div>)}
                <div className="mo-bars">{[38, 54, 46, 70, 62, 84, 76].map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</div>
                <p className="mo-portal"><span className="mo-dot" data-tone="success" />{t.portal}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mock-cap">{t.cap}</figcaption>
    </figure>
  );
}
