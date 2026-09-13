// "Talepten tahsilata" sahnesinin 7 durumunun arayüz metinleri (gösterim
// amaçlı örnek veri). Sıra: talep → teklif → e-imza → iş akışı → takip
// portalı → online tahsilat → rapor. Ödeme sağlayıcısı adı YAZILMAZ.
import type { Locale } from "@/lib/site/routes";

export const FLOW_COPY = {
  tr: {
    url: "app.arvo-os.com", cap: "Örnek arayüz",
    s0: { title: "Yeni talep", customer: "Kuzey Klinik", source: "Web formu", stages: ["Aday", "Nitelikli", "Teklif", "Kazanıldı"], history: "Müşteri geçmişi", historyVal: "2 teklif · 1 iş", rep: "Satış temsilcisi", repVal: "E. Aydın" },
    s1: { title: "Teklif · TKF-0142", items: [["Web sitesi tasarımı", "₺32.000"], ["İçerik ve SEO", "₺12.500"]], vat: "KDV %20", vatVal: "₺8.900", total: "Genel toplam", totalVal: "₺53.400", plan: "Ödeme planı · 3 taksit", accepted: "Kabul edildi · 14:02" },
    s2: { title: "Hizmet sözleşmesi", consent: ["Sözleşmeyi okudum, onaylıyorum", "Aydınlatma metnini okudum"], signed: "İmzalandı", meta: "Zaman damgası · IP · cihaz · doğrulama özeti" },
    s3: { title: "İş akışı", rows: [["Keşif", "E. Aydın", 0, 28], ["Tasarım", "S. Kaya", 22, 36], ["Geliştirme", "M. Demir", 50, 32], ["Teslim", "E. Aydın", 80, 16]] as [string, string, number, number][], started: "Sözleşme imzalandı · iş akışı başladı" },
    s4: { title: "Takip portalı", code: "TK-4821", progress: "İlerleme", stages: [["Keşif", "done"], ["Uygulama", "now"], ["Teslim", "next"]] as [string, string][], msg: "Tasarım taslağını paylaştık.", reply: "Harika, teşekkürler!" },
    s5: { title: "Tahsilat", rows: [["1. taksit", "Ödendi", "success"], ["2. taksit", "Ödendi", "success"], ["3. taksit", "Bekliyor", "gold"]] as [string, string, string][], link: "Ödeme bağlantısı", locked: "Teslim dosyaları ödeme sonrası açılır" },
    s6: { title: "Raporlar", funnel: [["Talep", 100], ["Teklif", 62], ["Kazanıldı", 38]] as [string, number][], weakest: "En zayıf adım", profit: "Gerçek kârlılık", months: [42, 55, 48, 66, 61, 78] },
  },
  en: {
    url: "app.arvo-os.com", cap: "Illustrative UI",
    s0: { title: "New request", customer: "Northside Clinic", source: "Web form", stages: ["Lead", "Qualified", "Proposal", "Won"], history: "Customer history", historyVal: "2 proposals · 1 job", rep: "Sales rep", repVal: "E. Aydın" },
    s1: { title: "Proposal · TKF-0142", items: [["Website design", "₺32,000"], ["Content & SEO", "₺12,500"]], vat: "VAT 20%", vatVal: "₺8,900", total: "Total", totalVal: "₺53,400", plan: "Payment plan · 3 instalments", accepted: "Accepted · 14:02" },
    s2: { title: "Service agreement", consent: ["I have read and accept the agreement", "I have read the privacy notice"], signed: "Signed", meta: "Timestamp · IP · device · verification hash" },
    s3: { title: "Workflow", rows: [["Discovery", "E. Aydın", 0, 28], ["Design", "S. Kaya", 22, 36], ["Build", "M. Demir", 50, 32], ["Handover", "E. Aydın", 80, 16]] as [string, string, number, number][], started: "Contract signed · workflow started" },
    s4: { title: "Tracking portal", code: "TK-4821", progress: "Progress", stages: [["Discovery", "done"], ["Delivery", "now"], ["Handover", "next"]] as [string, string][], msg: "We’ve shared the design draft.", reply: "Great, thank you!" },
    s5: { title: "Payments", rows: [["Instalment 1", "Paid", "success"], ["Instalment 2", "Paid", "success"], ["Instalment 3", "Due", "gold"]] as [string, string, string][], link: "Payment link", locked: "Deliverables unlock after payment" },
    s6: { title: "Reports", funnel: [["Requests", 100], ["Proposals", 62], ["Won", 38]] as [string, number][], weakest: "Weakest step", profit: "Real profitability", months: [42, 55, 48, 66, 61, 78] },
  },
} satisfies Record<Locale, unknown>;

export type FlowCopy = (typeof FLOW_COPY)["tr"];
