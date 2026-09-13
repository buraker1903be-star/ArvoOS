// /og/{locale}/{id} paylaşım görsellerinin metinleri. Her PageId × dil için
// üst etiket, başlık ve kısa açıklama. Büyük harfler elle yazıldı (JS
// toUpperCase Türkçe "i/İ" dönüşümünü yanlış yapar). Arc: e-ticaret ve
// mağazalar için self servis ürün + sipariş yönetimi (başka iddia yok).
import type { Locale, PageId } from "./routes";

export type OgCopy = { eyebrow: string; title: string; tagline: string };
export type ProductName = "ArvoOS" | "ArvoLab" | "Arc";

export const OG_PRODUCT: Partial<Record<PageId, ProductName>> = {
  arvoos: "ArvoOS",
  "arvoos-modules": "ArvoOS",
  "arvoos-industries": "ArvoOS",
  "arvoos-solutions": "ArvoOS",
  "arvoos-plans": "ArvoOS",
  arvolab: "ArvoLab",
  arc: "Arc",
};

export const OG_COPY: Record<PageId, Record<Locale, OgCopy>> = {
  home: {
    tr: { eyebrow: "ARVO ÜRÜN EKOSİSTEMİ", title: "Daha iyi çalışmak için daha iyi sistemler.", tagline: "Kurumlar, araştırmacılar ve mağazalar için dijital ürünler: ArvoOS, ArvoLab ve Arc." },
    en: { eyebrow: "THE ARVO PRODUCT ECOSYSTEM", title: "Better systems for better work.", tagline: "Software for organizations, researchers and stores: ArvoOS, ArvoLab and Arc." },
  },
  arvoos: {
    tr: { eyebrow: "ARVOOS · İŞLETME İŞLETİM SİSTEMİ", title: "İşletmenizin tamamı. Tek bir akışta.", tagline: "CRM, teklif, e-imzalı sözleşme, operasyon, finans, İK ve raporlama tek sistemde." },
    en: { eyebrow: "ARVOOS · BUSINESS OPERATING SYSTEM", title: "Your whole business. One flow.", tagline: "CRM, proposals, e-signed contracts, operations, finance, HR and reporting in one system." },
  },
  "arvoos-modules": {
    tr: { eyebrow: "ARVOOS · MODÜLLER", title: "Ayrı araçlar değil, birlikte çalışan modüller.", tagline: "CRM ve satış, finans, iş akışları, insan kaynakları, raporlama ve entegrasyonlar." },
    en: { eyebrow: "ARVOOS · MODULES", title: "Not separate tools. Modules that work together.", tagline: "CRM and sales, finance, workflows, human resources, reporting and integrations." },
  },
  "arvoos-industries": {
    tr: { eyebrow: "ARVOOS · SEKTÖRLER", title: "Kurumunuzun çalışma biçimine göre yapılandırılır.", tagline: "Sağlık, eğitim, danışmanlık ve çok şubeli işletmeler için uyarlanabilir yapı." },
    en: { eyebrow: "ARVOOS · INDUSTRIES", title: "Configured around how your organization works.", tagline: "Adaptable to healthcare, education, consulting and multi-branch businesses." },
  },
  "arvoos-solutions": {
    tr: { eyebrow: "ARVOOS · ÇÖZÜMLER", title: "Her darboğaza bağlantılı bir çözüm.", tagline: "Satış, operasyon, finansal kontrol ve kurumsal yönetişim tek akışta." },
    en: { eyebrow: "ARVOOS · SOLUTIONS", title: "A connected answer to every bottleneck.", tagline: "Sales, operations, financial control and governance in a single flow." },
  },
  "arvoos-plans": {
    tr: { eyebrow: "ARVOOS · PAKETLER", title: "İhtiyacınız kadar başlayın, gücünüz kadar büyüyün.", tagline: "Paketler; modüllere, kullanıcı sayısına ve şube yapısına göre birlikte belirlenir." },
    en: { eyebrow: "ARVOOS · PLANS", title: "Start with what you need. Grow as you scale.", tagline: "Plans are shaped together around your modules, users and branch structure." },
  },
  arvolab: {
    tr: { eyebrow: "ARVOLAB · ARAŞTIRMA ÇALIŞMA ALANI", title: "Araştırma için daha güçlü bir alan.", tagline: "Literatür ve atıf, akademik yazım, kılavuz kontrolü, analiz ve özgünlük ön kontrolü." },
    en: { eyebrow: "ARVOLAB · RESEARCH WORKSPACE", title: "A stronger workspace for research.", tagline: "Literature and citations, academic writing, guideline checks, analysis and originality pre-checks." },
  },
  arc: {
    tr: { eyebrow: "ARC · E-TİCARET VE MAĞAZA YÖNETİMİ", title: "Self servis ürün ve sipariş yönetimi.", tagline: "Mağazanızın ürünleri ve siparişleri. Tek, sade bir panelde." },
    en: { eyebrow: "ARC · E-COMMERCE & STORE MANAGEMENT", title: "Self-service product and order management.", tagline: "Your store's products and orders. In one calm panel." },
  },
  services: {
    tr: { eyebrow: "HİZMETLER", title: "Markadan sisteme. Uçtan uca dijital.", tagline: "Web tasarımı, özel yazılım, süreç tasarımı, entegrasyon ve otomasyon." },
    en: { eyebrow: "SERVICES", title: "From brand to system. End-to-end digital.", tagline: "Web design, custom software, process design, integrations and automation." },
  },
  "web-design": {
    tr: { eyebrow: "HİZMETLER · WEB SİTESİ TASARIMI", title: "Markanızın dijitaldeki en güçlü hali.", tagline: "Strateji, UX/UI tasarım, geliştirme ve yayın tek süreçte." },
    en: { eyebrow: "SERVICES · WEB DESIGN", title: "Your brand at its digital best.", tagline: "Strategy, UX/UI design, development and launch in one process." },
  },
  "seo-geo": {
    tr: { eyebrow: "HİZMETLER · SEO VE GEO", title: "Arama motorlarında ve yapay zekâ yanıtlarında anlaşılır olun.", tagline: "Google ile ChatGPT, Perplexity ve Google AI Overviews için içerik düzenleme ve teknik optimizasyon." },
    en: { eyebrow: "SERVICES · SEO & GEO", title: "Be understood by search engines and AI answers.", tagline: "Content editing and technical optimization for Google, ChatGPT, Perplexity and Google AI Overviews." },
  },
  "custom-software": {
    tr: { eyebrow: "HİZMETLER · ÖZEL YAZILIM", title: "Kurumunuzun iş akışına göre yazılım.", tagline: "Panel ve portal geliştirme, entegrasyon ve otomasyon talepleri için kuruma özel çözümler." },
    en: { eyebrow: "SERVICES · CUSTOM SOFTWARE", title: "Software shaped around how you work.", tagline: "Custom panels and portals, integrations and automation built for your organization." },
  },
  about: {
    tr: { eyebrow: "HAKKIMIZDA", title: "Karmaşık işleri sadeleştiriyoruz.", tagline: "ArvoCulture Group — İstanbul'da ürün ve yazılım geliştiren teknoloji şirketi." },
    en: { eyebrow: "ABOUT", title: "We make complex work simple.", tagline: "ArvoCulture Group — a technology company building products and software in İstanbul." },
  },
  contact: {
    tr: { eyebrow: "İLETİŞİM", title: "Birlikte daha iyi bir sistem kuralım.", tagline: "Demo, erişim ve proje talepleri için: info@arvo-os.com" },
    en: { eyebrow: "CONTACT", title: "Let's build a better system together.", tagline: "Demos, access and project requests: info@arvo-os.com" },
  },
  privacy: {
    tr: { eyebrow: "GİZLİLİK", title: "Gizlilik politikası", tagline: "Kişisel verilerin nasıl işlendiğine dair bilgilendirme." },
    en: { eyebrow: "PRIVACY", title: "Privacy policy", tagline: "How personal data is processed." },
  },
};

/** Görsellerde geçen tüm karakterler — Google Fonts'tan tek, küçük bir
 *  alt küme istemek için (Türkçe harfler dahil). */
export function ogCharset(extra: string[] = []): string {
  const all = Object.values(OG_COPY).flatMap((byLocale) => Object.values(byLocale).flatMap((c) => [c.eyebrow, c.title, c.tagline]));
  const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");
  const turkish = "çÇğĞıİöÖşŞüÜâÂîÎûÛ·—–’‘“”…→↗";
  return Array.from(new Set([ascii, turkish, ...all, ...extra].join(""))).sort().join("");
}
