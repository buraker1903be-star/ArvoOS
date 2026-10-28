// /og/{locale}/{id} paylaşım görsellerinin metinleri. Her PageId × dil için
// üst etiket, başlık ve kısa açıklama. Büyük harfler elle yazıldı (JS
// toUpperCase Türkçe "i/İ" dönüşümünü yanlış yapar).
import type { Locale, PageId } from "./routes";

export type OgCopy = { eyebrow: string; title: string; tagline: string };
export type ProductName = "ArvoOS" | "ArvoLab" | "ArvoBook";

export const OG_PRODUCT: Partial<Record<PageId, ProductName>> = {
  arvoos: "ArvoOS",
  "arvoos-modules": "ArvoOS",
  "arvoos-industries": "ArvoOS",
  "arvoos-solutions": "ArvoOS",
  "arvoos-plans": "ArvoOS",
  arvolab: "ArvoLab",
  randevu: "ArvoBook",
};

export const OG_COPY: Record<PageId, Record<Locale, OgCopy>> = {
  home: {
    tr: { eyebrow: "ARVO ÜRÜN EKOSİSTEMİ", title: "Daha iyi çalışmak için daha iyi sistemler.", tagline: "Kurumlar, araştırmacılar ve salonlar için dijital ürünler: ArvoOS, ArvoLab ve ArvoBook." },
    en: { eyebrow: "THE ARVO PRODUCT ECOSYSTEM", title: "Better systems for better work.", tagline: "Software for organizations, researchers and salons: ArvoOS, ArvoLab and ArvoBook." },
    de: { eyebrow: "DAS ARVO-PRODUKTÖKOSYSTEM", title: "Bessere Systeme für bessere Arbeit.", tagline: "Software für Organisationen, Forschende und Salons: ArvoOS, ArvoLab und ArvoBook." },
    es: { eyebrow: "EL ECOSISTEMA DE PRODUCTOS ARVO", title: "Mejores sistemas para un mejor trabajo.", tagline: "Software para organizaciones, investigadores y salones: ArvoOS, ArvoLab y ArvoBook." },
    fr: { eyebrow: "L’ÉCOSYSTÈME DE PRODUITS ARVO", title: "De meilleurs systèmes pour un meilleur travail.", tagline: "Des logiciels pour les organisations, les chercheurs et les salons : ArvoOS, ArvoLab et ArvoBook." },
    ar: { eyebrow: "منظومة منتجات ARVO", title: "أنظمة أفضل لعمل أفضل.", tagline: "برمجيات للمؤسسات والباحثين والصالونات: ArvoOS وArvoLab وArvoBook." },
  },
  arvoos: {
    tr: { eyebrow: "ARVOOS · İŞLETME İŞLETİM SİSTEMİ", title: "İşletmenizin tamamı. Tek bir akışta.", tagline: "CRM, teklif, e-imzalı sözleşme, operasyon, finans, İK ve raporlama tek sistemde." },
    en: { eyebrow: "ARVOOS · BUSINESS OPERATING SYSTEM", title: "Your whole business. One flow.", tagline: "CRM, proposals, e-signed contracts, operations, finance, HR and reporting in one system." },
    de: { eyebrow: "ARVOOS · BETRIEBSSYSTEM FÜR UNTERNEHMEN", title: "Ihr ganzes Unternehmen. Ein Ablauf.", tagline: "CRM, Angebote, e-signierte Verträge, Betrieb, Finanzen, Personal und Reporting in einem System." },
    es: { eyebrow: "ARVOOS · SISTEMA OPERATIVO PARA EMPRESAS", title: "Toda su empresa. Un solo flujo.", tagline: "CRM, propuestas, contratos con firma electrónica, operaciones, finanzas, RR. HH. e informes en un solo sistema." },
    fr: { eyebrow: "ARVOOS · SYSTÈME D’EXPLOITATION D’ENTREPRISE", title: "Toute votre entreprise. Un seul flux.", tagline: "CRM, propositions, contrats signés électroniquement, opérations, finances, RH et reporting dans un seul système." },
    ar: { eyebrow: "ARVOOS · نظام تشغيل للأعمال", title: "أعمالك كلها. في مسار واحد.", tagline: "CRM والعروض والعقود الموقعة إلكترونيًا والعمليات والمالية والموارد البشرية والتقارير في نظام واحد." },
  },
  "arvoos-modules": {
    tr: { eyebrow: "ARVOOS · MODÜLLER", title: "Ayrı araçlar değil, birlikte çalışan modüller.", tagline: "CRM ve satış, finans, iş akışları, insan kaynakları, raporlama ve entegrasyonlar." },
    en: { eyebrow: "ARVOOS · MODULES", title: "Not separate tools. Modules that work together.", tagline: "CRM and sales, finance, workflows, human resources, reporting and integrations." },
    de: { eyebrow: "ARVOOS · MODULE", title: "Keine getrennten Tools. Module, die zusammenarbeiten.", tagline: "CRM und Vertrieb, Finanzen, Workflows, Personalwesen, Reporting und Integrationen." },
    es: { eyebrow: "ARVOOS · MÓDULOS", title: "No son herramientas separadas. Son módulos que trabajan juntos.", tagline: "CRM y ventas, finanzas, flujos de trabajo, recursos humanos, informes e integraciones." },
    fr: { eyebrow: "ARVOOS · MODULES", title: "Pas des outils séparés. Des modules qui fonctionnent ensemble.", tagline: "CRM et ventes, finances, flux de travail, ressources humaines, reporting et intégrations." },
    ar: { eyebrow: "ARVOOS · الوحدات", title: "لا أدوات منفصلة، بل وحدات تعمل معًا.", tagline: "CRM والمبيعات، والمالية، وسير العمل، والموارد البشرية، والتقارير، والتكاملات." },
  },
  "arvoos-industries": {
    tr: { eyebrow: "ARVOOS · SEKTÖRLER", title: "Kurumunuzun çalışma biçimine göre yapılandırılır.", tagline: "Sağlık, eğitim, danışmanlık ve çok şubeli işletmeler için uyarlanabilir yapı." },
    en: { eyebrow: "ARVOOS · INDUSTRIES", title: "Configured around how your organization works.", tagline: "Adaptable to healthcare, education, consulting and multi-branch businesses." },
    de: { eyebrow: "ARVOOS · BRANCHEN", title: "Konfiguriert nach der Arbeitsweise Ihrer Organisation.", tagline: "Anpassbar für Gesundheitswesen, Bildung, Beratung und Unternehmen mit mehreren Standorten." },
    es: { eyebrow: "ARVOOS · SECTORES", title: "Configurado en torno a cómo trabaja su organización.", tagline: "Adaptable a salud, educación, consultoría y empresas con varias sucursales." },
    fr: { eyebrow: "ARVOOS · SECTEURS", title: "Configuré selon le fonctionnement de votre organisation.", tagline: "Adaptable à la santé, l’éducation, le conseil et les entreprises multisites." },
    ar: { eyebrow: "ARVOOS · القطاعات", title: "يُهيَّأ وفق طريقة عمل مؤسستك.", tagline: "قابل للتكيّف مع الرعاية الصحية والتعليم والاستشارات والشركات متعددة الفروع." },
  },
  "arvoos-solutions": {
    tr: { eyebrow: "ARVOOS · ÇÖZÜMLER", title: "Her darboğaza bağlantılı bir çözüm.", tagline: "Satış, operasyon, finansal kontrol ve kurumsal yönetişim tek akışta." },
    en: { eyebrow: "ARVOOS · SOLUTIONS", title: "A connected answer to every bottleneck.", tagline: "Sales, operations, financial control and governance in a single flow." },
    de: { eyebrow: "ARVOOS · LÖSUNGEN", title: "Eine vernetzte Antwort auf jeden Engpass.", tagline: "Vertrieb, Betrieb, Finanzkontrolle und Governance in einem einzigen Ablauf." },
    es: { eyebrow: "ARVOOS · SOLUCIONES", title: "Una respuesta conectada a cada cuello de botella.", tagline: "Ventas, operaciones, control financiero y gobernanza en un único flujo." },
    fr: { eyebrow: "ARVOOS · SOLUTIONS", title: "Une réponse connectée à chaque goulot d’étranglement.", tagline: "Ventes, opérations, contrôle financier et gouvernance dans un flux unique." },
    ar: { eyebrow: "ARVOOS · الحلول", title: "حل مترابط لكل عنق زجاجة.", tagline: "المبيعات والعمليات والرقابة المالية والحوكمة في مسار واحد." },
  },
  "arvoos-plans": {
    tr: { eyebrow: "ARVOOS · PAKETLER", title: "İhtiyacınız kadar başlayın, gücünüz kadar büyüyün.", tagline: "Paketler; modüllere, kullanıcı sayısına ve şube yapısına göre birlikte belirlenir." },
    en: { eyebrow: "ARVOOS · PLANS", title: "Start with what you need. Grow as you scale.", tagline: "Plans are shaped together around your modules, users and branch structure." },
    de: { eyebrow: "ARVOOS · PAKETE", title: "Starten Sie mit dem, was Sie brauchen. Wachsen Sie mit.", tagline: "Pakete werden gemeinsam nach Ihren Modulen, Nutzern und Ihrer Standortstruktur gestaltet." },
    es: { eyebrow: "ARVOOS · PLANES", title: "Empiece con lo que necesita. Crezca a su ritmo.", tagline: "Los planes se definen juntos según sus módulos, usuarios y estructura de sucursales." },
    fr: { eyebrow: "ARVOOS · OFFRES", title: "Commencez par l’essentiel. Grandissez à votre rythme.", tagline: "Les offres sont définies ensemble selon vos modules, vos utilisateurs et votre structure d’établissements." },
    ar: { eyebrow: "ARVOOS · الباقات", title: "ابدأ بما تحتاجه، وتوسّع مع نموك.", tagline: "تُحدَّد الباقات معًا وفق الوحدات وعدد المستخدمين وهيكل الفروع." },
  },
  randevu: {
    tr: { eyebrow: "ARVOBOOK · SALON RANDEVU YÖNETİMİ", title: "Randevu defteri telefonu meşgul etmesin.", tagline: "Müşteri kendi randevusunu alır; personel bazlı takvim, çalışma saati ve izin, WhatsApp hatırlatma." },
    en: { eyebrow: "ARVOBOOK · SALON APPOINTMENT MANAGEMENT", title: "Let the booking page answer the phone.", tagline: "Customers book themselves; per-staff calendar, working hours and time off, WhatsApp reminders." },
    de: { eyebrow: "ARVOBOOK · TERMINVERWALTUNG FÜR SALONS", title: "Lassen Sie die Buchungsseite ans Telefon gehen.", tagline: "Kunden buchen selbst; Kalender pro Mitarbeiter, Arbeitszeiten und Abwesenheiten, WhatsApp-Erinnerungen." },
    es: { eyebrow: "ARVOBOOK · GESTIÓN DE CITAS PARA SALONES", title: "Deje que la página de reservas atienda el teléfono.", tagline: "Los clientes reservan por sí mismos; agenda por empleado, horarios y ausencias, recordatorios por WhatsApp." },
    fr: { eyebrow: "ARVOBOOK · GESTION DES RENDEZ-VOUS POUR SALONS", title: "Laissez la page de réservation répondre au téléphone.", tagline: "Les clients réservent eux-mêmes ; agenda par collaborateur, horaires et absences, rappels WhatsApp." },
    ar: { eyebrow: "ARVOBOOK · إدارة مواعيد الصالونات", title: "دع صفحة الحجز تتولى الرد على الهاتف.", tagline: "العملاء يحجزون بأنفسهم؛ تقويم لكل موظف، وساعات العمل والإجازات، وتذكيرات عبر WhatsApp." },
  },
  pricing: {
    tr: { eyebrow: "ÜCRETLER", title: "İşletme ürünlerinde kurum başına fiyat.", tagline: "ArvoOS, ArvoBook ve ArvoLab için aylık ve yıllık fiyatlar; yıllık ödemede iki ay bedava." },
    en: { eyebrow: "PRICING", title: "Business products priced per organization.", tagline: "Monthly and annual prices for ArvoOS, ArvoBook and ArvoLab; two months free on annual billing." },
    de: { eyebrow: "PREISE", title: "Unternehmensprodukte mit Preisen pro Organisation.", tagline: "Monats- und Jahrespreise für ArvoOS, ArvoBook und ArvoLab; zwei Monate gratis bei jährlicher Zahlung." },
    es: { eyebrow: "PRECIOS", title: "Productos para empresas con precio por organización.", tagline: "Precios mensuales y anuales de ArvoOS, ArvoBook y ArvoLab; dos meses gratis con pago anual." },
    fr: { eyebrow: "TARIFS", title: "Des produits professionnels tarifés par organisation.", tagline: "Tarifs mensuels et annuels pour ArvoOS, ArvoBook et ArvoLab ; deux mois offerts en facturation annuelle." },
    ar: { eyebrow: "الأسعار", title: "منتجات أعمال بسعر لكل مؤسسة.", tagline: "أسعار شهرية وسنوية لـ ArvoOS وArvoBook وArvoLab؛ شهران مجانًا عند الدفع السنوي." },
  },
  arvolab: {
    tr: { eyebrow: "ARVOLAB · ARAŞTIRMA ÇALIŞMA ALANI", title: "Araştırma için daha güçlü bir alan.", tagline: "Literatür ve atıf, akademik yazım, kılavuz kontrolü, analiz ve özgünlük ön kontrolü." },
    en: { eyebrow: "ARVOLAB · RESEARCH WORKSPACE", title: "A stronger workspace for research.", tagline: "Literature and citations, academic writing, guideline checks, analysis and originality pre-checks." },
    de: { eyebrow: "ARVOLAB · ARBEITSBEREICH FÜR FORSCHUNG", title: "Ein stärkerer Arbeitsbereich für die Forschung.", tagline: "Literatur und Zitate, wissenschaftliches Schreiben, Richtlinienprüfung, Analyse und Originalitäts-Vorprüfung." },
    es: { eyebrow: "ARVOLAB · ESPACIO DE TRABAJO PARA INVESTIGACIÓN", title: "Un espacio de trabajo más sólido para la investigación.", tagline: "Literatura y citas, redacción académica, revisión de guías, análisis y revisión previa de originalidad." },
    fr: { eyebrow: "ARVOLAB · ESPACE DE TRAVAIL POUR LA RECHERCHE", title: "Un espace de travail plus solide pour la recherche.", tagline: "Littérature et citations, rédaction académique, contrôle des consignes, analyse et pré-contrôle d’originalité." },
    ar: { eyebrow: "ARVOLAB · مساحة عمل للبحث العلمي", title: "مساحة عمل أقوى للبحث العلمي.", tagline: "الأدبيات والاستشهادات، والكتابة الأكاديمية، وفحص الدليل، والتحليل، والفحص المسبق للأصالة." },
  },
  services: {
    tr: { eyebrow: "HİZMETLER", title: "Markadan sisteme. Uçtan uca dijital.", tagline: "Web tasarımı, özel yazılım, süreç tasarımı, entegrasyon ve otomasyon." },
    en: { eyebrow: "SERVICES", title: "From brand to system. End-to-end digital.", tagline: "Web design, custom software, process design, integrations and automation." },
    de: { eyebrow: "LEISTUNGEN", title: "Von der Marke zum System. Digital von A bis Z.", tagline: "Webdesign, individuelle Software, Prozessgestaltung, Integrationen und Automatisierung." },
    es: { eyebrow: "SERVICIOS", title: "De la marca al sistema. Digital de principio a fin.", tagline: "Diseño web, software a medida, diseño de procesos, integraciones y automatización." },
    fr: { eyebrow: "SERVICES", title: "De la marque au système. Le digital de bout en bout.", tagline: "Conception web, logiciel sur mesure, conception de processus, intégrations et automatisation." },
    ar: { eyebrow: "الخدمات", title: "من العلامة التجارية إلى النظام. رقمي من البداية إلى النهاية.", tagline: "تصميم المواقع، والبرمجيات المخصصة، وتصميم العمليات، والتكاملات، والأتمتة." },
  },
  "web-design": {
    tr: { eyebrow: "HİZMETLER · WEB SİTESİ TASARIMI", title: "Markanızın dijitaldeki en güçlü hali.", tagline: "Strateji, UX/UI tasarım, geliştirme ve yayın tek süreçte." },
    en: { eyebrow: "SERVICES · WEB DESIGN", title: "Your brand at its digital best.", tagline: "Strategy, UX/UI design, development and launch in one process." },
    de: { eyebrow: "LEISTUNGEN · WEBDESIGN", title: "Ihre Marke digital in Bestform.", tagline: "Strategie, UX/UI-Design, Entwicklung und Launch in einem Prozess." },
    es: { eyebrow: "SERVICIOS · DISEÑO WEB", title: "Su marca en su mejor versión digital.", tagline: "Estrategia, diseño UX/UI, desarrollo y lanzamiento en un solo proceso." },
    fr: { eyebrow: "SERVICES · CONCEPTION WEB", title: "Votre marque sous son meilleur jour numérique.", tagline: "Stratégie, design UX/UI, développement et mise en ligne en un seul processus." },
    ar: { eyebrow: "الخدمات · تصميم المواقع", title: "علامتك التجارية في أفضل صورها الرقمية.", tagline: "الاستراتيجية وتصميم UX/UI والتطوير والإطلاق في عملية واحدة." },
  },
  "seo-geo": {
    tr: { eyebrow: "HİZMETLER · SEO VE GEO", title: "Arama motorlarında ve yapay zekâ yanıtlarında anlaşılır olun.", tagline: "Google ile ChatGPT, Perplexity ve Google AI Overviews için içerik düzenleme ve teknik optimizasyon." },
    en: { eyebrow: "SERVICES · SEO & GEO", title: "Be understood by search engines and AI answers.", tagline: "Content editing and technical optimization for Google, ChatGPT, Perplexity and Google AI Overviews." },
    de: { eyebrow: "LEISTUNGEN · SEO & GEO", title: "Von Suchmaschinen und KI-Antworten verstanden werden.", tagline: "Inhaltsbearbeitung und technische Optimierung für Google, ChatGPT, Perplexity und Google AI Overviews." },
    es: { eyebrow: "SERVICIOS · SEO Y GEO", title: "Que los buscadores y las respuestas de IA le entiendan.", tagline: "Edición de contenidos y optimización técnica para Google, ChatGPT, Perplexity y Google AI Overviews." },
    fr: { eyebrow: "SERVICES · SEO ET GEO", title: "Soyez compris des moteurs de recherche et des réponses de l’IA.", tagline: "Édition de contenu et optimisation technique pour Google, ChatGPT, Perplexity et Google AI Overviews." },
    ar: { eyebrow: "الخدمات · SEO وGEO", title: "اجعل محركات البحث وإجابات الذكاء الاصطناعي تفهمك.", tagline: "تحرير المحتوى والتحسين التقني لـ Google وChatGPT وPerplexity وGoogle AI Overviews." },
  },
  "custom-software": {
    tr: { eyebrow: "HİZMETLER · ÖZEL YAZILIM", title: "Kurumunuzun iş akışına göre yazılım.", tagline: "Panel ve portal geliştirme, entegrasyon ve otomasyon talepleri için kuruma özel çözümler." },
    en: { eyebrow: "SERVICES · CUSTOM SOFTWARE", title: "Software shaped around how you work.", tagline: "Custom panels and portals, integrations and automation built for your organization." },
    de: { eyebrow: "LEISTUNGEN · INDIVIDUELLE SOFTWARE", title: "Software, die sich nach Ihrer Arbeitsweise richtet.", tagline: "Individuelle Panels und Portale, Integrationen und Automatisierung für Ihre Organisation." },
    es: { eyebrow: "SERVICIOS · SOFTWARE A MEDIDA", title: "Software adaptado a su forma de trabajar.", tagline: "Paneles y portales a medida, integraciones y automatización para su organización." },
    fr: { eyebrow: "SERVICES · LOGICIEL SUR MESURE", title: "Un logiciel adapté à votre façon de travailler.", tagline: "Panneaux et portails sur mesure, intégrations et automatisation conçus pour votre organisation." },
    ar: { eyebrow: "الخدمات · برمجيات مخصصة", title: "برمجيات مصممة وفق طريقة عملك.", tagline: "لوحات وبوابات مخصصة وتكاملات وأتمتة مبنية لمؤسستك." },
  },
  about: {
    tr: { eyebrow: "HAKKIMIZDA", title: "Karmaşık işleri sadeleştiriyoruz.", tagline: "ArvoCulture Group — İstanbul'da ürün ve yazılım geliştiren teknoloji şirketi." },
    en: { eyebrow: "ABOUT", title: "We make complex work simple.", tagline: "ArvoCulture Group — a technology company building products and software in İstanbul." },
    de: { eyebrow: "ÜBER UNS", title: "Wir machen komplexe Arbeit einfach.", tagline: "ArvoCulture Group — ein Technologieunternehmen, das in İstanbul Produkte und Software entwickelt." },
    es: { eyebrow: "NOSOTROS", title: "Hacemos sencillo el trabajo complejo.", tagline: "ArvoCulture Group — una empresa tecnológica que desarrolla productos y software en İstanbul." },
    fr: { eyebrow: "À PROPOS", title: "Nous simplifions le travail complexe.", tagline: "ArvoCulture Group — une entreprise technologique qui développe des produits et des logiciels à İstanbul." },
    ar: { eyebrow: "من نحن", title: "نجعل العمل المعقد بسيطًا.", tagline: "ArvoCulture Group — شركة تقنية تطوّر المنتجات والبرمجيات في إسطنبول." },
  },
  contact: {
    tr: { eyebrow: "İLETİŞİM", title: "Birlikte daha iyi bir sistem kuralım.", tagline: "Demo, erişim ve proje talepleri için: info@arvo-os.com" },
    en: { eyebrow: "CONTACT", title: "Let's build a better system together.", tagline: "Demos, access and project requests: info@arvo-os.com" },
    de: { eyebrow: "KONTAKT", title: "Lassen Sie uns gemeinsam ein besseres System bauen.", tagline: "Demos, Zugang und Projektanfragen: info@arvo-os.com" },
    es: { eyebrow: "CONTACTO", title: "Construyamos juntos un sistema mejor.", tagline: "Demos, acceso y solicitudes de proyectos: info@arvo-os.com" },
    fr: { eyebrow: "CONTACT", title: "Construisons ensemble un meilleur système.", tagline: "Démos, accès et demandes de projet : info@arvo-os.com" },
    ar: { eyebrow: "اتصل بنا", title: "لنبنِ معًا نظامًا أفضل.", tagline: "للعروض التوضيحية وطلبات الوصول والمشاريع: info@arvo-os.com" },
  },
  privacy: {
    tr: { eyebrow: "GİZLİLİK", title: "Gizlilik politikası", tagline: "Kişisel verilerin nasıl işlendiğine dair bilgilendirme." },
    en: { eyebrow: "PRIVACY", title: "Privacy policy", tagline: "How personal data is processed." },
    de: { eyebrow: "DATENSCHUTZ", title: "Datenschutzerklärung", tagline: "Wie personenbezogene Daten verarbeitet werden." },
    es: { eyebrow: "PRIVACIDAD", title: "Política de privacidad", tagline: "Cómo se tratan los datos personales." },
    fr: { eyebrow: "CONFIDENTIALITÉ", title: "Politique de confidentialité", tagline: "Comment les données personnelles sont traitées." },
    ar: { eyebrow: "الخصوصية", title: "سياسة الخصوصية", tagline: "كيف تُعالَج البيانات الشخصية." },
  },
  "distance-sales": {
    tr: { eyebrow: "MESAFELİ SATIŞ", title: "Mesafeli Satış Sözleşmesi", tagline: "Arvo aboneliklerinin internetten satış koşulları." },
    en: { eyebrow: "DISTANCE SALES", title: "Distance Sales Agreement", tagline: "Terms for the online sale of Arvo subscriptions." },
    de: { eyebrow: "FERNABSATZ", title: "Fernabsatzvertrag", tagline: "Bedingungen für den Online-Verkauf von Arvo-Abonnements." },
    es: { eyebrow: "VENTA A DISTANCIA", title: "Contrato de venta a distancia", tagline: "Condiciones de la venta online de suscripciones de Arvo." },
    fr: { eyebrow: "VENTE À DISTANCE", title: "Contrat de vente à distance", tagline: "Conditions de la vente en ligne des abonnements Arvo." },
    ar: { eyebrow: "البيع عن بُعد", title: "اتفاقية البيع عن بُعد", tagline: "شروط بيع اشتراكات Arvo عبر الإنترنت." },
  },
  refund: {
    tr: { eyebrow: "İPTAL VE İADE", title: "İptal ve İade Koşulları", tagline: "Aboneliğin iptali, cayma hakkı ve iade." },
    en: { eyebrow: "CANCELLATION", title: "Cancellation and Refund", tagline: "Cancelling a subscription, withdrawal and refunds." },
    de: { eyebrow: "KÜNDIGUNG", title: "Kündigung und Erstattung", tagline: "Kündigung eines Abonnements, Widerruf und Erstattungen." },
    es: { eyebrow: "CANCELACIÓN", title: "Cancelación y reembolso", tagline: "Cancelación de una suscripción, desistimiento y reembolsos." },
    fr: { eyebrow: "ANNULATION", title: "Annulation et remboursement", tagline: "Annulation d’un abonnement, rétractation et remboursements." },
    ar: { eyebrow: "الإلغاء", title: "الإلغاء والاسترداد", tagline: "إلغاء الاشتراك، وحق الانسحاب، والمبالغ المستردة." },
  },
  delivery: {
    tr: { eyebrow: "TESLİMAT", title: "Teslimat ve Hizmetin İfası", tagline: "Hesap ne zaman açılır; hizmet dijitaldir." },
    en: { eyebrow: "DELIVERY", title: "Delivery and Performance", tagline: "When accounts open; the services are digital." },
    de: { eyebrow: "LIEFERUNG", title: "Lieferung und Leistungserbringung", tagline: "Wann Konten eröffnet werden; die Leistungen sind digital." },
    es: { eyebrow: "ENTREGA", title: "Entrega y prestación del servicio", tagline: "Cuándo se abren las cuentas; los servicios son digitales." },
    fr: { eyebrow: "LIVRAISON", title: "Livraison et exécution du service", tagline: "Quand les comptes sont ouverts ; les services sont numériques." },
    ar: { eyebrow: "التسليم", title: "التسليم وأداء الخدمة", tagline: "متى تُفتح الحسابات؛ الخدمات رقمية." },
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
