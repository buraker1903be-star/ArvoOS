# Yönetim Merkezi · rota envanteri

Konsolun girişten sonra açılan bütün ekranları. Kiracı paneli (CRM, İK,
Finans, Operasyon, Belgeler…) bu listenin DIŞINDA: konsol yalnızca
`yonetim.arvo-os.com` host'unda açılıyor (`lib/site/host-rules.ts`) ve
bütün rotaları `isPlatformOwner` kapısından geçiyor.

Başlangıç: `d8244105` (PR #334'ün birleşmesi).

**Durum sütunu** bu yeniden kurulumun ilerlemesini gösterir:
- `—` henüz dokunulmadı
- `kuruldu` yeni tasarıma taşındı
- `doğrulandı` gerçek bağlantısından açıldı ve ilgili eylem denendi

## Yetki

Her rota iki kapıdan geçiyor:

1. `isPlatformOwner` — konsolu açan kurucu yetkisi; yoksa `notFound()`.
2. `konsolAlaniniAc(konsolKapsami, "<alan>")` — alan kapsamı. Altı alan:
   `musteriler`, `finans`, `destek`, `urunler`, `sistem` ve kapsamsız
   (`ara`).

Sunucu işlemleri aynı kapıları kendileri de çağırıyor; arayüzdeki
gizleme tek başına güvenlik değil.

## Ana Sayfa

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel` | Ana Sayfa | Sol menü · logo · Ctrl+K | — | Karar kuyruğunun ilk kalemi | Kuyruk kalemleri kendi ekranlarına | — |

## Müşteriler

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel/platform` | Müşterilere yönlendirme | Eski bağlantılar | musteriler | — | — | — |
| `/panel/platform/musteriler` | Müşteriler listesi | Sol menü · Ana Sayfa · Ctrl+K | musteriler | Yeni müşteri | Kayıt paneli + tam kart | kuruldu |
| `/panel/platform/musteriler/[id]` | Müşteri kartı | Liste · karar kuyruğu · arama | musteriler | Lisans / kullanıcı işlemleri | Pencereler (lisans, üye, not) | — |
| `/panel/platform/kullanicilar` | Kullanıcılar | ⋯ menüsü · müşteri kartı | musteriler | — | Kullanıcı detayı | — |
| `/panel/platform/kullanicilar/[id]` | Kullanıcı detayı | Kullanıcılar listesi | musteriler | — | — | — |
| `/panel/platform/subscribers` | Bireysel aboneler | ⋯ menüsü · ürün detayı | musteriler | Plan düzenleme | — | — |
| `/panel/platform/duyuru` | Duyuru | ⋯ menüsü | musteriler | Duyuru yayımla | Form | — |
| `/panel/platform/rapor` | Rapor | ⋯ menüsü | musteriler | — | — | — |

## Finans

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel/platform/tahsilat` | Tahsilatlar | Sol menü (2. kat) · ürün detayı | finans | — | Proforma detayı | — |
| `/panel/platform/tahsilat/proforma/[id]` | Proforma detayı | Tahsilat listesi | finans | — | — | — |
| `/panel/platform/payments` | Ödeme onayları | Sol menü (2. kat) · karar kuyruğu · ürün Tahsilat | finans | Ödemeyi onayla / reddet | Panelde karar formu | kuruldu |
| `/panel/platform/billing` | Abonelikler | Sol menü (2. kat) · ⋯ menüsü | finans | — | — | — |
| `/panel/platform/yenilemeler` | Yenilemeler | Karar kuyruğu | finans | — | — | — |
| `/panel/platform/sozlesmeler` | Sözleşmeler | Karar kuyruğu | finans | Sözleşme onayı | — | — |

## Destek

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel/platform/destek` | Destek talepleri | Sol menü · karar kuyruğu | destek | — | Görüşme | — |
| `/panel/platform/destek/[id]` | Görüşme | Talep listesi · karar kuyruğu | destek | Yanıtla · durum değiştir | Hazır yanıt | — |
| `/panel/platform/destek/hazir` | Hazır yanıtlar | Görüşme ekranı | destek | Yanıt ekle / düzenle | Form | — |

## Ürünler

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel/platform/urunler` | Ürünler listesi | Sol menü · Ana Sayfa "Tüm ürünler" | urunler | Ürünü aç | Ürün detayı | kuruldu |
| `/panel/platform/urunler?gorunum=moduller` | Modül matrisi | Ürünler sekmesi | urunler | Modül aç/kapat | — | kuruldu |
| `/panel/platform/urunler/[urun]` | Ürün detayı | Liste · Ana Sayfa ürün satırı | urunler | Bölüme göre | Fiyat düzenleme | kuruldu |
| `/panel/platform/moduller` | Modüller (eski) | Eski bağlantılar | urunler | — | — | — |
| `/panel/platform/fiyatlar?urun=ek` | Ek hizmet fiyatları | Ürünler ⋯ menüsü | urunler | Taslak kaydet · yayımla | Yayım önizlemesi | kuruldu |
| `/panel/platform/fiyatlar?gorunum=karsilastirma` | Fiyat karşılaştırma | Ürünler ⋯ menüsü | urunler | — | — | kuruldu |

Eski adresler: `/panel/platform/fiyatlar` → Ürünler listesi ·
`/panel/platform/fiyatlar?urun=<kod>` → ürünün Fiyat basamakları ·
`/panel/platform/urunler?bolum=fiyat` → Ürünler listesi.

## Otomasyonlar ve Sistem

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel/platform/saglik` | Sistem sağlığı | Sol menü · Ana Sayfa otomasyon kartı | sistem | — | İş detayı | — |
| `/panel/platform/saglik/is` | Zamanlanmış iş detayı | Sağlık ekranı | sistem | — | — | — |
| `/panel/platform/kurulumlar` | Kurulumlar | Sol menü | sistem | Kurulumu tamamla | — | — |
| `/panel/platform/ayarlar` | Ayarlar | Sol menü | sistem | Ayar kaydet | Formlar | — |

## Ortak yüzeyler

| Rota / yüzey | Ekran | Giriş noktaları | Alan | Durum |
| --- | --- | --- | --- | --- |
| `/panel/platform/ara` | Kayıt arama sonuçları | Üst bar arama · Ctrl+K | — | — |
| `/panel/notifications` | Bildirimler | Üst bar zili | (kiracıyla ortak) | — |
| `/panel/kilavuz` | Kılavuz | ⋯ menüleri | (kiracıyla ortak) | — |
| Ctrl+K komut paleti | Komut merkezi | Klavye · üst bar | — | — |
| Uygulamalar penceresi | Modül başlatıcı | Sol menü altı · dock | — | — |
| Mobil "Daha fazla" | Modül paneli | Alt çubuk | — | — |
| Hesap menüsü · tema | Üst bar | Üst bar | — | — |

## Menüde görünmeyen ama ulaşılabilen ekranlar

Bunlar sol menüde yok; yalnızca arama, karar kuyruğu, kayıt içi
bağlantı ya da eski adresten açılıyor. Envanterin kapanması için
bunların da yeni tasarıma taşınması gerekiyor:

`/panel/platform/kullanicilar/[id]` · `/panel/platform/subscribers` ·
`/panel/platform/duyuru` · `/panel/platform/rapor` ·
`/panel/platform/yenilemeler` · `/panel/platform/sozlesmeler` ·
`/panel/platform/tahsilat/proforma/[id]` · `/panel/platform/destek/hazir` ·
`/panel/platform/saglik/is` · `/panel/platform/moduller` ·
`/panel/platform/ara`
