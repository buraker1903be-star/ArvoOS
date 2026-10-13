/*
  Kurucu konsolunun uygulamaları.

  Konsol 13.10.2026'ya kadar ESKİ kabukta kalmıştı: sol menü + üst
  breadcrumb çubuğu. Gerekçe "orası tek bir kurumun çalışma alanı değil"
  idi, ama kabuğun kiracıya özel olan parçaları (çalışma alanı seçici,
  mesaj çekmecesi, ekip varlığı) zaten ayrıca eleniyor; geriye kalan
  işletim sistemi mantığının konsolda çalışmaması için bir sebep yok.
  Kurum sahibi gün içinde iki kabuk arasında gidip geliyor ve birinde
  dock, ötekinde sol menü aramak gerekiyordu.

  Liste panelin OsUygulama sözleşmesini kullanıyor: dock, başlatıcı,
  durum çubuğundaki uygulama adı ve Ctrl+K araması aynı yerden besleniyor.

  Saf modül: Next/React/Supabase'e dokunmaz, birim testi konsol-apps.test.ts.
*/
import type { OsUygulama } from "./os-apps";

/*
  ALTI UYGULAMA (14.10.2026, kurum sahibinin tarifi): Ana Sayfa,
  Kurulumlar, Kullanıcılar, Ürünler, Finans, Sistem Sağlığı.

  Önceki iki deneme yanlış eksendeydi. İlki konsolun dokuz EKRANINI
  dokuz dock girdisi yaptı: dock bir başlatıcıya dönüştü, "nereye
  bakacağım" sorusu kolaylaşmadı. İkincisi ekranları yakınlıklarına
  göre topladı ama gruplar hâlâ ekran adlarıydı (Müşteriler, Finans,
  Lisans). Bu liste İŞİN eksenine göre: kurucunun soruları "kurulum
  tamam mı", "kim kullanıyor", "ürünlerde ne var", "para nerede",
  "bir şey mi bozuldu".

  Ayrıntı İKİNCİ KATTA (bolumler): dock simgesinin üstüne gelince
  bölümler açılıyor — panelde CRM ve Finans nasıl çalışıyorsa öyle.

  Yol öneklerinde sıralama ÖNEMLİ DEĞİL, uzunluk önemli: etkinUygulama
  en uzun eşleşeni seçiyor. "/panel/platform" Müşteriler uygulamasına
  bağlı ama "/panel/platform/licenses" daha uzun olduğu için lisans
  sayfasında Lisans uygulaması etkin sayılıyor.
*/
export function konsolUygulamalari(): OsUygulama[] {
  return [
    { key: "home", label: "Ana Sayfa", href: "/panel", ikon: "home", yollar: [] },
    {
      key: "kurulumlar", label: "Kurulumlar", href: "/panel/platform/kurulumlar", ikon: "building",
      /* Kiracı dosyası (/panel/platform) ayrı bir uygulama değil, kurulumun
         ayrıntısı; lisans ve kota da kurumun kurulumunun parçası. */
      yollar: ["/panel/platform/kurulumlar", "/panel/platform", "/panel/platform/licenses"],
      bolumler: [
        { key: "yeni", href: "/panel/platform/kurulumlar?asama=yeni", label: "Yeni kurulum" },
        { key: "devam", href: "/panel/platform/kurulumlar?asama=devam", label: "Kurulumu devam edenler" },
        { key: "tamam", href: "/panel/platform/kurulumlar?asama=tamam", label: "Tamamlananlar" },
        { key: "kiracilar", href: "/panel/platform", label: "Kiracı dosyaları" },
        { key: "lisans", href: "/panel/platform/licenses", label: "Lisans ve kota" },
      ],
    },
    {
      key: "kullanicilar", label: "Kullanıcılar", href: "/panel/platform/kullanicilar", ikon: "crm",
      yollar: ["/panel/platform/kullanicilar", "/panel/platform/members", "/panel/platform/musteriler"],
      bolumler: [
        { key: "aktif", href: "/panel/platform/kullanicilar?evre=aktif", label: "Aktif kullanıcılar" },
        { key: "pasif", href: "/panel/platform/kullanicilar?evre=pasif", label: "Pasif kullanıcılar" },
        { key: "davet", href: "/panel/platform/kullanicilar?evre=davet", label: "Davet bekleyenler" },
        { key: "musteriler", href: "/panel/platform/musteriler", label: "Müşteriler" },
        { key: "uyeler", href: "/panel/platform/members", label: "Kurum bazında üyeler" },
      ],
    },
    {
      key: "urunler", label: "Ürünler", href: "/panel/platform/moduller", ikon: "apps",
      /* Ürün planı ve fiyatı (product_plans) ürün yapılandırmasıdır,
         finans değil: fiyatı belirlemek ürünün kendi ayarı. */
      yollar: ["/panel/platform/moduller", "/panel/platform/subscribers"],
      bolumler: [
        { key: "matris", href: "/panel/platform/moduller", label: "Modül matrisi" },
        { key: "planlar", href: "/panel/platform/subscribers", label: "Ürün planları" },
      ],
    },
    {
      key: "finans", label: "Finans", href: "/panel/platform/billing", ikon: "finance",
      yollar: ["/panel/platform/billing", "/panel/platform/payments", "/panel/platform/sozlesmeler"],
      bolumler: [
        { key: "abonelikler", href: "/panel/platform/billing", label: "Abonelikler" },
        { key: "odemeler", href: "/panel/platform/payments", label: "Ödeme onayları" },
        { key: "sozlesmeler", href: "/panel/platform/sozlesmeler", label: "Sözleşme onayları" },
      ],
    },
    { key: "saglik", label: "Sistem Sağlığı", href: "/panel/platform/saglik", ikon: "pulse", yollar: ["/panel/platform/saglik"] },
  ];
}
