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
  BEŞ UYGULAMA (29.10.2026, kurum sahibi: "konsolu komple baştan
  yapalım, daha kompakt, daha yönetilebilir").

  14.10.2026'da dock sekiz ana menüydü: Genel Bakış, Ürünler,
  Müşteriler, Kurulum, Ücret ve Paketler, Abonelikler, Faturalama ve
  Tahsilat, Sistem Ayarları. Pratikte üç çift hep birlikte açılıyordu
  ve aralarındaki çizgi kurucuya bir şey söylemiyordu:

    - Abonelikler ile Faturalama ve Tahsilat aynı paranın iki ucu:
      sözleşme onayı aboneliği açıyor, abonelik proformayı, proforma
      ödeme bildirimini. İkisi FİNANS oldu; iki rozet de onun.
    - Ürünler ile Ücret ve Paketler: fiyat ürünün özelliği. ÜRÜNLER VE
      FİYATLAR oldu.
    - Kurulum ile Sistem Ayarları: ikisi de "müşteri işi değil, makine
      işi". SİSTEM oldu.

  Bireysel aboneler Ürünler'den Müşteriler'e geçti: abone bir müşteri,
  ürünün bir ayarı değil (planı hâlâ ürün sayfasında).

  İlk denemenin hatası (konsolun dokuz EKRANI dokuz dock girdisi) burada
  yok: girdiler ekran değil iş alanı; ayrıntı İKİNCİ KATTA (bolumler).
  Sayfa adresleri DEĞİŞMEDİ: menü yeniden gruplandı, yer imleri ve
  bildirimlerdeki bağlantılar aynı ekranı açmaya devam ediyor.

  Yol öneklerinde sıralama ÖNEMLİ DEĞİL, uzunluk önemli: etkinUygulama
  en uzun eşleşeni seçiyor.
*/
/**
 * @param bekleyen Onay bekleyen iş sayıları; dock rozetine düşüyor.
 *
 * 14.10.2026: kiracı dekont gönderdiğinde ya da sözleşme imzalandığında
 * kurucuya hiçbir yerden haber gitmiyordu — bekleyen işi görmenin tek
 * yolu ilgili ekranı açmaktı. Sayı sıfırsa rozet çizilmiyor. İki kuyruk
 * 29.10.2026'dan beri aynı uygulamada (Finans), rozet toplamı gösteriyor.
 */
export function konsolUygulamalari(bekleyen?: { odeme?: number; sozlesme?: number }): OsUygulama[] {
  const odeme = Math.max(0, Math.round(bekleyen?.odeme ?? 0));
  const sozlesme = Math.max(0, Math.round(bekleyen?.sozlesme ?? 0));
  const finansRozeti = odeme + sozlesme;
  return [
    { key: "home", label: "Genel Bakış", href: "/panel", ikon: "home", yollar: [] },
    {
      key: "musteriler", label: "Müşteriler", href: "/panel/platform/musteriler", ikon: "crm",
      yollar: ["/panel/platform/musteriler", "/panel/platform/kullanicilar", "/panel/platform/subscribers"],
      bolumler: [
        { key: "musteriler", href: "/panel/platform/musteriler", label: "Müşteriler" },
        /* Tek "Kullanıcılar" (14.10.2026): aktif, pasif ve davet bekleyenler
           sayfanın kendi sekmeleri. */
        { key: "kullanicilar", href: "/panel/platform/kullanicilar", label: "Kullanıcılar" },
        { key: "bireysel", href: "/panel/platform/subscribers", label: "Bireysel aboneler" },
      ],
    },
    {
      key: "finans", label: "Finans", href: "/panel/platform/tahsilat", ikon: "wallet",
      ...(finansRozeti ? { rozet: finansRozeti } : {}),
      /* Sözleşme onayları Abonelikler'in başlığından açılıyor; ayrı bölüm
         değil ama yolu Finans'ta ki dock vurgusu kaymasın. */
      yollar: ["/panel/platform/tahsilat", "/panel/platform/payments", "/panel/platform/billing", "/panel/platform/sozlesmeler"],
      bolumler: [
        { key: "tahsilatlar", href: "/panel/platform/tahsilat", label: "Tahsilatlar" },
        { key: "odemeler", href: "/panel/platform/payments", label: "Ödeme onayları" },
        { key: "abonelikler", href: "/panel/platform/billing", label: "Abonelikler" },
        /* Proforma bölüm şeridinde (28.10.2026): yalnızca süzgeç çipinin
           sonundayken telefonda görünmüyordu. */
        { key: "proformalar", href: "/panel/platform/tahsilat?kanal=proforma", label: "Proformalar" },
        { key: "faturalar", href: "/panel/platform/tahsilat?kanal=fatura", label: "Faturalar" },
        { key: "banka", href: "/panel/platform/tahsilat?kanal=banka", label: "Banka hesapları" },
      ],
    },
    {
      key: "urunler", label: "Ürünler ve Fiyatlar", href: "/panel/platform/urunler", ikon: "box",
      yollar: ["/panel/platform/urunler", "/panel/platform/moduller", "/panel/platform/fiyatlar"],
      /* Dört ürünün kendi sayfası Ürünler özetinin kartlarından açılıyor;
         şeritte yer kaplamıyorlar (14.10.2026'da yedi bölüm kalabalıktı). */
      bolumler: [
        { key: "urunler", href: "/panel/platform/urunler", label: "Ürünler" },
        { key: "liste", href: "/panel/platform/fiyatlar", label: "Fiyat listesi" },
        { key: "paketler", href: "/panel/platform/fiyatlar?bolum=paket", label: "Paket limitleri" },
        { key: "gecmis", href: "/panel/platform/fiyatlar?bolum=gecmis", label: "Fiyat geçmişi" },
        { key: "moduller", href: "/panel/platform/moduller", label: "Modüller" },
      ],
    },
    {
      key: "sistem", label: "Sistem", href: "/panel/platform/kurulumlar", ikon: "settings",
      yollar: ["/panel/platform/kurulumlar", "/panel/platform/saglik", "/panel/platform/ayarlar"],
      bolumler: [
        { key: "kurulumlar", href: "/panel/platform/kurulumlar", label: "Kurulumlar" },
        { key: "saglik", href: "/panel/platform/saglik", label: "Sistem sağlığı" },
        { key: "yetkiler", href: "/panel/platform/ayarlar?bolum=yetkiler", label: "Kurucu yetkileri" },
        { key: "entegrasyonlar", href: "/panel/platform/ayarlar?bolum=entegrasyonlar", label: "Entegrasyonlar" },
        { key: "guvenlik", href: "/panel/platform/ayarlar?bolum=guvenlik", label: "Güvenlik" },
        { key: "kayitlar", href: "/panel/platform/ayarlar?bolum=kayitlar", label: "İşlem kayıtları" },
      ],
    },
  ];
}
