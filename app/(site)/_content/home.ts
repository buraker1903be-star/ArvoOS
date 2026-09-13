// Ana sayfa metinleri — tip + Türkçe. İngilizce: home-en.ts
import { COMPANY, PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { Cta, QA } from "../_components/ui";

type Product = { label: string; title: string; text: string; chips: string[]; cta: Cta; signIn: Cta };
export type HomeContent = {
  meta: { title: string; description: string };
  hero: { eyebrow: string; title: string; subtitle?: string; lead: string; actions: Cta[]; familyLabel: string };
  statement: string[];
  products: { eyebrow: string; title: string; lead: string; os: Product; lab: Product; arcCta: Cta; arcSignIn: Cta };
  band: { words: string[]; caption: string };
  story: { eyebrow: string; title: string; lead: string; cta: Cta; steps: { title: string; text: string }[] };
  eco: { eyebrow: string; title: string; lead: string; roles: [string, string, string]; principles: { title: string; text: string }[] };
  values: { eyebrow: string; title: string; items: { title: string; text: string }[] };
  services: { eyebrow: string; title: string; lead: string; items: { tag: string; title: string; text: string; href: string }[]; more: string; cta: Cta };
  refs: { eyebrow: string; title: string; lead: string; culture: string; akademik: string };
  faq: { eyebrow: string; title: string; items: QA[] };
  cta: { eyebrow: string; title: string; lead: string; actions: Cta[]; note: string };
};

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;

export const HOME_TR: HomeContent = {
  meta: {
    title: "Arvo | ArvoOS, ArvoLab ve Arc — daha iyi çalışma sistemleri",
    description: "Arvo; işletmeler için ArvoOS’u, araştırmacılar için ArvoLab’i ve mağazalar için Arc’ı geliştirir. Web sitesi tasarımı, SEO ve GEO ile özel yazılım hizmetleri sunar.",
  },
  hero: {
    eyebrow: "Arvo ürün ailesi",
    title: "Daha iyi çalışmak için", subtitle: "daha iyi sistemler.",
    lead: "Arvo; işletmeler için ArvoOS’u, araştırmacılar için ArvoLab’i ve mağazalar için Arc’ı geliştiren bir yazılım markasıdır. Karmaşık süreçleri sakin, güçlü ve bağlantılı çalışma deneyimlerine dönüştürür.",
    actions: [
      { label: "Demo talep edin", href: `${R("contact")}?ilgi=arvoos`, variant: "gold" },
      { label: "Ürünleri keşfedin", href: "#urunler", variant: "ghost" },
    ],
    familyLabel: "Arvo ürünleri",
  },
  statement: ["Karmaşıklığı arka planda bırakır.", "Size yalnızca ilerlemek kalır.", "Her Arvo ürünü tek bir ilkeyle tasarlanır:", "en kapsamlı süreci bile doğal hissettirmek."],
  products: {
    eyebrow: "Ürün ailesi",
    title: "Bugün için güçlü. Yarın için hazır.",
    lead: "Her biri kendi alanında uzman üç ürün. Birlikte, çalışma biçiminizin tamamını kapsayan bir ekosistem.",
    os: {
      label: "İşletme işletim sistemi", title: "İşletmenizin tamamı. Tek bir akışta.",
      text: "CRM ve satıştan e-imzalı sözleşmelere, operasyondan finans, İK ve raporlamaya kadar tüm süreç birbirine bağlı tek bir sistemde.",
      chips: ["CRM ve satış", "Teklif ve e-imza", "Operasyon", "Müşteri portalı", "Finans", "İK ve raporlar"],
      cta: { label: "ArvoOS’u keşfedin", href: R("arvoos"), variant: "gold" },
      signIn: { label: "Giriş", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    },
    lab: {
      label: "Araştırma çalışma alanı", title: "Araştırma için daha güçlü bir alan.",
      text: "Literatürden akademik yazıma, kılavuz kontrolünden analize kadar bilimsel üretimin temel adımları tek ve sakin bir çalışma alanında.",
      chips: ["Literatür ve atıf", "Akademik yazım", "Kılavuz kontrolü", "Analiz"],
      cta: { label: "ArvoLab’i keşfedin", href: R("arvolab"), variant: "primary" },
      signIn: { label: "Giriş", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    },
    arcCta: { label: "Arc’ı keşfedin", href: R("arc"), variant: "gold" },
    arcSignIn: { label: "Giriş", href: PRODUCT_APPS.arc.url, external: true, variant: "ghost" },
  },
  band: {
    words: ["CRM", "Teklif", "E-imza", "Operasyon", "Müşteri portalı", "Finans", "İnsan kaynakları", "Raporlar"],
    caption: "Tek çekirdek. Birbirine bağlı on üç yetenek alanı.",
  },
  story: {
    eyebrow: "ArvoOS",
    title: "Talepten tahsilata. Tek akış.",
    lead: "Bir kez girilen veri, işin her adımına kendiliğinden taşınır. Kimse aynı bilgiyi ikinci kez yazmaz.",
    cta: { label: "Modülleri inceleyin", href: R("arvoos-modules"), variant: "primary" },
    steps: [
      { title: "Talep", text: "Talep CRM satış hattına düşer; müşterinin geçmişi otomatik görünür ve bir satış temsilcisine atanır." },
      { title: "Teklif", text: "KDV seçenekli ve ödeme planlı teklif WhatsApp veya e-postayla paylaşılır; müşteri tek tıkla çevrim içi onaylar." },
      { title: "E-imza", text: "Onaylanan teklif tek adımda sözleşmeye dönüşür; müşteri çizdiği imzayla onaylar. İçerik zaman damgası ve doğrulama özetiyle kilitlenir." },
      { title: "İş akışı", text: "İmza, iş akışını otomatik başlatır: görevler, sorumlular, terminler, Gantt şeması ve takvim." },
      { title: "Takip portalı", text: "Müşteri, takip koduyla işinin ilerlemesini ve belgelerini markalı bir sayfada izler; ekibinizle mesajlaşır." },
      { title: "Online tahsilat", text: "Taksitler çevrim içi ödeme bağlantılarıyla tahsil edilir; teslim dosyaları ödeme yapılana kadar kilitli kalır." },
      { title: "Rapor", text: "Satış hunisi, en zayıf adım ve iş bazında gerçek kârlılık tek ekranda." },
    ],
  },
  eco: {
    eyebrow: "Ekosistem",
    title: "Üç ürün. Tek ekosistem.",
    lead: "ArvoOS, ArvoLab ve Arc; arvo-os.com’un kendi alt alan adlarında çalışan ayrı web uygulamalarıdır ve aynı ekip tarafından, ortak marka ve kalite standardıyla geliştirilir.",
    roles: ["Operasyon", "Araştırma", "Mağaza"],
    principles: [
      { title: "Her kuruma kendi alanı", text: "Her kurum, ekip ya da mağaza kendi çalışma alanında çalışır." },
      { title: "Ortak tasarım dili", text: "Aynı sade arayüz anlayışı ve aynı özen, her üründe." },
      { title: "Birlikte büyüyen ürünler", text: "Kurumunuz büyürken ürün ailesi de sizinle birlikte genişler." },
    ],
  },
  values: {
    eyebrow: "İlkelerimiz",
    title: "Nasıl tasarlıyoruz?",
    items: [
      { title: "Sade.", text: "Gereksiz hiçbir şey yok. İhtiyacınız olan her şey tam yerinde." },
      { title: "Güçlü.", text: "Kritik süreçler için güvenilir, kontrollü ve ölçeklenebilir altyapı." },
      { title: "Bütünsel.", text: "Ürünler, ekipler ve veriler arasında kesintisiz bir çalışma düzeni." },
    ],
  },
  services: {
    eyebrow: "Hizmetler",
    title: "Ürünlerimizi kuran ekip, sizin için de üretir.",
    lead: "Web sitesinden kuruma özel yazılıma kadar markanızı ve süreçlerinizi dijitalde en güçlü haline taşıyoruz.",
    items: [
      { tag: "Tasarım ve geliştirme", title: "Web sitesi tasarımı", text: "Strateji, içerik mimarisi, UX/UI tasarım, geliştirme ve yayın tek süreçte.", href: R("web-design") },
      { tag: "Görünürlük", title: "SEO ve GEO", text: "Arama motorlarında ve yapay zekâ yanıtlarında doğru anlaşılan, alıntılanabilir içerik ve teknik altyapı.", href: R("seo-geo") },
      { tag: "Yazılım", title: "Özel yazılım", text: "Kuruma özel panel, portal ve iş akışı yazılımları; entegrasyon ve otomasyon.", href: R("custom-software") },
    ],
    more: "Detaylar",
    cta: { label: "Tüm hizmetler", href: R("services"), variant: "ghost" },
  },
  refs: { eyebrow: "Referanslar", title: "Güvenle üreten markalar.", lead: "Aynı kalite anlayışını paylaşan, birlikte değer ürettiğimiz marka ekosistemi.", culture: "Markayı keşfedin", akademik: "Web sitesini ziyaret edin" },
  faq: {
    eyebrow: "Sık sorulan sorular",
    title: "Arvo hakkında merak edilenler",
    items: [
      { q: "Arvo nedir?", a: `Arvo, ${COMPANY.legalName} şirketinin yazılım markasıdır. İşletmeler için ArvoOS’u, araştırmacılar için ArvoLab’i ve mağazalar için Arc’ı geliştirir; web sitesi tasarımı ve özel yazılım hizmetleri de sunar.` },
      { q: "ArvoOS, ArvoLab ve Arc arasındaki fark nedir?", a: "ArvoOS bir işletmenin operasyonunu talepten tahsilata yönetir. ArvoLab akademik araştırma ve yazım sürecini destekler. Arc ise mağazaların ürünlerini ve siparişlerini tek panelde toplar." },
      { q: "Arvo ürünlerine nereden giriş yapılır?", a: `ArvoOS ${PRODUCT_APPS.arvoos.host}, ArvoLab ${PRODUCT_APPS.arvolab.host}, Arc ise ${PRODUCT_APPS.arc.host} adresinde çalışır. Üçü de tarayıcıda çalışan web uygulamalarıdır.` },
      { q: "ArvoOS’un fiyatı nedir?", a: "Herkese açık bir fiyat listesi yoktur. Paketler; modüllere, kullanıcı sayısına ve şube yapısına göre kurumla birlikte belirlenir." },
      { q: "Nasıl demo talep edebilirim?", a: `İletişim sayfasındaki formu doldurabilir ya da ${COMPANY.email} adresine yazabilirsiniz; talebiniz ilgili ürün ekibine iletilir.` },
    ],
  },
  cta: {
    eyebrow: "Kurumunuza özel demo",
    title: "Geleceğin çalışma sistemlerini birlikte kuralım.",
    lead: "ArvoOS, ArvoLab veya Arc’ın sizin için nasıl çalışacağını birlikte gösterelim.",
    actions: [
      { label: "Demo talep edin", href: `${R("contact")}?ilgi=arvoos`, variant: "gold" },
      { label: "Bizimle tanışın", href: R("about"), variant: "ghost" },
    ],
    note: "ya da doğrudan yazın:",
  },
};
