// SEO ve GEO içerik düzenleme — Türkçe. Sıralama / trafik VAAT EDİLMEZ.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;
const talk = { label: "Sitenizi değerlendirelim", href: `${R("contact")}?ilgi=services`, variant: "gold" as const };

export const SEO_GEO_TR: SubContent = {
  id: "seo-geo",
  parent: { id: "services", name: "Hizmetler" },
  meta: { title: "SEO ve GEO İçerik Düzenleme", description: "Arvo SEO ve GEO hizmeti: teknik SEO, içerik mimarisi, yapılandırılmış veri (JSON-LD), llms.txt, yapay zekâ yanıtlarında alıntılanabilir içerik, çok dilli yapı ve performans." },
  hero: {
    eyebrow: "Hizmetler · SEO ve GEO", title: "Aranınca bulunun.", subtitle: "Sorulunca anlatılın.",
    lead: "SEO ve GEO içerik düzenleme; sitenizin arama motorlarında doğru dizine alınmasını ve ChatGPT, Perplexity ya da Google AI Overviews gibi yapay zekâ yanıt motorlarında doğru anlaşılıp alıntılanabilmesini sağlayan teknik ve içerik çalışmasıdır.",
    actions: [talk, { label: "Tüm hizmetler", href: R("services"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Neler yapıyoruz?", title: "Arama motorları ve yapay zekâ için tek temel.",
    lead: "GEO (generative engine optimization), içeriğinizin yapay zekâ yanıtlarında kaynak olarak kullanılabilmesi için netlik, yapı ve doğrulanabilirlik kazandırır.",
    numbered: true,
    items: [
      { title: "Teknik SEO", text: "Taranabilirlik, dizinleme, site haritası, robots, canonical ve yönlendirme düzeni." },
      { title: "İçerik mimarisi", text: "Sayfa hiyerarşisi, net başlıklar ve her sayfanın tek bir soruya güçlü cevap vermesi." },
      { title: "Yapılandırılmış veri", text: "Kurum, ürün, hizmet, SSS ve içerik yolu için schema.org JSON-LD işaretlemesi." },
      { title: "llms.txt", text: "Yapay zekâ asistanları için sitenizin özetini ve önemli sayfalarını sunan makine okunur dizin." },
      { title: "Alıntılanabilir içerik", text: "Tek cümlelik tanımlar, kısa ve olgusal SSS’ler; uydurma iddia olmadan doğrulanabilir anlatım." },
      { title: "Çok dilli yapı ve performans", text: "hreflang ile dil eşleşmeleri; Core Web Vitals odaklı hızlı ve kararlı sayfalar." },
    ],
  },
  steps: {
    eyebrow: "Süreç", title: "Denetimden sürekli iyileştirmeye.",
    items: [
      { title: "Denetim", text: "Teknik altyapıyı, içerik yapısını ve mevcut görünürlüğü inceleriz." },
      { title: "Strateji ve içerik mimarisi", text: "Hedef soruları, sayfa hiyerarşisini ve öncelikleri belirleriz." },
      { title: "Teknik uygulama", text: "Site haritası, yapılandırılmış veri, llms.txt, hreflang ve performans iyileştirmelerini uygularız." },
      { title: "İçerik düzenleme", text: "Metinleri net tanımlar, soru odaklı başlıklar ve kısa cevaplarla yeniden düzenleriz." },
      { title: "Ölçüm ve iyileştirme", text: "Arama konsolu verileri ve düzenli kontrollerle çalışmayı sürdürürüz." },
    ],
  },
  band: {
    eyebrow: "Uygulamada", title: "Bu site de aynı yaklaşımla kuruldu.",
    lead: "arvo-os.com; yapılandırılmış veri, llms.txt, hreflang ve soru odaklı içerikle hazırlandı.",
    items: ["Her sayfada schema.org JSON-LD", "llms.txt ve llms-full.txt", "Türkçe–İngilizce hreflang eşleşmeleri", "Tanım cümlesiyle açılan sayfalar ve kısa SSS’ler"],
  },
  note: "Arama motorları ve yapay zekâ servisleri kendi algoritmalarıyla karar verir; belirli bir sıralama, trafik veya alıntı vaat edilmez.",
  faq: { eyebrow: "Sık sorulan sorular", title: "SEO ve GEO hakkında", items: [
    { q: "GEO nedir?", a: "GEO (generative engine optimization), içeriğin ChatGPT, Perplexity veya Google AI Overviews gibi yapay zekâ yanıt motorlarında doğru anlaşılması ve kaynak olarak alıntılanabilmesi için yapılan düzenlemedir." },
    { q: "SEO ile GEO arasındaki fark nedir?", a: "SEO arama sonuçlarında dizinlenme ve görünürlüğe odaklanır; GEO ise yapay zekâ yanıtlarında doğru ve alıntılanabilir bilgi sunmaya. İkisi aynı sağlam teknik ve içerik temelini paylaşır." },
    { q: "llms.txt nedir?", a: "Yapay zekâ asistanlarına sitenin kısa bir özetini ve önemli sayfalarını sunan, sitenin kökünde yayımlanan düz metin bir dosyadır." },
    { q: "Belirli bir sıralama garanti ediyor musunuz?", a: "Hayır. Belirli bir sıralama, trafik veya alıntı vaat edilmez; doğru teknik altyapıyı ve içerik yapısını kurarız." },
    { q: "Mevcut siteme uygulanabilir mi?", a: "Evet. Önce denetim yaparız; teknik ve içerik iyileştirmeleri çoğu zaman mevcut siteye uygulanabilir." },
  ] },
  cta: { title: "Sitenizin aranınca bulunmasını, sorulunca anlatılmasını sağlayalım.", actions: [talk, { label: "Web sitesi tasarımı", href: R("web-design"), variant: "ghost" }] },
  serviceName: "SEO ve GEO içerik düzenleme",
};
