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
  de: {
    url: "app.arvo-os.com", cap: "Beispieloberfläche",
    s0: { title: "Neue Anfrage", customer: "Northside Clinic", source: "Webformular", stages: ["Lead", "Qualifiziert", "Angebot", "Gewonnen"], history: "Kundenhistorie", historyVal: "2 Angebote · 1 Auftrag", rep: "Vertriebsmitarbeiter", repVal: "E. Aydın" },
    s1: { title: "Angebot · TKF-0142", items: [["Website-Design", "₺32.000"], ["Inhalte & SEO", "₺12.500"]], vat: "MwSt. 20 %", vatVal: "₺8.900", total: "Gesamtbetrag", totalVal: "₺53.400", plan: "Zahlungsplan · 3 Raten", accepted: "Angenommen · 14:02" },
    s2: { title: "Dienstleistungsvertrag", consent: ["Ich habe den Vertrag gelesen und akzeptiere ihn", "Ich habe die Datenschutzhinweise gelesen"], signed: "Unterzeichnet", meta: "Zeitstempel · IP · Gerät · Prüf-Hash" },
    s3: { title: "Workflow", rows: [["Analyse", "E. Aydın", 0, 28], ["Design", "S. Kaya", 22, 36], ["Entwicklung", "M. Demir", 50, 32], ["Übergabe", "E. Aydın", 80, 16]] as [string, string, number, number][], started: "Vertrag unterzeichnet · Workflow gestartet" },
    s4: { title: "Tracking-Portal", code: "TK-4821", progress: "Fortschritt", stages: [["Analyse", "done"], ["Umsetzung", "now"], ["Übergabe", "next"]] as [string, string][], msg: "Wir haben den Designentwurf geteilt.", reply: "Super, vielen Dank!" },
    s5: { title: "Zahlungen", rows: [["Rate 1", "Bezahlt", "success"], ["Rate 2", "Bezahlt", "success"], ["Rate 3", "Fällig", "gold"]] as [string, string, string][], link: "Zahlungslink", locked: "Lieferdateien werden nach Zahlung freigeschaltet" },
    s6: { title: "Berichte", funnel: [["Anfragen", 100], ["Angebote", 62], ["Gewonnen", 38]] as [string, number][], weakest: "Schwächster Schritt", profit: "Tatsächliche Rentabilität", months: [42, 55, 48, 66, 61, 78] },
  },
  es: {
    url: "app.arvo-os.com", cap: "Interfaz ilustrativa",
    s0: { title: "Nueva solicitud", customer: "Northside Clinic", source: "Formulario web", stages: ["Lead", "Cualificado", "Propuesta", "Ganado"], history: "Historial del cliente", historyVal: "2 propuestas · 1 trabajo", rep: "Comercial", repVal: "E. Aydın" },
    s1: { title: "Propuesta · TKF-0142", items: [["Diseño web", "₺32.000"], ["Contenido y SEO", "₺12.500"]], vat: "IVA 20 %", vatVal: "₺8.900", total: "Total", totalVal: "₺53.400", plan: "Plan de pagos · 3 cuotas", accepted: "Aceptada · 14:02" },
    s2: { title: "Contrato de servicios", consent: ["He leído y acepto el contrato", "He leído el aviso de privacidad"], signed: "Firmado", meta: "Sello de tiempo · IP · dispositivo · hash de verificación" },
    s3: { title: "Flujo de trabajo", rows: [["Descubrimiento", "E. Aydın", 0, 28], ["Diseño", "S. Kaya", 22, 36], ["Desarrollo", "M. Demir", 50, 32], ["Entrega", "E. Aydın", 80, 16]] as [string, string, number, number][], started: "Contrato firmado · flujo de trabajo iniciado" },
    s4: { title: "Portal de seguimiento", code: "TK-4821", progress: "Progreso", stages: [["Descubrimiento", "done"], ["Ejecución", "now"], ["Entrega", "next"]] as [string, string][], msg: "Hemos compartido el borrador del diseño.", reply: "¡Genial, gracias!" },
    s5: { title: "Cobros", rows: [["Cuota 1", "Pagada", "success"], ["Cuota 2", "Pagada", "success"], ["Cuota 3", "Pendiente", "gold"]] as [string, string, string][], link: "Enlace de pago", locked: "Los entregables se desbloquean tras el pago" },
    s6: { title: "Informes", funnel: [["Solicitudes", 100], ["Propuestas", 62], ["Ganadas", 38]] as [string, number][], weakest: "Paso más débil", profit: "Rentabilidad real", months: [42, 55, 48, 66, 61, 78] },
  },
  fr: {
    url: "app.arvo-os.com", cap: "Interface illustrative",
    s0: { title: "Nouvelle demande", customer: "Northside Clinic", source: "Formulaire web", stages: ["Prospect", "Qualifié", "Proposition", "Gagné"], history: "Historique client", historyVal: "2 propositions · 1 projet", rep: "Commercial", repVal: "E. Aydın" },
    s1: { title: "Proposition · TKF-0142", items: [["Conception de site web", "₺32 000"], ["Contenu et SEO", "₺12 500"]], vat: "TVA 20 %", vatVal: "₺8 900", total: "Total", totalVal: "₺53 400", plan: "Échéancier · 3 versements", accepted: "Acceptée · 14:02" },
    s2: { title: "Contrat de prestation", consent: ["J’ai lu et j’accepte le contrat", "J’ai lu la politique de confidentialité"], signed: "Signé", meta: "Horodatage · IP · appareil · empreinte de vérification" },
    s3: { title: "Flux de travail", rows: [["Découverte", "E. Aydın", 0, 28], ["Design", "S. Kaya", 22, 36], ["Développement", "M. Demir", 50, 32], ["Livraison", "E. Aydın", 80, 16]] as [string, string, number, number][], started: "Contrat signé · flux de travail lancé" },
    s4: { title: "Portail de suivi", code: "TK-4821", progress: "Avancement", stages: [["Découverte", "done"], ["Réalisation", "now"], ["Livraison", "next"]] as [string, string][], msg: "Nous avons partagé la maquette.", reply: "Super, merci !" },
    s5: { title: "Paiements", rows: [["Versement 1", "Payé", "success"], ["Versement 2", "Payé", "success"], ["Versement 3", "À régler", "gold"]] as [string, string, string][], link: "Lien de paiement", locked: "Les livrables se débloquent après paiement" },
    s6: { title: "Rapports", funnel: [["Demandes", 100], ["Propositions", 62], ["Gagnées", 38]] as [string, number][], weakest: "Étape la plus faible", profit: "Rentabilité réelle", months: [42, 55, 48, 66, 61, 78] },
  },
  ar: {
    url: "app.arvo-os.com", cap: "واجهة توضيحية",
    s0: { title: "طلب جديد", customer: "عيادة الشمال", source: "نموذج الموقع", stages: ["عميل محتمل", "مؤهَّل", "عرض سعر", "مكسوب"], history: "سجل العميل", historyVal: "عرضان · عمل واحد", rep: "مندوب المبيعات", repVal: "أ. آيدن" },
    s1: { title: "عرض سعر · TKF-0142", items: [["تصميم الموقع الإلكتروني", "₺32,000"], ["المحتوى وSEO", "₺12,500"]], vat: "ضريبة القيمة المضافة 20%", vatVal: "₺8,900", total: "الإجمالي", totalVal: "₺53,400", plan: "خطة الدفع · 3 أقساط", accepted: "مقبول · 14:02" },
    s2: { title: "اتفاقية خدمات", consent: ["قرأت الاتفاقية وأوافق عليها", "قرأت إشعار الخصوصية"], signed: "موقَّع", meta: "الطابع الزمني · IP · الجهاز · بصمة التحقق" },
    s3: { title: "سير العمل", rows: [["الاستكشاف", "أ. آيدن", 0, 28], ["التصميم", "س. كايا", 22, 36], ["التطوير", "م. دمير", 50, 32], ["التسليم", "أ. آيدن", 80, 16]] as [string, string, number, number][], started: "تم توقيع العقد · بدأ سير العمل" },
    s4: { title: "بوابة التتبع", code: "TK-4821", progress: "التقدم", stages: [["الاستكشاف", "done"], ["التنفيذ", "now"], ["التسليم", "next"]] as [string, string][], msg: "شاركنا مسودة التصميم.", reply: "رائع، شكرًا لكم!" },
    s5: { title: "المدفوعات", rows: [["القسط 1", "مدفوع", "success"], ["القسط 2", "مدفوع", "success"], ["القسط 3", "مستحق", "gold"]] as [string, string, string][], link: "رابط الدفع", locked: "تُتاح ملفات التسليم بعد الدفع" },
    s6: { title: "التقارير", funnel: [["الطلبات", 100], ["العروض", 62], ["المكسوبة", 38]] as [string, number][], weakest: "أضعف خطوة", profit: "الربحية الفعلية", months: [42, 55, 48, 66, 61, 78] },
  },
} satisfies Record<Locale, unknown>;

export type FlowCopy = (typeof FLOW_COPY)["tr"];
