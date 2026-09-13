// ArvoOS Modüller — Türkçe. 13 başlık = llms.ts'teki doğrulanmış envanter.
import { ROUTES } from "@/lib/site/routes";
import type { SubContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;

export const MODULES_TR: SubContent = {
  id: "arvoos-modules",
  parent: { id: "arvoos", name: "ArvoOS" },
  meta: {
    title: "ArvoOS Modülleri",
    description: "ArvoOS modülleri: CRM ve satış, teklifler, sözleşmeler, belge merkezi, operasyon, müşteri takip portalı, finans, İK, raporlar, iletişim, yetki, markalama ve mobil deneyim.",
  },
  hero: {
    eyebrow: "ArvoOS · Modüller",
    title: "Ayrı araçlar değil,", subtitle: "birlikte çalışan modüller.",
    lead: "ArvoOS modülleri, aynı veri üzerinde birlikte çalışan 13 yetenek alanıdır: bir modülde başlayan iş, tekrar veri girişi olmadan bir sonrakine aktarılır.",
    actions: [{ label: "Demo talep edin", href: `${R("contact")}?ilgi=arvoos`, variant: "gold" }],
  },
  cards: {
    eyebrow: "Yetenek alanları",
    title: "İşletmenizin her köşesi. Tek çekirdekte.",
    lead: "İhtiyacınız olan modüllerle başlayın; ekibiniz ve süreçleriniz büyüdükçe sistemi genişletin.",
    cols: "two", numbered: true,
    items: [
      { title: "CRM ve satış", text: "Talebi müşteriye, müşteriyi gelire dönüştüren satış akışı.", items: ["Aşamalı satış hattı ve kayıp nedenleri", "Yeni talepte otomatik müşteri geçmişi", "Telefon veya isimle anlık müşteri sorgulama", "Satış temsilcisi ataması ve satış takvimi"] },
      { title: "Teklifler", text: "Hazırlamaktan onaya kadar ticari süreç.", items: ["Revizyonlar; KDV dahil, hariç veya muaf", "Tek ödeme ya da taksitli ödeme planı", "WhatsApp ve e-posta ile paylaşım bağlantısı", "Tarih-saat, IP ve cihaz kaydıyla çevrim içi onay"] },
      { title: "Sözleşmeler", text: "Tekliften tek adımda, imzaya hazır sözleşme.", items: ["Sözleşme şablonları", "Çizilen imza ve onay beyanlarıyla e-imza", "IP, zaman damgası, cihaz ve doğrulama özeti", "İmzadan sonra kilitlenen içerik, A4 PDF"] },
      { title: "Belge merkezi", text: "Her işin belgeleri tek zaman çizelgesinde.", items: ["Talep → teklif → sözleşme → operasyon → tahsilat", "Belge erişim kayıtları", "Önizleme ve PDF"] },
      { title: "Operasyon", text: "Satılan işi ekiplerin uygulayabileceği akışa dönüştürün.", items: ["Yeni, devam eden ve termini yaklaşan işler", "İş tablosu, Gantt şeması ve iş takvimi", "Görev, adım, sorumlu ve ilerleme yüzdesi", "İmzayla otomatik başlayan iş akışı ve arşiv"] },
      { title: "Müşteri takip portalı", text: "Müşterinize kendi işini izleyebileceği markalı bir sayfa.", items: ["Takip koduyla ilerleme ve aşamalar", "Ödeme özeti, teklif ve sözleşme belgeleri", "Operasyon ekibiyle mesajlaşma", "Ödemeye bağlı dosya teslimi, kısa ömürlü güvenli bağlantılar"] },
      { title: "Finans", text: "Satış ve operasyonla bağlantılı güncel finansal tablo.", items: ["Cari hesaplar ve hesap hareketleri", "Tahsilat, iade ve ek hizmetler", "Taksit planı ve taksit başına çevrim içi ödeme bağlantısı", "Faturalar, iş bazında maliyet ve gerçek kârlılık"] },
      { title: "İnsan kaynakları", text: "Ekip yapısı ve personel süreçleri ortak düzende.", items: ["Personel, departmanlar ve e-posta ile davet", "Roller ve oran geçmişli prim hesabı", "Personel etkinlik ve oturum kayıtları", "E-imzalı personel gizlilik sözleşmesi (NDA)"] },
      { title: "Raporlar", text: "Farklı modüllerden gelen veriyi karara dönüştürün.", items: ["En zayıf adımı işaretleyen satış hunisi", "Satış ve gerçek kârlılık", "Altı aylık eğilimler ve kayıp nedenleri", "Yazdırma ve PDF"] },
      { title: "İletişim", text: "Ekip içi iletişim, işin hemen yanında.", items: ["Dosya ekli birebir mesajlaşma", "Anlık sayaçlı bildirim merkezi", "Yönetim duyuruları", "Destek merkezi"] },
      { title: "Yetki ve güvenlik", text: "Kim neyi görür, net ve denetlenebilir.", items: ["Rol × modül yetki matrisi", "Kayıt düzeyinde erişim", "Veritabanında satır düzeyinde güvenlik", "Denetim geçmişi"] },
      { title: "Çok kiracılı yapı ve markalama", text: "Her kurum kendi alanında, kendi markasıyla.", items: ["Kuruma ait yalıtılmış çalışma alanı", "DNS doğrulamalı özel alan adı", "Logo, marka rengi, kaşe ve imza", "Belgelerde otomatik yasal ve banka bilgileri"] },
      { title: "Deneyim", text: "Masaüstünde güçlü, cepte bir uygulama kadar rahat.", items: ["Yüklenebilir PWA", "Alt sekme çubuğu ve alt paneller", "Koyu ve açık tema", "Türkçe arayüz"] },
    ],
  },
  faq: {
    eyebrow: "Sık sorulan sorular",
    title: "Modüller hakkında",
    items: [
      { q: "ArvoOS’ta hangi modüller var?", a: "CRM ve satış, teklifler, sözleşmeler, belge merkezi, operasyon, müşteri takip portalı, finans, insan kaynakları, raporlar ve iletişim; bunlara yetki, markalama ve mobil deneyim eşlik eder." },
      { q: "Modüller birbirine nasıl bağlanır?", a: "Hepsi aynı veri üzerinde çalışır: onaylanan teklif tek adımda sözleşmeye, imzalanan sözleşme otomatik olarak iş akışına dönüşür; tahsilat ve kârlılık aynı işe bağlanır." },
      { q: "Tüm modülleri kullanmak zorunda mıyız?", a: "Hayır. Paketiniz ihtiyaç duyduğunuz modüllere göre belirlenir; sistem büyüdükçe genişletilebilir." },
      { q: "Kim hangi modülü görebilir?", a: "Rol × modül yetki matrisiyle belirlenir; satış temsilcileri gibi roller yalnızca kendi kayıtlarını görebilir." },
    ],
  },
  cta: {
    title: "Hangi modüllerle başlayacağınızı birlikte belirleyelim.",
    actions: [
      { label: "Demo talep edin", href: `${R("contact")}?ilgi=arvoos`, variant: "gold" },
      { label: "Paketler", href: R("arvoos-plans"), variant: "ghost" },
    ],
  },
};
