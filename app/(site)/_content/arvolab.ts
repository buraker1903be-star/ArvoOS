// ArvoLab ürün sayfası — Türkçe (mevcut metinden, iddia eklenmeden).
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
      { label: "Erişim talep edin", href: `${R("contact")}?ilgi=arvolab`, variant: "gold" },
      { label: "ArvoLab giriş", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Yetenekler",
    title: "Daha düzenli süreç. Daha güçlü çıktı.",
    lead: "Birbirinden kopuk araştırma araçlarını ve kontrol adımlarını, çalışmanın bütününü görebileceğiniz bağlantılı bir düzene taşıyın.",
    items: [
      { title: "Literatür ve atıf", text: "Kaynaklarınızı düzenleyin; literatürünüzü ve atıf akışınızı sistemli yönetin." },
      { title: "Akademik yazım", text: "Araştırma metinlerinizi doğru yapı ve tutarlı bir çalışma düzeni içinde geliştirin." },
      { title: "Kılavuz kontrolü", text: "Belge yapısını ve biçimsel gereklilikleri kılavuzlarla daha hızlı karşılaştırın." },
      { title: "Analiz merkezi", text: "Nicel ve nitel araştırma süreçlerini tek çalışma alanında organize edin." },
      { title: "Akademik editör", text: "Metin kontrolü ve iyileştirme adımlarını araştırma akışınıza dahil edin." },
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
    title: "Bireysel araştırmacıdan kuruma.",
    lead: "ArvoLab, farklı çalışma ölçeklerine uyum sağlayacak şekilde tasarlanır.",
    items: [
      { title: "Bireysel araştırmacılar", text: "Tez, makale ve projelerini tek, sakin bir çalışma alanında yürütmek isteyenler." },
      { title: "Akademik ekipler", text: "Kaynak, metin ve kontrol adımlarını ortak bir düzende tutmak isteyen ekipler." },
      { title: "Kurumlar", text: "Araştırma süreçlerine bütünsel bir çalışma ortamı sunmak isteyen kurumlar." },
    ],
  },
  faq: {
    eyebrow: "Sık sorulan sorular",
    title: "ArvoLab hakkında",
    items: [
      { q: "ArvoLab nedir?", a: "ArvoLab, Arvo’nun literatür ve atıf yönetimi, akademik yazım, kılavuz kontrolü, nicel ve nitel analiz, akademik editör ve özgünlük ön kontrolü sunan araştırma çalışma alanıdır." },
      { q: "ArvoLab kimler için?", a: "Bireysel araştırmacılar, akademik ekipler ve kurumlar için." },
      { q: "ArvoLab’e nasıl erişilir?", a: `İletişim formundan ya da info@arvo-os.com adresinden erişim talep edebilirsiniz. Giriş adresi: ${PRODUCT_APPS.arvolab.url}` },
      { q: "Özgünlük ön kontrolü resmî raporun yerine geçer mi?", a: "Hayır. Teslim öncesi riskleri erken fark etmenizi sağlayan bir ön kontroldür; kurumunuz kendi resmî özgünlük raporunu ayrıca isteyebilir." },
      { q: "ArvoLab ile ArvoOS arasındaki fark nedir?", a: "ArvoOS bir işletmenin operasyonunu yönetir; ArvoLab ise akademik araştırma ve yazım sürecini destekleyen bir çalışma alanıdır." },
    ],
  },
  cta: {
    eyebrow: "Erişim",
    title: "ArvoLab erişimi için bize ulaşın.",
    lead: "Bireysel ya da kurumsal kullanım için ekibimiz size yol göstersin.",
    actions: [
      { label: "Erişim talep edin", href: `${R("contact")}?ilgi=arvolab`, variant: "gold" },
      { label: "ArvoLab giriş", href: PRODUCT_APPS.arvolab.url, external: true, variant: "ghost" },
    ],
  },
};
