/*
  Ücretler sayfası — Türkçe metin. RAKAM YOKTUR: tutarlar
  lib/site/pricing.ts'ten gelir (bkz. types.ts → PricingContent).

  Paket içeriklerinde yalnızca panelde karşılığı olan özellikler yazılır.
  ArvoARC'ta entegrasyon / ödeme / kargo / pazaryeri / stok senkronu iddiası
  YASAK (arc.ts ile aynı kural); Arvo Randevu'da WhatsApp hatırlatması
  yazılmaz — şablonlar henüz Meta onayında.
*/
import { COMPANY, ROUTES } from "@/lib/site/routes";
import type { PricingContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;
const demo = { label: "Demo talep edin", href: `${R("contact")}?ilgi=ucretler`, variant: "gold" as const };

export const PRICING_TR: PricingContent = {
  id: "pricing",
  meta: {
    title: "Ücretler",
    description:
      "ArvoOS, ArvoARC, Arvo Randevu ve ArvoLab abonelik ücretleri: aylık ve yıllık fiyatlar, paket içerikleri, ek kalemler ve abonelik koşulları. Fiyatlar kurum başınadır, kullanıcı başına değil.",
  },
  hero: {
    eyebrow: "Ücretler",
    title: "Kullanıcı başına değil,",
    subtitle: "kurum başına.",
    lead: "Dört ürünün de aylık ve yıllık ücretleri burada açıkça yazılıdır. Ekibiniz büyüdükçe fatura katlanmaz: paketler kurum başına fiyatlanır ve dahil olan kullanıcı sayısı her kartta yazar.",
    actions: [demo, { label: "Abonelik koşulları", href: "#kosullar", variant: "ghost" }],
  },
  cycle: {
    monthly: "Aylık",
    yearly: "Yıllık",
    badge: "2 ay bedava",
    perMonth: "/ay",
    perYear: "/yıl",
    quote: "Teklif",
    quoteAction: "Teklif isteyin",
  },
  vatNote:
    "Tüm fiyatlar KDV hariçtir ve Türk lirası üzerindendir. Yıllık seçenekte 12 aylık kullanım için 10 aylık bedel ödenir; tutar dönem başında tek seferde faturalanır.",

  groups: [
    {
      product: "arvoos",
      tag: "İşletme işletim sistemi",
      lead: "CRM, teklif, e-imzalı sözleşme, operasyon, finans, İK ve raporlama tek akışta. Kullanıcı sayısı pakete dahildir.",
      linkLabel: "ArvoOS'u inceleyin",
      cards: [
        {
          code: "arvoos-baslangic",
          text: "Müşteri, iş ve finans süreçlerini tek düzende yönetmek isteyen ekipler için.",
          items: ["5 kullanıcı dahil", "Tek şube", "CRM ve satış hattı", "Teklif ve e-imzalı sözleşme", "Operasyon ve görev akışı", "Finans ve tahsilat takibi", "E-posta destek"],
        },
        {
          code: "arvoos-kurumsal",
          text: "Birden çok ekibi veya şubeyi bağlantılı süreçlerle yönetmek isteyen kurumlar için.",
          items: ["25 kullanıcı dahil", "Sınırsız şube", "Tüm modüller", "Müşteri takip portalı", "Rol × modül yetki matrisi", "Gelişmiş raporlama", "Öncelikli destek"],
        },
        {
          code: "arvoos-ozel",
          text: "ArvoOS'u kendi çalışma modeli ve kurumsal kimliğiyle kullanmak isteyen yapılar için.",
          items: ["Sınırsız kullanıcı", "Kuruma özel alan adı", "Kuruma özel iş akışları", "Markalı müşteri deneyimi", "Veri aktarımı ve ekip eğitimi", "Kurulum danışmanlığı"],
        },
      ],
    },
    {
      product: "arc",
      tag: "E-ticaret ve mağaza yönetimi",
      lead: "Ürün (katalog) ve sipariş yönetimi tek panelde. Self servis kurulur; mağazanız kendi çalışma alanında çalışır.",
      linkLabel: "ArvoARC'ı inceleyin",
      cards: [
        {
          code: "arc-baslangic",
          text: "Katalogunu ve siparişlerini dağınık tablolardan tek panele taşımak isteyen mağazalar için.",
          items: ["500 ürüne kadar", "Tek mağaza", "3 kullanıcı", "Ürün (katalog) yönetimi", "Sipariş yönetimi", "E-posta destek"],
        },
        {
          code: "arc-buyume",
          text: "Katalogu ve sipariş hacmi büyüyen, kendi alan adında görünmek isteyen markalar için.",
          items: ["5.000 ürüne kadar", "Tek mağaza", "10 kullanıcı", "Kuruma özel alan adı", "Ürün ve sipariş yönetimi", "Öncelikli destek"],
        },
        {
          code: "arc-olcek",
          text: "Birden çok mağazayı aynı düzende yönetmek isteyen işletmeler için.",
          items: ["Sınırsız ürün", "5 mağazaya kadar", "Sınırsız kullanıcı", "Kuruma özel alan adı", "Mağaza bazlı yetkilendirme", "Öncelikli destek"],
        },
      ],
    },
    {
      product: "randevu",
      tag: "Randevu yönetimi",
      lead: "Kuaför ve güzellik salonları için çevrim içi randevu sayfası, takvim ve müşteri kaydı. Çalışma saatleri Türkiye saatiyle tanımlanır.",
      linkLabel: "Arvo Randevu'yu açın",
      cards: [
        {
          code: "randevu-tek",
          text: "Tek adreste çalışan, randevularını telefondan ve deftere yazarak takip eden salonlar için.",
          items: ["Tek şube", "5 personele kadar", "Çevrim içi randevu sayfası", "Randevu takvimi", "Müşteri kaydı ve geçmişi", "E-posta destek"],
        },
        {
          code: "randevu-coklu",
          text: "Birden çok salonu merkezden görmek ve şube bazında yetki vermek isteyen işletmeler için.",
          items: ["5 şubeye kadar", "Sınırsız personel", "Şube bazlı takvim ve yetki", "Merkezî raporlar", "Öncelikli destek"],
        },
        {
          code: "randevu-zincir",
          text: "Beşten çok şubesi olan ve kendi markasıyla görünmek isteyen zincirler için.",
          items: ["Sınırsız şube", "Kuruma özel alan adı", "Kuruma özel iş akışları", "Kurulum ve ekip eğitimi"],
        },
      ],
    },
    {
      product: "arvolab",
      tag: "Araştırma çalışma alanı",
      lead: "Literatür ve atıftan akademik yazıma, kılavuz kontrolünden analize kadar araştırma süreci tek çalışma alanında.",
      linkLabel: "ArvoLab'i inceleyin",
      cards: [
        {
          code: "arvolab-arastirmaci",
          text: "Tezini, makalesini veya projesini tek başına yürüten araştırmacılar için.",
          items: ["1 kullanıcı", "Literatür ve atıf yönetimi", "Akademik yazım", "Kılavuz kontrolü", "Özgünlük ön kontrolü"],
        },
        {
          code: "arvolab-ekip",
          text: "Ortak kaynak ve ortak yazım düzeni isteyen araştırma ekipleri için.",
          items: ["5 kullanıcı", "Ortak kaynak kütüphanesi", "Analiz merkezi (nicel ve nitel)", "Akademik editör", "Öncelikli destek"],
        },
        {
          code: "arvolab-kurum",
          text: "Bölüm veya üniversite genelinde kullanmak isteyen kurumlar için.",
          items: ["Bölüm veya kurum geneli kullanım", "Kurum içi kullanıcı yönetimi", "Kuruma özel alan adı", "Kurulum ve eğitim"],
        },
      ],
    },
  ],

  addOns: {
    eyebrow: "Pakete dahil değil",
    title: "Ayrıca ücretlendirilen kalemler.",
    lead: "Paketinizin sınırını aştığınızda ya da kuruma özel bir iş istediğinizde geçerlidir. Sürpriz kalem yoktur: aşağıdakiler dışında ek ücret alınmaz.",
    quote: "Teklif",
    items: [
      { code: "ek-kullanici", name: "Ek kullanıcı", text: "ArvoOS ve ArvoLab paketlerinde dahil olan kullanıcı sayısını aşan her kullanıcı için." },
      { code: "ek-sube", name: "Ek şube", text: "Arvo Randevu Çok şube paketindeki beş şubeyi aşan her şube için." },
      { code: "veri-aktarimi", name: "Veri aktarımı ve kurulum", text: "Mevcut sisteminizden veri taşıma, kullanıcı tanımlama ve ekip eğitimi. Kapsama göre tek seferlik ücretlendirilir." },
      { code: "ozel-gelistirme", name: "Kuruma özel geliştirme", text: "Kuruma özel iş akışı, ekran veya rapor geliştirmesi. Kapsam netleştikten sonra teklif edilir." },
    ],
  },

  policy: {
    eyebrow: "Abonelik koşulları",
    title: "Fiyatın arkasındaki kurallar.",
    lead: "Aşağıdakiler özet değil, uyguladığımız kuralların kendisidir; tamamı mesafeli satış sözleşmesi ile iptal ve iade koşullarında yazılıdır.",
    items: [
      { title: "Otomatik çekim yok", text: "Kartınızdan kendiliğinden tahsilat yapılmaz. Her dönem için ödeme bağlantısı gönderilir ve ödemeyi siz onaylarsınız." },
      { title: "İptal dönem sonunda", text: "Aboneliği panelden ya da e-posta ile iptal edebilirsiniz. İptal, ödenmiş dönemin sonunda yürürlüğe girer; o güne kadar hizmet açık kalır." },
      { title: "Fiyat değişikliği", text: "Yürürlükteki döneminiz etkilenmez. Değişiklik en az 30 gün önce e-posta ile bildirilir ve yalnızca sonraki dönemde uygulanır." },
      { title: "Paket yükseltme ve düşürme", text: "Yükseltme aynı gün yürürlüğe girer; yalnızca dönemin kalan günleri için fark alınır. Düşürme, mevcut dönemin sonunda uygulanır." },
      { title: "Yıllık abonelikte erken iptal", text: "Kullandığınız aylar aylık liste fiyatı üzerinden hesaplanır, kalan bakiye iade edilir. Yıllık indirim yalnızca kullanılmayan aylar için geri alınır." },
      { title: "KDV ve fatura", text: "Listelenen tutarlar KDV hariçtir. Her dönem için fatura düzenlenir ve kayıtlı e-posta adresinize gönderilir." },
    ],
    links: [
      { label: "Mesafeli Satış Sözleşmesi", href: R("distance-sales"), variant: "ghost" },
      { label: "İptal ve İade Koşulları", href: R("refund"), variant: "ghost" },
      { label: "Teslimat ve Hizmetin İfası", href: R("delivery"), variant: "ghost" },
    ],
  },

  faq: {
    eyebrow: "Sık sorulan sorular",
    title: "Ücretler hakkında",
    items: [
      { q: "Fiyatlara KDV dahil mi?", a: "Hayır. Sayfadaki tutarlar KDV hariçtir; faturada yürürlükteki oranda KDV eklenir." },
      { q: "Kullanıcı başına mı ödüyoruz?", a: "Hayır. Fiyatlar kurum başınadır; her paketin içinde belirli sayıda kullanıcı vardır. Bu sayıyı aşarsanız yalnızca ek kullanıcı ücreti işlenir, paket fiyatı katlanmaz." },
      { q: "Yıllık ödeme ne kazandırır?", a: "Yıllık seçenekte 12 aylık kullanım için 10 aylık bedel ödenir; iki ay bedavadır. Tutar dönem başında tek seferde faturalanır." },
      { q: "Abonelik otomatik yenileniyor mu?", a: "Hayır. Kartınızdan otomatik tahsilat yapılmaz; her dönem için ödeme bağlantısı gönderilir ve ödemeyi siz onaylarsınız." },
      { q: "Paketimi sonradan değiştirebilir miyim?", a: "Evet. Yükseltme aynı gün yürürlüğe girer ve yalnızca dönemin kalan günleri için fark alınır; düşürme mevcut dönemin sonunda uygulanır." },
      { q: "Fiyatlar değişirse ne olur?", a: "Yürürlükteki döneminiz etkilenmez. Değişiklik en az 30 gün önce bildirilir ve sonraki dönemde uygulanır." },
      { q: "Yıllık ödedim, erken iptal edersem ne olur?", a: "Kullandığınız aylar aylık liste fiyatı üzerinden hesaplanır ve kalan bakiye iade edilir; yıllık indirim yalnızca kullanılmayan aylar için geri alınır." },
      { q: "Birden çok ürünü birlikte alırsak indirim var mı?", a: "Evet, birden çok ürünü birlikte kullanan kurumlara paket teklifi hazırlanır. Kapsamı konuşmak için demo talep edin." },
    ],
  },

  cta: {
    title: "Kurumunuza uyan paketi birlikte seçelim.",
    lead: "Hangi basamakla başlayacağınızdan emin değilseniz, süreçlerinizi birlikte çıkarır ve doğru paketi öneririz.",
    actions: [demo, { label: "Bize yazın", href: `mailto:${COMPANY.email}`, variant: "ghost" }],
  },
};
