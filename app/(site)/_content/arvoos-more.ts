// ArvoOS Sektörler, Çözümler, Paketler — Türkçe (eski kurumsal sayfaların
// metni sadeleştirildi; doğrulanmayan entegrasyon iddiaları çıkarıldı).
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;
const demo = { label: "Demo talep edin", href: `${R("contact")}?ilgi=arvoos`, variant: "gold" as const };
const parent = { id: "arvoos" as const, name: "ArvoOS" };

export const INDUSTRIES_TR: SubContent = {
  id: "arvoos-industries", parent,
  meta: { title: "ArvoOS Sektörler", description: "ArvoOS; sağlık kurumları, eğitim kurumları, danışmanlık ve hizmet firmaları ile çok şubeli işletmeler için modül, ekran ve yetkileriyle yapılandırılır." },
  hero: {
    eyebrow: "ArvoOS · Sektörler", title: "Genel bir yazılım değil,", subtitle: "kurumunuza ait bir sistem.",
    lead: "ArvoOS’un modülleri, ekranları ve yetkileri; sağlık, eğitim, danışmanlık ve çok şubeli işletmelerin gerçek çalışma biçimine göre yapılandırılır.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Sektörünüze uyarlanır", title: "Aynı çekirdek. Size özel düzen.", cols: "two",
    items: [
      { title: "Sağlık kurumları", text: "Danışan, randevu, ekip ve tahsilat süreçlerini bütünsel yönetin.", items: ["Danışan talepleri ve randevu takvimi", "Ekip, rol ve yetki yapısı", "Taksit planı ve tahsilat takibi"] },
      { title: "Eğitim kurumları", text: "Adaydan kayda, ödeme planından belgeye kadar eğitim operasyonunu birleştirin.", items: ["Aday talepleri ve kayıt süreci", "Teklif, sözleşme ve e-imza", "Ödeme planı ve tahsilat"] },
      { title: "Danışmanlık ve hizmet", text: "Müşteri taleplerini planlı, ölçülebilir ve kârlı projelere dönüştürün.", items: ["CRM ve teklif yönetimi", "Proje ve teslim akışları, müşteri portalı", "Sözleşme, finans ve kârlılık"] },
      { title: "Çok şubeli işletmeler", text: "Merkezî standartları korurken her ekibin kendi operasyonunu hızlandırın.", items: ["Merkezden ortak görünüm ve raporlar", "Rol ve modül bazlı yetkilendirme", "Kayıt düzeyinde erişim"] },
    ],
  },
  note: "Sektörünüz listede yoksa da konuşalım: ArvoOS, satış–teslimat–tahsilat döngüsü olan her hizmet işletmesine uyarlanabilir.",
  faq: { eyebrow: "Sık sorulan sorular", title: "Sektörler hakkında", items: [
    { q: "ArvoOS hangi sektörler için uygun?", a: "Sağlık kurumları, eğitim kurumları, danışmanlık ve hizmet firmaları ile çok şubeli işletmeler; genel olarak satış, teslimat ve tahsilatı birden çok kişiyle yürüten hizmet işletmeleri." },
    { q: "ArvoOS sektörümüze nasıl uyarlanır?", a: "Modüller, ekranlar ve yetkiler kurumunuzun çalışma biçimine göre yapılandırılır; sözleşme şablonları ve iş akışları süreçlerinize göre kurulur." },
    { q: "Sektöre özel kurulum için ne gerekir?", a: "İhtiyaç analiziyle başlarız; ardından kişisel bir demo ve geçiş planı hazırlarız." },
  ] },
  cta: { title: "Sektörünüz için ArvoOS’u birlikte kurgulayalım.", actions: [demo, { label: "Çözümler", href: R("arvoos-solutions"), variant: "ghost" }] },
};

export const SOLUTIONS_TR: SubContent = {
  id: "arvoos-solutions", parent,
  meta: { title: "ArvoOS Çözümler", description: "ArvoOS; satış ve müşteri yönetimi, operasyon yönetimi, finansal kontrol ve kurumsal yönetişimdeki kopuklukları tek akışta giderir." },
  hero: {
    eyebrow: "ArvoOS · Çözümler", title: "Her darboğaza", subtitle: "bağlantılı bir çözüm.",
    lead: "ArvoOS yalnızca kayıt tutmaz; satış, operasyon ve finans arasındaki kopuklukları gidererek işin doğru zamanda doğru kişiye ulaşmasını sağlar.",
    actions: [demo],
  },
  cards: {
    eyebrow: "İşletme ihtiyaçları", title: "Sorun nerede başlıyorsa, çözüm orada.", cols: "two",
    items: [
      { title: "Satış ve müşteri yönetimi", text: "Fırsatları kaybetmeden takip edin, teklif ve sözleşmeyi hızlandırın.", items: ["Merkezî müşteri geçmişi", "Çevrim içi onay ve e-imza bağlantıları", "Aşamalı satış hattı ve kayıp nedenleri"] },
      { title: "Operasyon yönetimi", text: "Satışı tamamlanan işi ekiplerin uygulayabileceği standart akışa dönüştürün.", items: ["İmzayla otomatik iş akışı", "Sorumlu, termin ve ilerleme takibi", "Müşteri takip portalı"] },
      { title: "Finansal kontrol", text: "Geliri, tahsilatı ve maliyeti işle birlikte görün.", items: ["Satış–finans bağlantısı", "Taksit ve tahsilat görünümü", "İş bazında gerçek kârlılık"] },
      { title: "Kurumsal yönetişim", text: "Yetki, kayıt ve raporlama düzenini büyüyen yapınıza göre kurun.", items: ["Rol × modül yetki matrisi", "Kurumlar arası yalıtım", "Denetlenebilir işlem geçmişi"] },
    ],
  },
  faq: { eyebrow: "Sık sorulan sorular", title: "Çözümler hakkında", items: [
    { q: "ArvoOS hangi sorunları çözer?", a: "Satış, operasyon ve finans arasındaki kopuklukları: aynı bilginin tekrar tekrar girilmesini, takipsiz kalan teklifleri, görünmeyen sorumlulukları ve işle bağlanmayan tahsilatları." },
    { q: "Satış ile operasyon nasıl bağlanır?", a: "Müşterinin imzaladığı sözleşme, iş akışını otomatik başlatır; görevler, sorumlular ve terminler hazır gelir." },
    { q: "Gerçek kârlılığı nasıl görürüm?", a: "Her işe maliyet kalemleri eklenir; raporlar satış ve tahsilatla birlikte iş bazında gerçek kârlılığı gösterir." },
  ] },
  cta: { title: "Darboğazınızı anlatın, akışı birlikte kuralım.", actions: [demo, { label: "Modüller", href: R("arvoos-modules"), variant: "ghost" }] },
};

export const PLANS_TR: SubContent = {
  id: "arvoos-plans", parent,
  meta: { title: "ArvoOS Paketler", description: "ArvoOS paketleri; gerekli modüller, kullanıcı sayısı, şube yapısı ve kuruma özel iş akışlarına göre kurumla birlikte belirlenir." },
  hero: {
    eyebrow: "ArvoOS · Paketler", title: "İhtiyacınız kadar başlayın,", subtitle: "gücünüz kadar büyüyün.",
    lead: "ArvoOS paketleri; gerekli modüller, kullanıcı sayısı, şube yapısı ve kuruma özel iş akışlarına göre kurumunuzla birlikte belirlenir.",
    actions: [demo],
  },
  cards: {
    eyebrow: "Esnek paket yapısı", title: "Üç başlangıç noktası.", cols: "three",
    items: [
      { title: "Başlangıç", text: "Temel müşteri, iş ve finans süreçlerini tek düzende yönetmek isteyen ekipler için.", items: ["Seçili temel modüller", "Standart rol yapısı", "Kurulum ve başlangıç desteği"] },
      { title: "Kurumsal", text: "Birden çok ekibi veya şubeyi bağlantılı süreçlerle yönetmek isteyen kurumlar için.", items: ["Geniş modül seçimi", "Gelişmiş raporlama", "Ekip ve yetki yönetimi"] },
      { title: "Özel kurum", text: "ArvoOS’u kendi çalışma modeli ve kurumsal kimliğiyle kullanmak isteyen yapılar için.", items: ["Kuruma özel iş akışları", "Kuruma özel alan adı", "Markalı müşteri deneyimi"] },
    ],
  },
  steps: {
    eyebrow: "Nasıl belirlenir?", title: "Doğru planı birlikte oluşturalım.",
    lead: "İhtiyacınız olmayan özelliklere değil, doğrudan iş sonuçlarınıza yatırım yapın.",
    items: [
      { title: "İhtiyaç analizi", text: "Süreçlerinizi, ekip yapınızı ve öncelikli modülleri birlikte çıkarırız." },
      { title: "Kişisel ürün demosu", text: "ArvoOS’u kendi iş akışlarınız üzerinden gösteririz." },
      { title: "Ölçeklenebilir geçiş planı", text: "Kurulumu, veri aktarımını ve ekip eğitimini adım adım planlarız." },
    ],
  },
  note: "Herkese açık bir fiyat listesi yoktur; teklif, kapsam netleştikten sonra hazırlanır.",
  faq: { eyebrow: "Sık sorulan sorular", title: "Paketler hakkında", items: [
    { q: "ArvoOS’un fiyatı nedir?", a: "Herkese açık fiyat listesi yoktur. Fiyat; modüllere, kullanıcı sayısına ve şube yapısına göre kurumla birlikte belirlenir." },
    { q: "Hangi paketle başlamalıyım?", a: "İhtiyaç analizinden sonra birlikte karar veririz; çoğu kurum temel modüllerle başlayıp zamanla genişletir." },
    { q: "Paketimi sonradan değiştirebilir miyim?", a: "Evet. Modül, kullanıcı ve şube yapınız değiştikçe paketiniz de genişletilebilir." },
    { q: "Kendi alan adımızı kullanabilir miyiz?", a: "Evet. Kuruma özel alan adı DNS doğrulamasıyla bağlanır ve markalı giriş ile müşteri sayfaları bu adreste çalışır." },
  ] },
  cta: { title: "Kurumunuza uygun paketi birlikte belirleyelim.", actions: [demo, { label: "Bize yazın", href: "mailto:info@arvo-os.com", variant: "ghost" }] },
};
