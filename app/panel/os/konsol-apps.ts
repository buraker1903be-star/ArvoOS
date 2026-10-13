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
  Yol öneklerinde sıralama ÖNEMLİ DEĞİL, uzunluk önemli: etkinUygulama en
  uzun eşleşeni seçiyor. "/panel/platform" bütün alt sayfaları
  kapsıyormuş gibi görünüyor ama "/panel/platform/licenses" daha uzun
  olduğu için lisans sayfasında Lisans uygulaması etkin sayılıyor.
*/
export function konsolUygulamalari(): OsUygulama[] {
  return [
    { key: "home", label: "Ana ekran", href: "/panel", ikon: "home", yollar: [] },
    { key: "kiracilar", label: "Kiracılar", href: "/panel/platform", ikon: "building", yollar: ["/panel/platform"] },
    { key: "lisans", label: "Lisans ve kota", href: "/panel/platform/licenses", ikon: "documents", yollar: ["/panel/platform/licenses"] },
    { key: "abonelik", label: "Abonelikler", href: "/panel/platform/billing", ikon: "finance", yollar: ["/panel/platform/billing"] },
    { key: "odemeler", label: "Ödeme onayları", href: "/panel/platform/payments", ikon: "wallet", yollar: ["/panel/platform/payments"] },
    { key: "sozlesmeler", label: "Sözleşmeler", href: "/panel/platform/sozlesmeler", ikon: "check", yollar: ["/panel/platform/sozlesmeler"] },
    { key: "aboneler", label: "Bireysel aboneler", href: "/panel/platform/subscribers", ikon: "crm", yollar: ["/panel/platform/subscribers"] },
    { key: "uyeler", label: "Üyeler", href: "/panel/platform/members", ikon: "hr", yollar: ["/panel/platform/members"] },
    { key: "moduller", label: "Modül matrisi", href: "/panel/platform/moduller", ikon: "apps", yollar: ["/panel/platform/moduller"] },
  ];
}
