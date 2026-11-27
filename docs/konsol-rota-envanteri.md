# Yönetim Merkezi · rota envanteri

Konsolun girişten sonra açılan bütün ekranları. Kiracı paneli (CRM, İK,
Finans, Operasyon, Belgeler…) bu listenin DIŞINDA: konsol yalnızca
`yonetim.arvo-os.com` host'unda açılıyor (`lib/site/host-rules.ts`) ve
bütün rotaları `isPlatformOwner` kapısından geçiyor.

Başlangıç: `d8244105` (PR #334'ün birleşmesi).

**Durum sütunu** bu yeniden kurulumun ilerlemesini gösterir:
- `—` henüz dokunulmadı
- `kuruldu` yeni tasarıma taşındı (düzenekte çizildi)
- `doğrulandı` GERÇEK ROTADAN açıldı, ölçüldü ve görüntüsü alındı

## Gerçek rota nasıl açılıyor

27.11.2026'ya kadar konsol ekranları yalnızca düzenekle (bileşeni tek
başına çizen tarayıcı betiği) görülebiliyordu: depoda `.env` yok ve her
rota `isPlatformOwner` arkasında. Düzenek "bileşen böyle görünüyor"
diyor, "rota açılıyor ve süzgeç/seçim adresten çalışıyor" demiyor —
aradaki fark bu turda beş gerçek hata çıkardı.

```
npm run onizleme                      # ARVOOS_ONIZLEME=1, port 3124
node scripts/konsol-rota-kabulu.mjs   # ölçüm + ekran görüntüsü
```

Önizleme Supabase'i sahte istemciyle değiştiriyor
(`scripts/onizleme/`): okumalar örnek veriden, YAZMALAR sessizce
başarılı — gerçek tahsilat, fiyat yayımı, destek yanıtı ve otomasyon
önizlemede tetiklenmiyor. Kabul betiği ekranı gerçek host'tan
(`yonetim.arvo-os.com`, tarayıcıda yerele eşlenmiş) açıyor: sol
gezinme ve `/panel/platform` kapısı o karara bağlı, localhost'tan
istenince kabuk kiracı panelini çiziyor.

**Önizlemenin görmediği şeyler:** RLS (sahte istemcide politika yok),
imzalı depolama bağlantıları (dekont "Eklenmemiş" görünür), gerçek
sunucu işlemleri ve e-posta/WhatsApp gönderimi. Bunlar `tests/db`,
birim testleri ve canlı duman testinin işi.

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
| `/panel` | Ana Sayfa | Sol menü · logo · Ctrl+K | — | Karar kuyruğunun ilk kalemi | Kuyruk kalemi ilgili KAYDA açılıyor | doğrulandı |

## Müşteriler

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel/platform` | Müşterilere yönlendirme | Eski bağlantılar | musteriler | — | — | — |
| `/panel/platform/musteriler` | Müşteriler listesi | Sol menü · Ana Sayfa · Ctrl+K | musteriler | Yeni müşteri | Kayıt paneli + tam kart | doğrulandı |
| `/panel/platform/musteriler/[id]` | Müşteri kartı | Liste paneli · karar kuyruğu · arama | musteriler | Lisans / kullanıcı işlemleri | Pencereler (lisans, üye, not) | açılıyor |
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
| `/panel/platform/payments` | Ödeme onayları | Sol menü (2. kat) · karar kuyruğu · ürün Tahsilat | finans | Ödemeyi onayla / reddet | Panelde karar formu | doğrulandı |
| `/panel/platform/billing` | Abonelikler | Sol menü (2. kat) · ⋯ menüsü | finans | — | — | — |
| `/panel/platform/yenilemeler` | Yenilemeler | Karar kuyruğu | finans | — | — | — |
| `/panel/platform/sozlesmeler` | Sözleşmeler | Karar kuyruğu | finans | Sözleşme onayı | — | — |

## Destek

| Rota | Ekran | Giriş noktaları | Alan | Ana eylem | Detay / form | Durum |
| --- | --- | --- | --- | --- | --- | --- |
| `/panel/platform/destek` | Destek talepleri | Sol menü · karar kuyruğu | destek | Yanıtla · durum değiştir | Panelde görüşme | doğrulandı |
| `/panel/platform/destek/[id]` | Görüşme | Paylaşılmış bağlantı · karar kuyruğu | destek | Yanıtla · durum değiştir | Hazır yanıt | doğrulandı |
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

## Doğrulanan akışlar (27.11.2026)

Hepsi gerçek rotadan, `scripts/konsol-rota-kabulu.mjs` ölçümüyle.
Ölçülenler: iki sütunun yan yana durması, taşma (düzenin alt ucunun
pencerenin dışına çıkması), yatay kaydırma, seçili satırın işareti,
telefonda detayın tam genişlikte açılması ve listenin gizlenmesi.

| Akış | Rota | Sonuç |
| --- | --- | --- |
| Liste → süzgeç | `…/musteriler?tur=kurumsal` | 200 · 4 satır · süzgeç adreste |
| Süzgeç + kayıt seç | `…?tur=kurumsal&secili=kurum:<id>` | 200 · satır `aria-current` · panel açık · süzgeç korunuyor |
| Tam karta geç | `…/musteriler/<id>` | 200 · müşteri kartı |
| Listeye dön | `…/musteriler?tur=kurumsal` | 200 · süzgeç yerinde (`listeAdresi`, `secili: null`) |
| Süzgeç dışında kalan kayıt | `…?tur=bireysel&secili=kurum:<id>` | 200 · panel açık + "Bu kayıt geçerli süzgeçte görünmüyor" |
| Erişilemeyen kayıt | `…?secili=kurum:yok` | 200 · "Kayıt bulunamadı" |
| Telefon (390×844) | seçili kayıt | liste gizli · panel tam genişlik · "Listeye dön" görünür · taşma 0 |
| Ödeme seç | `…/payments?secili=odeme:<id>` | 200 · tutar, referans, dekont, uyuşmazlık uyarısı · karar formu |
| Görüşme seç | `…/destek?secili=<id>` | 200 · konuşma + yanıt kutusu + durum formu |
| Görüşme sekme dışı | `…/destek?durum=musteri&secili=<id>` | 200 · "Bu talep geçerli sekmede görünmüyor" |
| Silinmiş görüşme | `…/destek?secili=<yok>` | 200 · "Talep bulunamadı" |
| Paylaşılmış görüşme bağlantısı | `…/destek/<id>` | 200 · aynı bileşen, tam sayfa |

**Denenmeyen:** yazan işlemler (ödeme onayı/reddi, yanıt gönderme,
durum değiştirme, fiyat yayımı). Önizlemede yazmalar sahte; gerçek
işlem yetkili bir test ortamı istiyor.

## Rota matrisi (27.11.2026 ara kontrolü)

Üç ölçü AYRI tutuluyor; biri ötekinin yerine geçmiyor.

- **URL** — rota gerçek önizleme sunucusunda açılıyor mu (HTTP 200,
  sayfa hatası yok). 30 rotanın 30'u ✓.
- **Görsel + gezinme** — tarayıcıda ölçüldü: taşma 0, yatay kaydırma
  yok, iki sütunlu ekranlarda liste solda · panel sağda, telefonda
  detay tam genişlikte, seçili satır işaretli
  (`scripts/konsol-rota-kabulu.mjs`).
- **Yazan işlem** — onay/ret, yayım, yanıt, durum değişikliği gerçek
  bir veritabanına yazılarak denendi mi. Önizlemede YAZILMIYOR
  (simülasyon), bu yüzden hepsi UNVERIFIED.

| Rota | URL | Görsel + gezinme | Yazan işlem |
| --- | --- | --- | --- |
| `/panel` | ✓ | ✓ karar kuyruğu gerçek kayıtlara bağlı | — (okuma) |
| `/panel/platform` | ✓ → `/musteriler` | ✓ yönlendirme | — |
| `/panel/platform/musteriler` | ✓ | ✓ 1440 · 768 · 390, açık+koyu | UNVERIFIED (yeni müşteri) |
| `/panel/platform/musteriler/[id]` | ✓ | ✓ | UNVERIFIED (lisans, üye, not) |
| `/panel/platform/kullanicilar` | ✓ | ✓ | — (okuma) |
| `/panel/platform/kullanicilar/[id]` | ✓ | ✓ | — (okuma) |
| `/panel/platform/subscribers` | ✓ | ✓ | UNVERIFIED (plan düzenleme) |
| `/panel/platform/duyuru` | ✓ | ✓ | UNVERIFIED (duyuru yayımla) |
| `/panel/platform/rapor` | ✓ | ✓ | — (okuma) |
| `/panel/platform/tahsilat` | ✓ | ✓ | — (okuma) |
| `/panel/platform/tahsilat/proforma/[id]` | ✓ | ✓ | UNVERIFIED (proforma gönder) |
| `/panel/platform/payments` | ✓ | ✓ 1440 · 768 · 390 | UNVERIFIED (onay / ret) |
| `/panel/platform/billing` | ✓ | ✓ | — (okuma) |
| `/panel/platform/yenilemeler` | ✓ → `/billing?gorunum=takvim` | ✓ yönlendirme | — |
| `/panel/platform/sozlesmeler` | ✓ | ✓ | UNVERIFIED (sözleşme onayı) |
| `/panel/platform/destek` | ✓ | ✓ 1440 · 768 · 390 | UNVERIFIED (yanıt, durum) |
| `/panel/platform/destek/[id]` | ✓ | ✓ | UNVERIFIED (yanıt, durum) |
| `/panel/platform/destek/hazir` | ✓ | ✓ | UNVERIFIED (yanıt ekle/düzenle) |
| `/panel/platform/urunler` | ✓ | ✓ | — (okuma) |
| `/panel/platform/urunler?gorunum=moduller` | ✓ | ✓ | UNVERIFIED (modül aç/kapat) |
| `/panel/platform/urunler/[urun]` | ✓ | ✓ | UNVERIFIED (fiyat taslağı) |
| `/panel/platform/moduller` | ✓ → `/urunler?gorunum=moduller` | ✓ yönlendirme | — |
| `/panel/platform/fiyatlar?urun=ek` | ✓ | ✓ | UNVERIFIED (taslak, yayım) |
| `/panel/platform/fiyatlar?gorunum=karsilastirma` | ✓ | ✓ | — (okuma) |
| `/panel/platform/fiyatlar` | ✓ → `/urunler` | ✓ yönlendirme | — |
| `/panel/platform/saglik` | ✓ | ✓ | — (okuma) |
| `/panel/platform/saglik/is` | ✓ | ✓ | UNVERIFIED (işi elle çalıştır) |
| `/panel/platform/kurulumlar` | ✓ | ✓ | UNVERIFIED (kurulumu tamamla) |
| `/panel/platform/ayarlar` | ✓ | ✓ | UNVERIFIED (ayar kaydet) |
| `/panel/platform/ara` | ✓ | ✓ | — (okuma) |
| `/panel/notifications` | ✓ | ✓ | — (okuma) |
| `/panel/kilavuz` | ✓ | ✓ | — (okuma) |

### Üç kabul betiği ne ölçüyor

| Betik | Ne yapıyor | Ne SÖYLEMİYOR |
| --- | --- | --- |
| `konsol-rota-kabulu.mjs` (23 görsel) | Bir adresi açar, düzeni ÖLÇER (taşma, sütun sırası, yatay kaydırma, seçili satır, telefonda tek sütun) ve görüntüsünü alır. | Tıklama dizisinin ne yaptığını; ekranın durumu adresten mi geldiğini. |
| `konsol-akis-kabulu.mjs` (15 senaryo) | KULLANICI GİBİ TIKLAR: kaydır → kayıt aç → tam kart → tarayıcı geri → paneli kapat → yeni süzgeç. Süzgeç, sıralama ve kaydırma konumunu her adımda doğrular. | Yazan işlemlerin gerçekten yazdığını. |
| `konsol-panel-erisimi.mjs` | Sağ panelin SON EYLEMİNE üç yoldan erişimi: bilgi sırası, kaydırınca görünürlük + üstünü örten bir şey olup olmadığı, klavyeyle ulaşma. | Eylemin sonucunu. |

### Ara kontrol düzeltmeleri (27.11.2026)

| Ne | Nerede |
| --- | --- |
| Üst etiket, başlık altı sayaçlar ve şeritteki tür sayaçları tekrarı kaldırıldı; liste yukarı geldi | Müşteriler |
| Birincil araç satırı: arama · tür · Filtreler · birincil eylem | `konsol-liste.tsx` (ortak) |
| Etkin süzgeç çipleri; her çip kendi süzgecini kaldırıyor | ortak |
| Seçime bağlı toplu eylemler yalnızca seçimle görünüyor; CSV seçimsiz de çalışıyor | Müşteriler |
| Kaydırma konumu korunuyor; yeni süzgeçte baştan başlıyor | üç liste ekranı |
| Telefonda satır da seçiyor (eskiden doğrudan tam karta gidiyordu) | Müşteriler |
| Ödeme uyarısı: "uyuşmuyor" / "doğrulanamadı" ayrıldı | `lib/abonelik-tutari.ts` |
| Karar kuyruğu ilgili KAYDA açılıyor | Ana Sayfa |
| İki tablonun üst üste binmesi | Ayarlar → Bağlantılar ve sırlar |
| Önizlemede yazma SİMÜLASYON olarak işaretlendi (ekran + günlük) | önizleme |

### Önizlemede görülen, canlıda doğrulanmamış

**Yönlendiren rotalarda istemci hatası.** Beş eski adresin hepsi
doğru hedefe iniyor, ama tarayıcı konsoluna "Rendered more hooks than
during the previous render" düşüyor. Yığının tamamı Next'in kendi
`Router` bileşeninde (`node_modules/next/dist/client`); ArvoOS
bileşeni yok. Geliştirme sunucusunda ölçüldü, üretim derlemesinde
sınanmadı — önizleme bayrağı üretim derlemesini durduruyor.
