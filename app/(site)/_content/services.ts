// Hizmetler merkezi + Web sitesi tasarımı — Türkçe.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;
const talk = { label: "Projenizi konuşalım", href: `${R("contact")}?ilgi=services`, variant: "gold" as const };

export const SERVICES_TR: SubContent = {
  id: "services",
  meta: { title: "Hizmetler", description: "Arvo hizmetleri: web sitesi tasarımı ve yapımı, SEO ve GEO içerik düzenleme, özel yazılım, süreç ve deneyim tasarımı, kurumsal dijital sistemler ve sürekli geliştirme desteği." },
  hero: {
    eyebrow: "Hizmetler", title: "Markadan sisteme.", subtitle: "Uçtan uca dijital.",
    lead: "Arvo; web sitesi tasarımından SEO ve GEO’ya, kuruma özel yazılımdan sürekli geliştirmeye kadar iyi görünen, doğru çalışan ve büyümeye hazır dijital ürünleri stratejiden yayına tek bir bütün olarak üretir.",
    actions: [talk],
  },
  cards: {
    eyebrow: "Uzmanlık alanları", title: "İhtiyacınıza göre şekillenen uzmanlık.",
    lead: "Hazır kalıplar yerine kurumunuzun hedeflerini, kullanıcılarını ve operasyonlarını temel alan çözümler üretiyoruz.",
    items: [
      { title: "Web sitesi tasarımı ve yapımı", text: "Markanızı premium bir dijital deneyime dönüştüren strateji, tasarım, geliştirme ve yayın süreci.", href: R("web-design"), size: "hero", visual: "web" },
      { title: "SEO ve GEO içerik düzenleme", text: "Arama motorlarında ve yapay zekâ yanıtlarında doğru anlaşılan, alıntılanabilir içerik ve teknik altyapı.", href: R("seo-geo"), size: "wide", visual: "seo" },
      { title: "Özel yazılım", text: "Kurumunuzun gerçek iş akışlarına göre tasarlanan panel, portal ve iş akışı yazılımları.", href: R("custom-software"), size: "wide", visual: "software" },
      { title: "Süreç ve deneyim tasarımı", text: "Dağınık operasyonları analiz ederek daha sade, ölçülebilir ve yönetilebilir sistemlere dönüştürme." },
      { title: "Kurumsal dijital sistemler", text: "Panel, portal, müşteri alanı ve yönetim ekranları için uçtan uca ürün geliştirme." },
      { title: "Sürekli geliştirme desteği", text: "Yayındaki ürünlerin performans, güvenlik, içerik ve deneyim bakımından düzenli geliştirilmesi.", size: "wide" },
    ],
  },
  steps: {
    eyebrow: "Çalışma biçimimiz", title: "Her projede aynı yüksek standart.",
    lead: "Kararları görünür, kapsamı anlaşılır ve teslimatı sürdürülebilir tutarız.",
    items: [
      { title: "Keşif ve yol haritası", text: "İş hedeflerinizi, kullanıcılarınızı ve kısıtları anlayarak kapsamı birlikte netleştiririz." },
      { title: "Deneyim ve arayüz", text: "Kullanıcı yolculuklarını ve premium arayüzü marka kimliğinizle birlikte tasarlarız." },
      { title: "Geliştirme", text: "Modern, hızlı, erişilebilir ve güvenli bir teknik altyapıyla üretiriz." },
      { title: "Yayın ve iyileştirme", text: "Yayından sonra ölçer, öğrenir ve ürünü düzenli olarak geliştiririz." },
    ],
  },
  faq: { eyebrow: "Sık sorulan sorular", title: "Hizmetler hakkında", items: [
    { q: "Arvo hangi hizmetleri sunuyor?", a: "Web sitesi tasarımı ve yapımı, SEO ve GEO içerik düzenleme, özel yazılım, süreç ve deneyim tasarımı, kurumsal dijital sistemler ve sürekli geliştirme desteği." },
    { q: "Bir projeye nasıl başlıyoruz?", a: "İletişim formundan ihtiyacınızı paylaşırsınız; keşif görüşmesiyle kapsamı netleştirir, ardından yol haritası ve teklif hazırlarız." },
    { q: "Yayından sonra destek veriyor musunuz?", a: "Evet. Sürekli geliştirme desteğiyle performans, güvenlik, içerik ve deneyim iyileştirmelerini düzenli olarak sürdürürüz." },
    { q: "Fiyatlar nasıl belirleniyor?", a: "Her proje kapsamına göre fiyatlandırılır; keşif görüşmesinin ardından size özel teklif hazırlanır." },
  ] },
  cta: { eyebrow: "Yeni proje", title: "Yeni projenizi konuşalım.", actions: [talk, { label: "Bize yazın", href: "mailto:info@arvo-os.com", variant: "ghost" }] },
  serviceName: "Arvo dijital hizmetleri",
};

export const WEB_DESIGN_TR: SubContent = {
  id: "web-design",
  parent: { id: "services", name: "Hizmetler" },
  meta: { title: "Web Sitesi Tasarımı ve Yapımı", description: "Arvo web sitesi tasarımı: keşif ve strateji, içerik mimarisi, UX/UI tasarım, hızlı ve erişilebilir geliştirme, test, yayın ve bakım tek süreçte." },
  hero: {
    eyebrow: "Hizmetler · Web sitesi tasarımı", title: "Markanızın dijitaldeki", subtitle: "en güçlü hali.",
    lead: "Arvo’nun web sitesi tasarımı hizmeti; keşif ve stratejiden içerik mimarisine, UX/UI tasarımdan geliştirme, yayın ve bakıma kadar marka web sitelerini uçtan uca üretir.",
    actions: [talk, { label: "Tüm hizmetler", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Yaklaşım", title: "Tasarımdan fazlası. Eksiksiz bir sistem.",
    lead: "Sitenizi yalnızca bir vitrin olarak değil; marka güveni oluşturan, doğru bilgiyi taşıyan ve iş hedeflerinize hizmet eden yaşayan bir ürün olarak ele alıyoruz.",
    items: [
      { title: "Özgün ve tutarlı marka", text: "Renk, tipografi, görsel dil ve içerik tonu tek bir premium kimlikte birleşir." },
      { title: "Sade ve ikna edici deneyim", text: "Ziyaretçiyi yormayan, güçlü mesajları doğru sırada sunan akıcı kullanıcı yolculukları." },
      { title: "Hızlı ve ölçeklenebilir teknoloji", text: "Mobil öncelikli, arama motorlarına ve yapay zekâ yanıtlarına hazır, kolayca büyüyen altyapı." },
    ],
  },
  steps: {
    eyebrow: "Çalışma süreci", title: "Fikirden yayına, altı net adım.",
    items: [
      { title: "Keşif ve strateji", text: "Markanızı, hedef kitlenizi, rakiplerinizi ve sitenin ticari hedeflerini netleştiririz." },
      { title: "İçerik mimarisi", text: "Sayfaları, mesaj hiyerarşisini ve kullanıcı yolculuklarını dönüşüm hedefleriyle kurgularız." },
      { title: "UX/UI tasarım", text: "Marka kimliğinizi dijitale taşıyan, tüm ekranlara uyumlu özgün tasarımı hazırlarız." },
      { title: "Geliştirme", text: "Hızlı, erişilebilir, SEO temelli ve yönetilebilir modern bir altyapı kurarız." },
      { title: "Test ve yayın", text: "Cihaz, tarayıcı, performans ve içerik kontrollerinin ardından yayına alırız." },
      { title: "Bakım ve büyüme", text: "Yeni içerik, özellik ve iyileştirmelerle sitenin değerini sürekli artırırız." },
    ],
  },
  band: {
    eyebrow: "Teslimatlar", title: "Projenin sonunda elinizde olanlar.",
    items: ["Strateji ve içerik mimarisi", "Tüm ekran boyutlarına uyumlu arayüz tasarımı", "Hızlı, erişilebilir ve SEO temelli kod", "Yapılandırılmış veri ve çok dilli yapı (gerektiğinde)", "Yayın, test ve devir teslim", "Yayın sonrası bakım seçeneği"],
  },
  faq: { eyebrow: "Sık sorulan sorular", title: "Web sitesi tasarımı hakkında", items: [
    { q: "Web sitesi projesi hangi adımlardan oluşur?", a: "Keşif ve strateji, içerik mimarisi, UX/UI tasarım, geliştirme, test ve yayın ile bakım ve büyüme." },
    { q: "Siteler mobil uyumlu mu?", a: "Evet. Tasarım mobil öncelikli yapılır ve tüm ekran boyutlarında test edilir." },
    { q: "Sitem arama motorları için hazır olacak mı?", a: "Evet. Teknik SEO temelleri geliştirmenin parçasıdır; daha kapsamlı çalışma için SEO ve GEO hizmetimiz vardır. Belirli bir sıralama vaat edilmez." },
    { q: "Yayından sonra içerik ekleyebilir miyim?", a: "Evet. Altyapı yeni sayfalara kolayca büyüyecek şekilde kurulur; bakım ve büyüme desteği de sunuyoruz." },
  ] },
  cta: { title: "Yeni sitenizi birlikte tasarlayalım.", actions: [talk, { label: "SEO ve GEO", href: R("seo-geo"), variant: "ghost" }] },
  serviceName: "Web sitesi tasarımı ve yapımı",
};
