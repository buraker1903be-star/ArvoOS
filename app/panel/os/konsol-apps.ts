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
  DÖRT UYGULAMA + ANA EKRAN (14.10.2026). İlk sürümde konsolun dokuz
  ekranı dokuz dock girdisiydi; dock bir başlatıcıya dönüştü ve
  "nereye bakacağım" sorusu kolaylaşmadı, dağıldı. Yakın işler tek
  uygulamada toplandı ve ayrıntı İKİNCİ KATA indi (bolumler): dock
  simgesinin üstüne gelince bölümler açılıyor — panelde CRM ve Finans
  nasıl çalışıyorsa öyle.

  Üyeler dock'ta değil, başlatıcıda: gün içinde sürekli girilen bir
  ekran değil, arada bakılan bir dizin. Müşteriler uygulamasının
  bölümlerinden de ulaşılıyor.

  Yol öneklerinde sıralama ÖNEMLİ DEĞİL, uzunluk önemli: etkinUygulama
  en uzun eşleşeni seçiyor. "/panel/platform" Müşteriler uygulamasına
  bağlı ama "/panel/platform/licenses" daha uzun olduğu için lisans
  sayfasında Lisans uygulaması etkin sayılıyor.
*/
export function konsolUygulamalari(): OsUygulama[] {
  return [
    { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: [] },
    {
      key: "musteriler", label: "Müşteriler", href: "/panel/platform/musteriler", ikon: "building",
      /* Kiracı dosyası (/panel/platform) da bu uygulamanın içinde: dosya
         müşteri listesinden açılıyor, ayrı bir uygulama değil. */
      yollar: ["/panel/platform/musteriler", "/panel/platform"],
      bolumler: [
        { key: "liste", href: "/panel/platform/musteriler", label: "Tüm müşteriler" },
        { key: "kurumsal", href: "/panel/platform/musteriler?tur=kurumsal", label: "Kurumsal" },
        { key: "bireysel", href: "/panel/platform/musteriler?tur=bireysel", label: "Bireysel" },
        { key: "kurulum", href: "/panel/platform", label: "Kiracı kurulumu" },
        { key: "uyeler", href: "/panel/platform/members", label: "Üyeler" },
      ],
    },
    {
      key: "finans", label: "Finans", href: "/panel/platform/billing", ikon: "finance",
      yollar: ["/panel/platform/billing", "/panel/platform/payments", "/panel/platform/sozlesmeler", "/panel/platform/subscribers"],
      bolumler: [
        { key: "abonelikler", href: "/panel/platform/billing", label: "Abonelikler" },
        { key: "odemeler", href: "/panel/platform/payments", label: "Ödeme onayları" },
        { key: "sozlesmeler", href: "/panel/platform/sozlesmeler", label: "Sözleşme onayları" },
        { key: "planlar", href: "/panel/platform/subscribers", label: "Abonelik ayarları" },
      ],
    },
    {
      key: "lisans", label: "Lisans", href: "/panel/platform/licenses", ikon: "documents",
      yollar: ["/panel/platform/licenses", "/panel/platform/moduller"],
      bolumler: [
        { key: "kota", href: "/panel/platform/licenses", label: "Lisans ve kota" },
        { key: "moduller", href: "/panel/platform/moduller", label: "Modül matrisi" },
      ],
    },
    { key: "uyeler", label: "Üyeler", href: "/panel/platform/members", ikon: "hr", yollar: ["/panel/platform/members"], yalnizBaslatici: true },
  ];
}
