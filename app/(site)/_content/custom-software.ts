// Özel yazılım — Türkçe. Yetkinlik kanıtı: ArvoOS platformunun kendisi.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;
const talk = { label: "İhtiyacınızı anlatın", href: `${R("contact")}?ilgi=services`, variant: "gold" as const };

export const CUSTOM_SOFTWARE_TR: SubContent = {
  id: "custom-software",
  parent: { id: "services", name: "Hizmetler" },
  meta: { title: "Özel Yazılım", description: "Arvo özel yazılım hizmeti: kuruma özel panel ve portallar, iş akışı yazılımları, entegrasyon ve otomasyon, müşteri alanları ve mobil uyumlu PWA uygulamalar." },
  hero: {
    eyebrow: "Hizmetler · Özel yazılım", title: "Hazır yazılım yetmediğinde,", subtitle: "size ait bir sistem.",
    lead: "Arvo’nun özel yazılım hizmeti; kurumunuzun gerçek iş akışlarına göre panel, portal, müşteri alanı ve iş akışı yazılımları tasarlayıp geliştirir. ArvoOS’u kuran ekip, aynı özeni sizin sisteminize taşır.",
    actions: [talk, { label: "ArvoOS’u inceleyin", href: R("arvoos"), variant: "ghost" }],
  },
  cards: {
    eyebrow: "Neler geliştiriyoruz?", title: "İşinizin şekline göre yazılım.",
    items: [
      { title: "Kuruma özel panel ve portallar", text: "Ekipleriniz için yönetim ekranları, müşterileriniz için güvenli self servis alanlar." },
      { title: "İş akışı yazılımları", text: "Talep, onay, görev ve teslim adımlarını kurumunuzun kurallarıyla otomatikleştiren akışlar." },
      { title: "Entegrasyon ve otomasyon", text: "Kullandığınız araçları birbirine bağlayan, tekrar eden işleri azaltan veri akışları." },
      { title: "Belge ve imza akışları", text: "Kurumsal kimlikli belgeler, PDF çıktı ve elektronik onay adımları." },
      { title: "Mobil uyumlu PWA", text: "Ana ekrana yüklenebilen, mobil uygulama gibi çalışan web uygulamaları." },
      { title: "Çok kiracılı SaaS mimarisi", text: "Her müşterinin kendi alanında, kendi markasıyla çalıştığı ölçeklenebilir yapılar." },
    ],
  },
  band: {
    eyebrow: "Yetkinliğimizin kanıtı", title: "ArvoOS’u biz kurduk.",
    lead: "Kendi platformumuzda çözdüğümüz problemler, sizin projenizde de hazır deneyim demek.",
    items: ["Çok kiracılı yapı ve DNS doğrulamalı özel alan adı", "Çizilen imzalı elektronik onay ve A4 PDF belgeler", "Ödemeye bağlı dosya teslimli müşteri portalı", "Rol × modül yetki ve satır düzeyinde güvenlik", "Yüklenebilir, mobil öncelikli PWA arayüz"],
  },
  steps: {
    eyebrow: "Süreç", title: "Keşiften sürekli geliştirmeye.",
    items: [
      { title: "Keşif", text: "Süreçlerinizi, kullanıcılarınızı ve öncelikleri birlikte çıkarırız." },
      { title: "Mimari ve tasarım", text: "Veri modelini, yetki yapısını ve arayüzü birlikte tasarlarız." },
      { title: "Geliştirme", text: "Kısa aralıklarla, çalışan parçalar halinde üretir ve sizinle doğrularız." },
      { title: "Yayın ve eğitim", text: "Sistemi yayına alır, ekibinizin kullanmaya başlamasını sağlarız." },
      { title: "Sürekli geliştirme", text: "Geri bildirimlerle performansı, güvenliği ve deneyimi iyileştiririz." },
    ],
  },
  faq: { eyebrow: "Sık sorulan sorular", title: "Özel yazılım hakkında", items: [
    { q: "Arvo ne tür özel yazılımlar geliştiriyor?", a: "Kuruma özel panel ve portallar, iş akışı yazılımları, entegrasyon ve otomasyonlar, belge ve imza akışları ile mobil uyumlu PWA uygulamalar." },
    { q: "Hazır ürün yerine neden özel yazılım?", a: "Süreçleriniz hazır ürünlere sığmıyorsa ya da kendi markanızla müşterilerinize özel bir deneyim sunmak istiyorsanız özel yazılım daha doğru olabilir. Önce ArvoOS’un ihtiyacınızı karşılayıp karşılamadığına birlikte bakarız." },
    { q: "Proje nasıl fiyatlandırılır?", a: "Kapsama göre. Keşif görüşmesinden sonra yol haritası ve teklif hazırlanır." },
    { q: "Yayından sonra destek veriyor musunuz?", a: "Evet. Sürekli geliştirme desteğiyle bakım, güvenlik ve yeni özellik geliştirmesini sürdürürüz." },
  ] },
  cta: { title: "Size ait sistemi birlikte kuralım.", actions: [talk, { label: "Tüm hizmetler", href: R("services"), variant: "ghost" }] },
  serviceName: "Özel yazılım geliştirme",
};
