// ArvoLab ürün sayfası — Türkçe.
//
// 29.10.2026: özellik metinleri ürünün BUGÜN yaptığı şeylerle somutlaştı
// (altı atıf stili, kılavuz yükleme ve kural çıkarımı, A4/US Letter Word ve
// PDF); hepsi ArvoLab'da çalışan özellikler, vaat değil. Deneme süresinin
// GÜN SAYISI bilerek yazılmıyor: ArvoOS'tan ayarlanıyor (product_plans.trial_days),
// sayfaya yazılan sayı değiştiği gün yalan olur. Ana düğme artık kayıt
// sayfası: kayıt ve deneme herkese açıkken ziyaretçiyi iletişim formuna
// göndermek, satın almaya hazır kişiyi bekletmekti.
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;

export const ARVOLAB_TR: ProductContent = {
  id: "arvolab",
  name: "ArvoLab",
  category: "EducationalApplication",
  appUrl: PRODUCT_APPS.arvolab.url,
  featureList: ["Literatür ve atıf yönetimi", "Akademik yazım", "Kılavuz kontrolü", "Nicel ve nitel analiz", "Akademik editör", "Özgünlük ön kontrolü"],
  meta: {
    title: "ArvoLab — Araştırma Çalışma Alanı",
    description: "ArvoLab; literatür ve atıf yönetimi, akademik yazım, kılavuz kontrolü, nicel ve nitel analiz, akademik editör ve özgünlük ön kontrolünü tek çalışma alanında birleştirir.",
  },
  hero: {
    eyebrow: "ArvoLab · Araştırma çalışma alanı",
    title: "Araştırma için daha", subtitle: "güçlü bir alan.",
    lead: "ArvoLab, literatürden akademik yazıma, belge kontrolünden analize kadar bilimsel üretimin temel adımlarını tek bir çalışma alanında birleştiren web tabanlı bir araştırma ortamıdır.",
    actions: [
      { label: "Ücretsiz deneyin", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "ArvoLab giriş", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Yetenekler",
    title: "Daha düzenli süreç. Daha güçlü çıktı.",
    lead: "Birbirinden kopuk araştırma araçlarını ve kontrol adımlarını, çalışmanın bütününü görebileceğiniz bağlantılı bir düzene taşıyın.",
    items: [
      { title: "Literatür ve atıf", text: "DOI yapıştırın, künye Crossref ve OpenAlex kayıtlarından dolsun. APA 7, Harvard, Chicago, MLA 9, IEEE ve Vancouver; metin içi atıf ve kaynakça birlikte yazılır." },
      { title: "Akademik yazım", text: "Araştırma metinlerinizi doğru yapı ve tutarlı bir çalışma düzeni içinde geliştirin." },
      { title: "Kılavuz kontrolü", text: "Tez yazım kılavuzunuzu PDF ya da bağlantı olarak yükleyin: sayfa düzeni, zorunlu bölümler, atıf sistemi ve sınırlar çıkarılır, onayladığınız kurallar editöre uygulanır. Türkçe ve İngilizce kılavuzlar okunur." },
      { title: "Analiz merkezi", text: "Nicel ve nitel araştırma süreçlerini tek çalışma alanında organize edin." },
      { title: "Akademik editör", text: "Teslime hazır Word ve PDF: A4 ya da US Letter, içindekiler, dipnotlar ve başlık numaraları. Teslim kontrol listesi eksikleri tek yerde gösterir." },
      { title: "Özgünlük ön kontrolü", text: "Teslim öncesi olası riskleri daha erken fark etmek için metninizi değerlendirin." },
    ],
  },
  flow: {
    eyebrow: "Araştırma akışı",
    title: "Bilimsel üretimin her aşamasına eşlik eder.",
    lead: "Araştırmacının odağını araçlarda değil, nitelikli bilimsel üretimde tutan bütünsel bir düzen.",
    steps: [
      { title: "Kaynakları toplayın", text: "Literatürünüzü ve atıflarınızı tek yerde düzenleyin." },
      { title: "Yazın", text: "Metninizi tutarlı bir yapıda geliştirin; editör adımlarını akışa katın." },
      { title: "Kontrol edin", text: "Kılavuz uyumunu ve özgünlük ön kontrolünü teslimden önce yapın." },
      { title: "Analiz edin", text: "Nicel ve nitel analiz süreçlerinizi aynı alanda yürütün." },
    ],
  },
  audience: {
    eyebrow: "Kimler için?",
    title: "Bireysel araştırmacı için.",
    lead: "ArvoLab, farklı çalışma ölçeklerine uyum sağlayacak şekilde tasarlanır.",
    items: [
      { title: "Bireysel araştırmacılar", text: "Tez, makale ve projelerini tek, sakin bir çalışma alanında yürütmek isteyenler." },
      { title: "Lisansüstü öğrenciler", text: "Yüksek lisans ve doktora tezini baştan sona tek abonelikle yürütmek isteyenler." },
      { title: "Üniversiteler", text: "Kurum lisansı yalnızca üniversitelere ve eğitim kurumlarına, teklif usulüyle verilir." },
    ],
  },
  faq: {
    eyebrow: "Sık sorulan sorular",
    title: "ArvoLab hakkında",
    items: [
      { q: "ArvoLab nedir?", a: "ArvoLab, ArvoOS markasının literatür ve atıf yönetimi, akademik yazım, kılavuz kontrolü, nicel ve nitel analiz, akademik editör ve özgünlük ön kontrolü sunan araştırma çalışma alanıdır." },
      { q: "ArvoLab kimler için?", a: "Bireysel araştırmacılar için. Kurum lisansı yalnızca üniversitelere ve eğitim kurumlarına, teklif usulüyle verilir." },
      { q: "ArvoLab’e nasıl erişilir?", a: "Kayıt sayfasından hesabınızı açıp deneme süresiyle hemen başlayabilirsiniz; sonrasında abonelik kartla ödenir. Kurum lisansı için iletişim formunu ya da info@arvo-os.com adresini kullanın." },
      { q: "Özgünlük ön kontrolü resmî raporun yerine geçer mi?", a: "Hayır. Teslim öncesi riskleri erken fark etmenizi sağlayan bir ön kontroldür; kurumunuz kendi resmî özgünlük raporunu ayrıca isteyebilir." },
      { q: "ArvoLab ile ArvoOS arasındaki fark nedir?", a: "ArvoOS bir işletmenin operasyonunu yönetir; ArvoLab ise akademik araştırma ve yazım sürecini destekleyen bir çalışma alanıdır." },
    ],
  },
  cta: {
    eyebrow: "Erişim",
    title: "ArvoLab’i bugün deneyin.",
    lead: "Hesabınızı açın, deneme süresiyle başlayın; ödeme kartla, otomatik yenileme isteğe bağlı. Kurum lisansı için bize ulaşın.",
    actions: [
      { label: "Ücretsiz deneyin", href: `${PRODUCT_APPS.arvolab.url}/kayit`, external: true, variant: "gold" },
      { label: "ArvoLab giriş", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
      { label: "Kurum lisansı", href: `${R("contact")}?ilgi=arvolab`, variant: "ghost" },
    ],
  },
};
