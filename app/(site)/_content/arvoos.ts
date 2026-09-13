// ArvoOS ürün sayfası — Türkçe. Özellikler lib/site/llms.ts'teki doğrulanmış
// 13 başlıklı envantere dayanır. Ödeme sağlayıcısı adı YAZILMAZ.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import { HOME_TR } from "./home";
import type { ProductContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;

export const ARVOOS_TR: ProductContent = {
  id: "arvoos",
  name: "ArvoOS",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.arvoos.url,
  featureList: ["CRM ve satış hattı", "Çevrim içi onaylı teklifler", "E-imzalı sözleşmeler ve A4 PDF", "Belge merkezi", "Operasyon, Gantt ve takvim", "Müşteri takip portalı", "Cari hesap, taksit ve çevrim içi ödeme bağlantısı", "İnsan kaynakları ve prim hesabı", "Raporlar ve kârlılık", "Ekip mesajlaşması ve bildirimler", "Rol × modül yetki matrisi", "Özel alan adı ve markalama", "Yüklenebilir PWA"],
  meta: {
    title: "ArvoOS — İşletme İşletim Sistemi",
    description: "ArvoOS; CRM, çevrim içi onaylı teklif, e-imzalı sözleşme, operasyon, müşteri takip portalı, finans, İK ve raporları tek akışta birleştiren çok kiracılı işletme işletim sistemidir.",
  },
  hero: {
    eyebrow: "ArvoOS · İşletme işletim sistemi",
    title: "İşletmenizin tamamı.", subtitle: "Tek bir akışta.",
    lead: "ArvoOS, hizmet işletmeleri ve kurumlar için ilk müşteri talebinden son tahsilata kadar tüm süreci tek bağlantılı akışta yöneten, çok kiracılı ve web tabanlı bir işletme işletim sistemidir.",
    actions: [
      { label: "Demo talep edin", href: `${R("contact")}?ilgi=arvoos`, variant: "gold" },
      { label: "Panele giriş", href: PRODUCT_APPS.arvoos.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "ArvoOS neler yapar?",
    title: "Kontrol sizde. Karmaşa geride.",
    lead: "Dağınık tabloları, kopuk araçları ve görünmeyen sorumlulukları tek bir kurumsal çalışma düzeninde birleştirin.",
    items: [
      { title: "Teklifler", text: "Revizyon, KDV seçenekleri ve ödeme planı; müşteri tek tıkla çevrim içi onaylar.", size: "hero", visual: "s1" },
      { title: "CRM ve satış", text: "Satış hattı aşamaları, otomatik müşteri geçmişi, anlık müşteri sorgulama ve satış takvimi." },
      { title: "E-imzalı sözleşmeler", text: "Şablonlar, çizilen imza ve onay beyanları; imzadan sonra kilitlenen içerik ve A4 PDF." },
      { title: "Operasyon", text: "İş tablosu, Gantt şeması, takvim, görevler ve sorumlular. İmza, iş akışını otomatik başlatır." },
      { title: "Finans", text: "Cari hesaplar, taksit planları, çevrim içi ödeme bağlantıları, faturalar ve iş bazında kârlılık." },
      { title: "Müşteri takip portalı", text: "Müşteri, takip koduyla ilerlemeyi, belgelerini ve ödeme özetini markalı bir sayfada izler.", size: "hero", alt: true, visual: "s4" },
      { title: "İnsan kaynakları", text: "Personel, roller, prim hesabı, etkinlik kayıtları ve e-imzalı gizlilik sözleşmeleri." },
      { title: "Raporlar", text: "Satış hunisi, en zayıf adım, gerçek kârlılık, eğilimler ve kayıp nedenleri." },
      { title: "İletişim", text: "Ekip içi mesajlaşma, bildirim merkezi, yönetim duyuruları ve destek talepleri.", size: "wide" },
    ],
  },
  flow: {
    eyebrow: "Talepten tahsilata",
    title: "Bir kez girin. Her adımda hazır.",
    lead: HOME_TR.story.lead,
    steps: HOME_TR.story.steps,
    cta: { label: "Tüm modülleri inceleyin", href: R("arvoos-modules"), variant: "primary" },
  },
  audience: {
    eyebrow: "Kimler için?",
    title: "Satan, teslim eden ve tahsil eden her ekip için.",
    lead: "Satış, teslimat ve tahsilatı birden çok kişi, ekip veya şube üzerinden yürüten hizmet işletmeleri ve kurumlar.",
    more: "Sektöre göre yapılandırma",
    items: [
      { title: "Sağlık kurumları", text: "Danışan talepleri, randevular, ekip ve tahsilat tek düzende.", href: R("arvoos-industries") },
      { title: "Eğitim kurumları", text: "Adaydan kayda, ödeme planından belgeye kadar eğitim operasyonu.", href: R("arvoos-industries") },
      { title: "Danışmanlık ve hizmet", text: "Talepleri planlı, ölçülebilir ve kârlı projelere dönüştürün.", href: R("arvoos-industries") },
      { title: "Çok şubeli işletmeler", text: "Merkezî standartları korurken ekiplerin kendi işini hızlandırın.", href: R("arvoos-industries") },
    ],
  },
  band: {
    eyebrow: "Kendi markanızla",
    title: "Sizin alan adınız. Sizin markanız.",
    lead: "Her kurum kendi yalıtılmış çalışma alanında çalışır; müşterileriniz giriş ekranından belgeye kadar yalnızca sizin markanızı görür.",
    items: [
      "DNS ile doğrulanan özel alan adı",
      "Markalı giriş ve müşteri sayfaları",
      "Logo, marka rengi, kaşe ve imza",
      "Teklif ve sözleşmelerde otomatik yasal ve banka bilgileri",
      "Rol × modül yetki matrisi ve denetim geçmişi",
      "Mobil uygulama gibi çalışan, yüklenebilir PWA",
    ],
  },
  faq: {
    eyebrow: "Sık sorulan sorular",
    title: "ArvoOS hakkında",
    items: [
      { q: "ArvoOS nedir?", a: "ArvoOS, Arvo’nun web tabanlı, çok kiracılı işletme işletim sistemidir. CRM ve satış, teklif, e-imzalı sözleşme, operasyon, müşteri takip portalı, finans, İK, raporlar ve ekip iletişimini tek akışta birleştirir." },
      { q: "ArvoOS bir işi talepten tahsilata nasıl götürür?", a: "Talep satış hattına girer ve teklife dönüşür; müşteri teklifi çevrim içi onaylar, sözleşmeyi elektronik olarak imzalar. İmza iş akışını otomatik başlatır, müşteri ilerlemeyi portaldan izler ve taksitler çevrim içi ödeme bağlantılarıyla tahsil edilir." },
      { q: "ArvoOS elektronik imzayı destekliyor mu?", a: "Evet. Müşteri sözleşmeyi çizilen imza ve onay beyanlarıyla onaylar; IP adresi, zaman damgası, cihaz ve doğrulama özeti kaydedilir ve içerik imzadan sonra kilitlenir." },
      { q: "ArvoOS kendi alan adımızda ve markamızla çalışabilir mi?", a: "Evet. DNS ile doğrulanan özel alan adı bağlanabilir; logo, marka rengi, kaşe ve imza giriş sayfalarında, müşteri sayfalarında, teklif ve sözleşmelerde kullanılır." },
      { q: "ArvoOS mobilde çalışır mı?", a: "Evet. PWA olarak ana ekrana yüklenebilir; alt sekme çubuğu ve alt panellerle mobil uygulama gibi çalışır." },
      { q: "ArvoOS’un fiyatı nedir?", a: "Herkese açık fiyat listesi yoktur. Paketler; modüllere, kullanıcı sayısına ve şube yapısına göre kurumla birlikte belirlenir." },
    ],
  },
  cta: {
    eyebrow: "Kurumunuza özel demo",
    title: "ArvoOS’un işletmenizde nasıl çalışacağını birlikte tasarlayalım.",
    lead: "İhtiyaçlarınızı dinleyelim, ArvoOS’u kendi süreçleriniz üzerinden gösterelim.",
    actions: [
      { label: "Demo talep edin", href: `${R("contact")}?ilgi=arvoos`, variant: "gold" },
      { label: "Paketleri inceleyin", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
