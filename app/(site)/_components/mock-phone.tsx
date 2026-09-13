// Müşteri takip portalı — mobil PWA çerçevesinde (gösterim amaçlı veri).
// Gerçek portal: takip kodu, ilerleme/aşamalar, ödeme özeti, ödemeye bağlı dosyalar.
import type { Locale } from "@/lib/site/routes";

const T = {
  tr: {
    code: "Takip · TK-4821", title: "Web sitesi projesi", progress: "İlerleme",
    stages: [["Keşif", "done"], ["Uygulama", "now"], ["Teslim", "next"]] as const,
    pay: "Ödeme özeti", paid: "2 / 3 taksit", cta: "Şimdi öde", locked: "Teslim dosyaları ödeme sonrası açılır",
    tabs: ["Durum", "Belgeler", "Mesajlar"],
  },
  en: {
    code: "Tracking · TK-4821", title: "Website project", progress: "Progress",
    stages: [["Discovery", "done"], ["Delivery", "now"], ["Handover", "next"]] as const,
    pay: "Payment summary", paid: "2 / 3 instalments", cta: "Pay now", locked: "Deliverables unlock after payment",
    tabs: ["Status", "Documents", "Messages"],
  },
} as const;

export function PhoneFrame({ locale }: { locale: Locale }) {
  const t = T[locale];
  return (
    <div className="phone" aria-hidden="true">
      <div className="phone-screen">
        <span className="ph-notch" />
        <div className="ph-body">
          <span className="ph-code">{t.code}</span>
          <span className="ph-title">{t.title}</span>
          <div className="ph-card">
            <small>{t.progress}</small>
            <div className="ph-bar"><b style={{ width: "64%" }} /></div>
            {t.stages.map(([s, st]) => <div key={s} className="ph-stage" data-s={st}><i />{s}</div>)}
          </div>
          <div className="ph-card">
            <small>{t.pay}</small>
            <div className="ph-pay"><span>{t.paid}</span><span className="ph-btn">{t.cta}</span></div>
          </div>
          <div className="ph-lock"><i />{t.locked}</div>
        </div>
        <div className="ph-tabs">{t.tabs.map((x) => <span key={x}>{x}</span>)}</div>
      </div>
    </div>
  );
}
