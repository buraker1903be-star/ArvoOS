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
  Bakış, Ürünler, Müşteriler, Kurulum, Ücret ve Paketler,
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
/**
 * @param bekleyen Onay bekleyen iş sayıları; dock rozetine düşüyor.
 *
 * 14.10.2026: kiracı dekont gönderdiğinde ya da sözleşme imzalandığında
 * kurucuya hiçbir yerden haber gitmiyordu — bekleyen işi görmenin tek
 * yolu ilgili ekranı açmaktı. Dock rozeti panelde zaten vardı (posta,
 * mesajlar), konsolda kullanılmıyordu. Sayı sıfırsa rozet çizilmiyor.
 */
export function konsolUygulamalari(bekleyen?: { odeme?: number; sozlesme?: number }): OsUygulama[] {
  const odeme = Math.max(0, Math.round(bekleyen?.odeme ?? 0));
  const sozlesme = Math.max(0, Math.round(bekleyen?.sozlesme ?? 0));
  return [
    { key: "home", label: "Genel Bakış", href: "/panel", ikon: "home", yollar: [] },
    {
      key: "urunler", label: "Ürünler", href: "/panel/platform/urunler", ikon: "box",
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
        { key: "randevu", href: "/panel/platform/urunler/randevu", label: "ArvoCal" },
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
      key: "kurulumlar", label: "Kurulum", href: "/panel/platform/kurulumlar", ikon: "building",
      /* TEK SAYFA (14.10.2026, kurum sahibi: "Kurulum diye sayfa içinde
         birleştirelim"). Yeni / devam eden / tamamlanan aşamaları ayrı menü
         öğeleriydi; sayfanın kendi sekmeleri zaten bunlar. "Lisans ve kota"
         kaldırıldı: müşteri detayının Lisanslar penceresi aynı ekran
         (/panel/platform/licenses oraya yönleniyor). */
      yollar: ["/panel/platform/kurulumlar"],
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
      /* Sözleşme onayı Abonelikler'in başlığından açılıyor; rozet de
         orada duruyor ki kurucu kuyruğu dock'tan görsün. */
      ...(sozlesme ? { rozet: sozlesme } : {}),
      /* Sözleşme onayı bir aboneliği açar: abonelik işinin parçası.
         ALT MENÜ YOK (14.10.2026, kurum sahibi: "bunlara gerek var mı"):
         ödeme sorunları ve dönem sonu yaklaşanlar sayfanın kendi sekmeleri
         (menüdeki #sorunlar bağlantıları sekmeyi açmıyordu bile); sözleşme
         onayları sayfanın başlığında, bekleyen sayısıyla. */
      yollar: ["/panel/platform/billing", "/panel/platform/sozlesmeler"],
    },
    {
      key: "tahsilat", label: "Faturalama ve Tahsilat", href: "/panel/platform/tahsilat", ikon: "wallet",
      ...(odeme ? { rozet: odeme } : {}),
      yollar: ["/panel/platform/tahsilat", "/panel/platform/payments"],
      bolumler: [
        { key: "tahsilatlar", href: "/panel/platform/tahsilat", label: "Tahsilatlar" },
        { key: "odemeler", href: "/panel/platform/payments", label: "Ödeme onayları" },
        { key: "faturalar", href: "/panel/platform/tahsilat?kanal=fatura", label: "Faturalar" },
        /* Proforma sayfada 27.10.2026'dan beri vardı ama yalnızca listenin
           süzgeç çiplerinin sonundaydı: bölüm şeridinde yoktu, telefonda da
           çip rayı kaydırılmadan görünmüyordu — kurum sahibi "proforma
           sekmesi gözükmüyor" dedi (28.10.2026). */
        { key: "proformalar", href: "/panel/platform/tahsilat?kanal=proforma", label: "Proformalar" },
        { key: "otomatik", href: "/panel/platform/tahsilat?kanal=otomatik", label: "Kartla ve otomatik" },
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
