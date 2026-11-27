/*
  KONSOLUN ESKİ ADRESLERİ — KARAR TEK YERDE VE SAF (27.11.2026).

  Dört adres artık başka bir ekrana gidiyor: kiracı dosyaları
  Müşteriler'e, Yenilemeler Abonelikler'in takvimine, Modüller
  Ürünler'in matris sekmesine, Fiyatlar da ürünün kendi "Fiyat
  basamakları" bölümüne. Bağlantılar e-postalarda, bildirimlerde ve
  yer imlerinde duruyor; kırılmamaları gerekiyor.

  YÖNLENDİRME SAYFADAN DEĞİL ARA KATMANDAN YAPILIYOR. Sayfadan
  yapıldığında şu oluyordu (27.11.2026'da ölçüldü):

    - `app/panel/loading.tsx` bir Suspense sınırı kuruyor. Sayfa
      `redirect()`ten ÖNCE bir şey beklediği anda (burada
      `getPanelContext()`) yanıt iskeletle birlikte akmaya başlıyor ve
      yönlendirme artık HTTP değil İSTEMCİ TARAFI oluyor: adres 200
      dönüyor, hedefe tarayıcıda geçiliyor.
    - O istemci geçişinde Next'in kendi Router'ı "Rendered more hooks
      than during the previous render." atıyor. Dört eski adresin
      üçünde de, üç giriş yolunda da (doğrudan açılış, uygulama içi
      gezinme, geri/ileri) aynı hata çıkıyordu.
    - Aynı sayfanın `getPanelContext()` olmadan yazılmış hâli temiz
      çalışıyor; panel dışındaki bir rotadan yapılan aynı yönlendirme
      de 307 dönüyor. Yani sebep yönlendirmenin kendisi değil,
      SINIRIN ALTINDA yapılması.

  Depo bu sınıfı zaten biliyor: AGENTS.md'deki "yumuşak 404" notu aynı
  Suspense sınırının `notFound()`u 200'e çevirdiğini anlatıyor. Panelde
  yerleşime taşımak işe yaramıyor, çünkü sınır `app/panel`'de, yani her
  iç yerleşimin üstünde. Ara katman ise hiçbir şey render etmeden önce
  çalışıyor: gerçek 308, istemci hatası yok, bir render daha az.

  Sayfa karşılıkları SİLİNMEDİ: ara katmanın atlandığı bir yol kalırsa
  (eşleşme değişir, istek başka bir yerden gelir) adresler yine doğru
  yere gidiyor — yalnızca yavaş ve yumuşak.
*/

/** Konsolun eski adresleri; eşleşme yoksa null. */
export function eskiKonsolAdresi(girdi: { pathname: string; search?: string }): string | null {
  const yol = girdi.pathname.replace(/\/+$/, "") || "/";
  const p = new URLSearchParams(girdi.search ?? "");

  /* Kiracı dosyaları → Müşteriler (14.10.2026'dan beri). */
  if (yol === "/panel/platform") {
    const kurum = p.get("organization");
    if (kurum && /^[0-9a-f-]{36}$/i.test(kurum)) {
      const ek = p.get("provisioned") === "1" ? "&provisioned=1" : "";
      return `/panel/platform/musteriler/${kurum}?pencere=ayarlar${ek}`;
    }
    if (p.get("filtre") === "kurulum") return "/panel/platform/kurulumlar?asama=devam";
    return "/panel/platform/musteriler";
  }

  /* Yenilemeler → Abonelikler'in takvim görünümü. */
  if (yol === "/panel/platform/yenilemeler") {
    return p.get("gorunum") === "dikkat"
      ? "/panel/platform/billing?gorunum=takvim&filtre=dikkat"
      : "/panel/platform/billing?gorunum=takvim";
  }

  /* Modül matrisi → Ürünler'in sekmesi (02.11.2026). */
  if (yol === "/panel/platform/moduller") {
    const suzgec = p.get("suzgec");
    const ek = suzgec === "kapali" || suzgec === "bagimsiz" ? `&suzgec=${suzgec}` : "";
    return `/panel/platform/urunler?gorunum=moduller${ek}`;
  }

  /*
    Fiyatlar üç ayrı şey yapıyor ve İKİSİ YÖNLENDİRME DEĞİL:
      ?urun=ek              → ek hizmet düzenlemesi (ekranın kendisi)
      ?gorunum=karsilastirma → ürünler arası karşılaştırma (ekranın kendisi)
      ?urun=<kod>           → o ürünün Fiyat basamakları
      çıplak adres          → Ürünler listesi
    "ek" bir ürün değil, gideceği bir ürün detayı yok.
  */
  if (yol === "/panel/platform/fiyatlar") {
    const urun = p.get("urun") ?? "tumu";
    if (urun === "ek") return null;
    if (urun !== "tumu") return `/panel/platform/urunler/${urun}?bolum=fiyat`;
    if (p.get("gorunum") === "karsilastirma") return null;
    return "/panel/platform/urunler";
  }

  return null;
}
