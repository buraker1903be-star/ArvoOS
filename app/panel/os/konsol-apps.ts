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
  SEKİZ ANA MENÜ (14.10.2026, Kurucu Yönetim Konsolu tarifi): Genel
  Bakış, Ürünler, Müşteriler, Kurulum Yönetimi, Ücret ve Paketler,
  Abonelikler, Faturalama ve Tahsilat, Sistem Ayarları.

  Bir gün önce dock altı uygulamaya indirilmişti (Ana Sayfa, Kurulumlar,
  Kullanıcılar, Ürünler, Finans, Sistem Sağlığı); kurum sahibi konsolun
  iskeletini sekiz ana menüyle tarif etti ve dock'ta sekizini istedi.
  Değişenler: Kullanıcılar Müşteriler'in, Sistem Sağlığı Sistem
  Ayarları'nın altına indi; Finans "Abonelikler" ve "Faturalama ve
  Tahsilat" olarak ikiye ayrıldı; fiyatlandırma Ürünler'in sekmesi
  olmaktan çıkıp kendi menüsü oldu ("en önemli konu").

  İlk denemenin hatası (konsolun dokuz EKRANI dokuz dock girdisi) burada
  yok: girdiler ekran değil iş alanı; ayrıntı hâlâ İKİNCİ KATTA
  (bolumler), panelde CRM ve Finans nasıl çalışıyorsa öyle.

  Yol öneklerinde sıralama ÖNEMLİ DEĞİL, uzunluk önemli: etkinUygulama
  en uzun eşleşeni seçiyor. "/panel/platform" Kurulum Yönetimi'ne bağlı
  ama "/panel/platform/musteriler" daha uzun olduğu için orada Müşteriler
  etkin sayılıyor.
*/
export function konsolUygulamalari(): OsUygulama[] {
  return [
    { key: "home", label: "Genel Bakış", href: "/panel", ikon: "home", yollar: [] },
    {
      key: "urunler", label: "Ürünler", href: "/panel/platform/urunler", ikon: "apps",
      /* Bireysel abone planı (deneme süresi) ürünün kendi ayarı. */
      yollar: ["/panel/platform/urunler", "/panel/platform/moduller", "/panel/platform/subscribers"],
      /* Yalnızca dört ürün (14.10.2026, kurum sahibinin isteği): yedi
         bölüm alt çubukta kalabalıktı. Dört ürünün özeti dock simgesinin
         kendisi (/panel/platform/urunler); modül matrisi ve bireysel abone
         planlarına o sayfanın ve ürün sayfalarının bağlantılarından gidiliyor. */
      bolumler: [
        { key: "arvoos", href: "/panel/platform/urunler/arvoos", label: "ArvoOS" },
        { key: "arc", href: "/panel/platform/urunler/arc", label: "ArvoARC" },
        { key: "arvolab", href: "/panel/platform/urunler/arvolab", label: "ArvoLab" },
        { key: "randevu", href: "/panel/platform/urunler/randevu", label: "Arvo Randevu" },
      ],
    },
    {
      key: "musteriler", label: "Müşteriler", href: "/panel/platform/musteriler", ikon: "crm",
      yollar: ["/panel/platform/musteriler", "/panel/platform/kullanicilar"],
      bolumler: [
        { key: "musteriler", href: "/panel/platform/musteriler", label: "Müşteriler" },
        /* Tek "Kullanıcılar" (14.10.2026): aktif, pasif ve davet bekleyenler
           ayrı üç menü öğesiydi; sayfanın kendi sekmeleri zaten bunlar. */
        { key: "kullanicilar", href: "/panel/platform/kullanicilar", label: "Kullanıcılar" },
      ],
    },
    {
      key: "kurulumlar", label: "Kurulum Yönetimi", href: "/panel/platform/kurulumlar", ikon: "building",
      /* Kiracı dosyası (/panel/platform) ayrı bir uygulama değil, kurulumun
         ayrıntısı; lisans ve kota da kurumun kurulumunun parçası. */
      yollar: ["/panel/platform/kurulumlar", "/panel/platform/licenses"],
      bolumler: [
        { key: "yeni", href: "/panel/platform/kurulumlar?asama=yeni", label: "Yeni kurulum" },
        { key: "devam", href: "/panel/platform/kurulumlar?asama=devam", label: "Kurulumu devam edenler" },
        { key: "tamam", href: "/panel/platform/kurulumlar?asama=tamam", label: "Tamamlananlar" },
        { key: "lisans", href: "/panel/platform/licenses", label: "Lisans ve kota" },
      ],
    },
    {
      key: "fiyatlar", label: "Ücret ve Paketler", href: "/panel/platform/fiyatlar", ikon: "tag",
      yollar: ["/panel/platform/fiyatlar"],
      bolumler: [
        { key: "liste", href: "/panel/platform/fiyatlar", label: "Fiyat listesi" },
        { key: "paketler", href: "/panel/platform/fiyatlar?bolum=paket", label: "Paket limitleri" },
        { key: "gecmis", href: "/panel/platform/fiyatlar?bolum=gecmis", label: "Fiyat geçmişi" },
      ],
    },
    {
      key: "abonelikler", label: "Abonelikler", href: "/panel/platform/billing", ikon: "repeat",
      /* Sözleşme onayı bir aboneliği açar: abonelik işinin parçası. */
      yollar: ["/panel/platform/billing", "/panel/platform/sozlesmeler"],
      bolumler: [
        { key: "abonelikler", href: "/panel/platform/billing", label: "Kurum abonelikleri" },
        { key: "sorunlar", href: "/panel/platform/billing#sorunlar", label: "Ödeme sorunları" },
        { key: "hatirlatmalar", href: "/panel/platform/billing#hatirlatmalar", label: "Dönem sonu yaklaşanlar" },
        { key: "sozlesmeler", href: "/panel/platform/sozlesmeler", label: "Sözleşme onayları" },
      ],
    },
    {
      key: "tahsilat", label: "Faturalama ve Tahsilat", href: "/panel/platform/tahsilat", ikon: "wallet",
      yollar: ["/panel/platform/tahsilat", "/panel/platform/payments"],
      bolumler: [
        { key: "tahsilatlar", href: "/panel/platform/tahsilat", label: "Tahsilatlar" },
        { key: "odemeler", href: "/panel/platform/payments", label: "Ödeme onayları" },
        { key: "faturalar", href: "/panel/platform/tahsilat?kanal=fatura", label: "Faturalar" },
      ],
    },
    {
      key: "ayarlar", label: "Sistem Ayarları", href: "/panel/platform/ayarlar", ikon: "settings",
      yollar: ["/panel/platform/ayarlar", "/panel/platform/saglik"],
      bolumler: [
        { key: "yetkiler", href: "/panel/platform/ayarlar?bolum=yetkiler", label: "Kurucu yetkileri" },
        { key: "entegrasyonlar", href: "/panel/platform/ayarlar?bolum=entegrasyonlar", label: "Entegrasyonlar" },
        { key: "guvenlik", href: "/panel/platform/ayarlar?bolum=guvenlik", label: "Güvenlik" },
        { key: "kayitlar", href: "/panel/platform/ayarlar?bolum=kayitlar", label: "İşlem kayıtları" },
        { key: "saglik", href: "/panel/platform/saglik", label: "Sistem sağlığı" },
      ],
    },
  ];
}
