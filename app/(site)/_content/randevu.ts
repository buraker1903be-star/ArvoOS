/*
  Arvo Randevu ürün sayfası — Türkçe.

  İÇERİK YALNIZCA YAYINDA OLAN ÖZELLİKLERİ ANLATIR. Kaynak, ürünün
  kendi PLAN.md'si: randevu sayfası, salon paneli (takvim, hizmet,
  personel, çalışma saati, izin, müşteriler, özet, kullanıcılar) ve
  WhatsApp'ın tek tıkla gönderimi yayında.

  YAZILMAYANLAR ve nedeni:
  - "Otomatik hatırlatma": kod hazır ama Meta'da şablon onayı
    bekleniyor (PLAN 6b). Onaylanmadan söz verilmez.
  - "Çoklu şube", "raporlar", "kapora", "sadakat": PLAN'da
    "sonraya" başlığında, henüz yok.
*/
import { PRODUCT_APPS, ROUTES } from "@/lib/site/routes";
import type { ProductContent } from "./types";

const R = (id: keyof typeof ROUTES) => ROUTES[id].tr;

export const RANDEVU_TR: ProductContent = {
  id: "randevu",
  name: "Arvo Randevu",
  category: "BusinessApplication",
  appUrl: PRODUCT_APPS.randevu.url,
  featureList: [
    "Çevrim içi randevu sayfası",
    "Personel bazlı takvim",
    "Hizmet ve personel tanımı",
    "Çalışma saati ve izin",
    "Müşteri kaydı",
    "WhatsApp hatırlatma",
  ],
  meta: {
    title: "Arvo Randevu — Salon Randevu Yönetimi",
    description:
      "Kuaför ve güzellik salonları için çevrim içi randevu: müşteri hizmeti, personeli ve saati kendi seçer; personel bazlı takvim, çalışma saati ve izin tanımı, WhatsApp hatırlatma.",
  },
  hero: {
    eyebrow: "Arvo Randevu · Salon randevu yönetimi",
    title: "Randevu defteri",
    subtitle: "telefonu meşgul etmesin.",
    lead:
      "Müşteri kendi randevusunu alır, takviminize anında düşer. Kim hangi hizmeti veriyorsa saatleri ona göre açılır; çakışan randevu sisteme hiç girmez.",
    actions: [
      { label: "Ücretleri görün", href: R("pricing"), variant: "gold" },
      { label: "Panele gidin", href: PRODUCT_APPS.randevu.url, external: true, variant: "ghost" },
    ],
  },
  features: {
    eyebrow: "Yetenekler",
    title: "Salonun günü tek ekranda.",
    lead:
      "Telefonla alınan randevu deftere yazılır, defter yanlış okunur, saat çakışır. Arvo Randevu bu zinciri baştan kurar.",
    items: [
      {
        title: "Çevrim içi randevu sayfası",
        text: "Müşteri hizmeti, personeli — ya da “fark etmez” — ve saati kendi seçer. Üyelik yok; telefon numarasıyla tanınır ve iptal bağlantısını alır.",
      },
      {
        title: "Personel bazlı takvim",
        text: "Randevu ekleyin, taşıyın, iptal edin. Takvim personel personel açılır; kimin ne zaman boşta olduğu tek bakışta görünür.",
      },
      {
        title: "Hizmet ve personel tanımı",
        text: "Hizmetin süresi, ardındaki toparlanma arası ve hangi personelin verdiği tek yerde tanımlanır.",
      },
      {
        title: "Çalışma saati ve izin",
        text: "Haftalık çalışma saatleri salonun kendi saatiyle girilir. İzin tek personele de, salonun tamamına da tanımlanabilir.",
      },
      {
        title: "Çakışmayı veritabanı engeller",
        text: "Aynı personele çakışan randevu, hizmetin arası da hesaba katılarak veritabanı düzeyinde reddedilir. “Önce kontrol et, sonra yaz” yeterli sayılmaz.",
      },
      {
        title: "WhatsApp hatırlatma",
        text: "Günün hatırlatma listesi panelde hazır; tek tıkla WhatsApp'tan gönderilir. Salon kendi numarasını bağladıysa mesaj Arvo'dan değil salondan gider.",
      },
    ],
  },
  flow: {
    eyebrow: "Nasıl başlar?",
    title: "Kurulum bir oturumda biter.",
    lead: "Hizmetlerinizi ve personelinizi tanımladığınız anda randevu adresiniz çalışır.",
    steps: [
      { title: "Salonu tanımlayın", text: "Kurulum sihirbazı hizmetleri, personeli ve çalışma saatlerini sırayla sorar." },
      { title: "Adresinizi paylaşın", text: "Randevu sayfanızın adresini Instagram profilinize, WhatsApp durumunuza ya da kartvizitinize koyun." },
      { title: "Takvimi izleyin", text: "Gelen randevular takvime düşer; gün başında hatırlatma listesi hazır bekler." },
    ],
  },
  audience: {
    eyebrow: "Kimler için?",
    title: "Randevuyla çalışan her salon.",
    items: [
      { title: "Kuaför ve berberler", text: "Koltuk başına dolu bir gün; telefonu bırakıp işe dönmek isteyen salonlar." },
      { title: "Güzellik merkezleri", text: "Süresi ve arası farklı hizmetleri aynı takvimde yöneten ekipler." },
      { title: "Bakım ve bakım-sonrası", text: "Personel uzmanlığına göre saat açan, izinleri sık değişen işletmeler." },
    ],
  },
  faq: {
    eyebrow: "Sık sorulan sorular",
    title: "Arvo Randevu hakkında",
    items: [
      { q: "Müşterinin üye olması gerekiyor mu?", a: "Hayır. Müşteri hizmeti, personeli ve saati seçer, telefon numarasını yazar; numarayla tanınır. Randevu sonrası iptal bağlantısını alır." },
      { q: "Aynı saate iki randevu girebilir mi?", a: "Hayır. Aynı personele çakışan randevu, hizmetin arası da hesaba katılarak veritabanı düzeyinde reddedilir — arayüzdeki bir kontrole bağlı değildir." },
      { q: "Çalışma saatleri ve izinler nasıl tanımlanıyor?", a: "Haftalık çalışma saatleri salonun kendi saatiyle girilir. İzin tek bir personele ya da salonun tamamına tanımlanabilir; o aralıkta saat açılmaz." },
      { q: "Hatırlatma mesajı kimden gidiyor?", a: "Günün hatırlatma listesi panelde hazırlanır ve tek tıkla WhatsApp'tan gönderilir. Salon kendi WhatsApp numarasını panelden bağladıysa mesaj salondan gider; bağlamadıysa Arvo'nun ortak numarasından." },
      { q: "Fiyatı nedir?", a: `Aylık ve yıllık liste fiyatları ${R("pricing")} sayfasında yayımlanmıştır.` },
    ],
  },
  cta: {
    title: "Randevu defterini bırakmaya hazır mısınız?",
    lead: "Kurulumu birlikte yapalım; hizmetleriniz ve personeliniz tanımlıysa randevu sayfanız aynı gün açılır.",
    actions: [
      { label: "Demo talep edin", href: `${R("contact")}?ilgi=randevu`, variant: "gold" },
      { label: "Ücretler", href: R("pricing"), variant: "ghost" },
    ],
  },
};
