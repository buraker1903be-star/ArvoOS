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
  de: {
    code: "Tracking · TK-4821", title: "Website-Projekt", progress: "Fortschritt",
    stages: [["Analyse", "done"], ["Umsetzung", "now"], ["Übergabe", "next"]] as const,
    pay: "Zahlungsübersicht", paid: "2 / 3 Raten", cta: "Jetzt bezahlen", locked: "Lieferdateien werden nach Zahlung freigeschaltet",
    tabs: ["Status", "Dokumente", "Nachrichten"],
  },
  es: {
    code: "Seguimiento · TK-4821", title: "Proyecto web", progress: "Progreso",
    stages: [["Descubrimiento", "done"], ["Ejecución", "now"], ["Entrega", "next"]] as const,
    pay: "Resumen de pagos", paid: "2 / 3 cuotas", cta: "Pagar ahora", locked: "Los entregables se desbloquean tras el pago",
    tabs: ["Estado", "Documentos", "Mensajes"],
  },
  fr: {
    code: "Suivi · TK-4821", title: "Projet de site web", progress: "Avancement",
    stages: [["Découverte", "done"], ["Réalisation", "now"], ["Livraison", "next"]] as const,
    pay: "Récapitulatif des paiements", paid: "2 / 3 échéances", cta: "Payer maintenant", locked: "Les livrables se débloquent après paiement",
    tabs: ["Statut", "Documents", "Messages"],
  },
  ar: {
    code: "تتبع · TK-4821", title: "مشروع موقع إلكتروني", progress: "التقدم",
    stages: [["الاستكشاف", "done"], ["التنفيذ", "now"], ["التسليم", "next"]] as const,
    pay: "ملخص الدفعات", paid: "2 / 3 أقساط", cta: "ادفع الآن", locked: "تُتاح ملفات التسليم بعد الدفع",
    tabs: ["الحالة", "المستندات", "الرسائل"],
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
