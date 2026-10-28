/*
  Ücretler sayfası — Türkçe metin. RAKAM YOKTUR: tutarlar
  lib/site/pricing.ts'ten gelir (bkz. types.ts → PricingContent).

  Paket içeriklerinde yalnızca panelde karşılığı olan özellikler yazılır.
  ArvoCal'da (eski Arvo Randevu) WhatsApp hatırlatması yazılmaz —
  şablonlar henüz Meta onayında. ArvoARC 28.10.2026'da satıştan kalktı;
  e-ticaret sitesi yaptıranlara panel olarak veriliyor, fiyatı burada yok.
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
      "ArvoOS, ArvoCal ve ArvoLab abonelik ücretleri: aylık ve yıllık fiyatlar, paket içerikleri, ek kalemler ve abonelik koşulları. Fiyatlar kurum başınadır, kullanıcı başına değil.",
  },
  hero: {
    eyebrow: "Ücretler",
    /* Eskiden yalnızca "Kullanıcı başına değil, kurum başına." yazıyordu.
       ArvoLab koltuk başı fiyatlanmaya geçince bu cümle sayfanın dörtte
       biri için yanlış oldu; kapsam başlığa yazıldı ve istisna lead'de
       gerekçesiyle söylendi. */
    title: "İşletme ürünlerinde kullanıcı başına değil,",
    subtitle: "kurum başına.",
    lead: "ArvoOS ve ArvoCal kurum başına fiyatlanır: ekibiniz büyüdükçe fatura katlanmaz, dahil olan kullanıcı sayısı her kartta yazar. ArvoLab bunun dışındadır — değeri kurumun akışında değil doğrudan yazan kişide olduğu için araştırmacı başına fiyatlanır.",
    actions: [demo, { label: "Abonelik koşulları", href: "#kosullar", variant: "ghost" }],
  },
  cycle: {
    monthly: "Aylık",
    yearly: "Yıllık",
    badge: "2 ay bedava",
    perMonth: "/ay",
    perYear: "/yıl",
    perMonthUser: "/kullanıcı/ay",
    perYearUser: "/kullanıcı/yıl",
    quote: "Teklif",
    quoteAction: "Teklif isteyin",
  },
  vatNote:
    "Tüm fiyatlar Türk lirası üzerindendir ve KDV dahildir. Yıllık seçenekte 12 aylık kullanım için 10 aylık bedel ödenir; tutar dönem başında tek seferde faturalanır.",

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
          items: ["3 kullanıcı dahil", "Tek şube", "CRM ve satış hattı", "Teklif ve e-imzalı sözleşme", "Operasyon ve görev akışı", "Finans ve tahsilat takibi", "E-posta destek"],
        },
        {
          code: "arvoos-kurumsal",
          text: "Birden çok ekibi veya şubeyi bağlantılı süreçlerle yönetmek isteyen kurumlar için.",
          items: ["15 kullanıcı dahil", "Sınırsız şube", "Tüm modüller", "Müşteri takip portalı", "Rol × modül yetki matrisi", "Gelişmiş raporlama", "Öncelikli destek"],
        },
        {
          code: "arvoos-ozel",
          text: "ArvoOS'u kendi çalışma modeli ve kurumsal kimliğiyle kullanmak isteyen yapılar için.",
          items: ["Sınırsız kullanıcı", "Kuruma özel alan adı", "Kuruma özel iş akışları", "Markalı müşteri deneyimi", "Veri aktarımı ve ekip eğitimi", "Kurulum danışmanlığı"],
        },
      ],
    },
    {
      product: "randevu",
      tag: "Randevu yönetimi",
      lead: "Kuaför ve güzellik salonları için çevrim içi randevu sayfası, takvim ve müşteri kaydı. Çalışma saatleri Türkiye saatiyle tanımlanır.",
      linkLabel: "ArvoCal'ı inceleyin",
      cards: [
        {
          code: "randevu-tek",
          text: "Tek adreste çalışan, randevularını telefondan ve deftere yazarak takip eden salonlar için.",
          items: ["Tek şube", "5 personele kadar", "Çevrim içi randevu sayfası", "Randevu takvimi", "Müşteri kaydı ve geçmişi", "E-posta destek"],
        },
        {
          code: "randevu-coklu",
          text: "Birden çok salonu merkezden görmek ve şube bazında yetki vermek isteyen işletmeler için.",
          items: ["3 şubeye kadar", "Sınırsız personel", "Şube bazlı takvim ve yetki", "Merkezî raporlar", "Öncelikli destek"],
        },
        {
          code: "randevu-zincir",
          text: "Üçten çok şubesi olan ve kendi markasıyla görünmek isteyen zincirler için.",
          items: ["Sınırsız şube", "Kuruma özel alan adı", "Kuruma özel iş akışları", "Kurulum ve ekip eğitimi"],
        },
      ],
    },
    {
      product: "arvolab",
      tag: "Araştırma çalışma alanı",
      /* Fiyat yükseldi (bkz. pricing.ts); değeri de yazmak gerekiyor.
         "Türkiye'de tek" gibi kanıtlanamaz bir üstünlük iddiası YAZILMAZ —
         yerine ölçülebilir olan söylenir: ayrı araçlar, ayrı abonelikler. */
      lead: "Literatür ve atıftan akademik yazıma, kılavuz kontrolünden analize ve özgünlük ön kontrolüne kadar araştırma sürecinin tamamı tek çalışma alanında — her adım için ayrı bir araca ve ayrı bir aboneliğe gerek kalmadan. Bireysel araştırmacıya satılır; fiyat araştırmacı başınadır.",
      linkLabel: "ArvoLab'i inceleyin",
      cards: [
        {
          code: "arvolab-arastirmaci",
          text: "Tezini, makalesini veya projesini tek başına yürüten araştırmacılar için.",
          items: ["Tek araştırmacı", "Literatür ve atıf yönetimi", "Akademik yazım", "Kılavuz kontrolü", "Analiz merkezi (nicel ve nitel)", "Özgünlük ön kontrolü"],
        },
        {
          code: "arvolab-kurum",
          text: "Yalnızca üniversiteler ve eğitim kurumları için: bölüm ya da üniversite geneli site lisansı, teklif usulüyle.",
          items: ["Sınırsız araştırmacı", "Bölüm veya üniversite geneli site lisansı", "Kurum içi kullanıcı yönetimi", "Kuruma özel alan adı", "Kurulum ve eğitim", "Faturalandırma kuruma"],
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
      { code: "ek-kullanici", name: "Ek kullanıcı", text: "ArvoOS paketlerinde dahil olan kullanıcı sayısını aşan her kullanıcı için. ArvoLab zaten araştırmacı başına fiyatlandığı için bu kalem orada işlemez." },
      { code: "ek-sube", name: "Ek şube", text: "ArvoCal Çok şube paketindeki üç şubeyi aşan her şube için." },
      { code: "veri-aktarimi", name: "Veri aktarımı ve kurulum", text: "Mevcut sisteminizden veri taşıma, kullanıcı tanımlama ve ekip eğitimi. Kapsama göre tek seferlik ücretlendirilir." },
      { code: "ozel-gelistirme", name: "Kuruma özel geliştirme", text: "Kuruma özel iş akışı, ekran veya rapor geliştirmesi. Kapsam netleştikten sonra teklif edilir." },
    ],
  },

  policy: {
    eyebrow: "Abonelik koşulları",
    title: "Fiyatın arkasındaki kurallar.",
    lead: "Aşağıdakiler özet değil, uyguladığımız kuralların kendisidir; tamamı mesafeli satış sözleşmesi ile iptal ve iade koşullarında yazılıdır.",
    items: [
      /*
        28.10.2026'ya kadar "otomatik çekim yok" yazıyordu; artık ödeme
        sırasında kart kaydedip otomatik yenileme SEÇİLEBİLİYOR. Özellik
        kademeli açıldığı için metin bir kural olarak yazıldı ("bu sayfada
        seçebilirsiniz" değil): açılmadan önce de sonra da doğru kalmalı.
      */
      { title: "Onayınız olmadan çekim yok", text: "Kartınızdan, açık onayınız olmadan tahsilat yapılmaz. Varsayılan olarak her dönem için ödeme bağlantısı gönderilir ve ödemeyi siz onaylarsınız. Ödeme sırasında kartınızı kaydedip otomatik yenilemeyi seçerseniz, her çekimden en az 3 gün önce bilgilendirilirsiniz ve otomatik yenilemeyi istediğiniz zaman kapatabilirsiniz." },
      { title: "İptal dönem sonunda", text: "Aboneliği panelden ya da e-posta ile iptal edebilirsiniz. İptal, ödenmiş dönemin sonunda yürürlüğe girer; o güne kadar hizmet açık kalır." },
      { title: "Fiyat değişikliği", text: "Yürürlükteki döneminiz etkilenmez. Değişiklik en az 30 gün önce e-posta ile bildirilir ve yalnızca sonraki dönemde uygulanır." },
      { title: "Paket yükseltme ve düşürme", text: "Yükseltme aynı gün yürürlüğe girer; yalnızca dönemin kalan günleri için fark alınır. Düşürme, mevcut dönemin sonunda uygulanır." },
      { title: "Yıllık abonelikte erken iptal", text: "Kullandığınız aylar aylık liste fiyatı üzerinden hesaplanır, kalan bakiye iade edilir. Yıllık indirim yalnızca kullanılmayan aylar için geri alınır." },
      { title: "KDV ve fatura", text: "Listelenen tutarlara KDV dahildir; faturada KDV ayrıca gösterilir. Her dönem için fatura düzenlenir ve kayıtlı e-posta adresinize gönderilir." },
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
      { q: "Fiyatlara KDV dahil mi?", a: "Evet. Sayfadaki tutarlara KDV dahildir; ödediğiniz tutar ekrandaki tutardır, faturada KDV ayrıca gösterilir." },
      { q: "Kullanıcı başına mı ödüyoruz?", a: "ArvoOS ve ArvoCal'da hayır: fiyat kurum başınadır ve her pakette belirli sayıda kullanıcı vardır; bu sayıyı aşarsanız yalnızca ek kullanıcı ücreti işlenir, paket fiyatı katlanmaz. ArvoLab'de evet: araştırmacı başına fiyatlanır, çünkü orada değeri üreten doğrudan kullanan kişidir." },
      { q: "ArvoLab'i bir ekip ya da şirket olarak alabilir miyiz?", a: "ArvoLab bireysel araştırmacılara satılır. Kurum lisansı yalnızca üniversitelere ve eğitim kurumlarına, teklif usulüyle verilir." },
      { q: "Yıllık ödeme ne kazandırır?", a: "Yıllık seçenekte 12 aylık kullanım için 10 aylık bedel ödenir; iki ay bedavadır. Tutar dönem başında tek seferde faturalanır." },
      { q: "Abonelik otomatik yenileniyor mu?", a: "Siz seçmedikçe hayır. Varsayılan olarak kartınızdan otomatik tahsilat yapılmaz; her dönem için ödeme bağlantısı gönderilir. Ödeme sırasında kartınızı kaydedip otomatik yenilemeyi seçebilirsiniz; çekimden en az 3 gün önce bildirim alırsınız ve otomatik yenilemeyi hesabınızdaki ödeme ekranından istediğiniz zaman kapatabilirsiniz." },
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
