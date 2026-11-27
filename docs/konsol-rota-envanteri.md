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

Durum sütunu aşağıdaki **rota matrisiyle** birleşti: artık rota başına
dört ayrı sonuç var (erişim · tasarım · gezinme · işlem).

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
önizlemede tetiklenmiyor. Kabul betiği ekranı localhost'tan açıyor; konsol kabuğu
`isManagementHost` kararına bağlı olduğu için önizlemede localhost da
yönetim host'u sayılıyor (`scripts/onizleme/host-rules.ts`). Bir süre
gerçek host tarayıcıda yerele eşlenerek kullanıldı, ama Next'in
geliştirme sunucusu localhost DIŞINDAKİ bir host'ta istemci paketini
bağlamıyor: sayfa doğru görünüyor, hiçbir istemci bileşeni
çalışmıyor, hata da yok. O yoldan alınan sonuçlar yanlıştı.

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

## Rota matrisi — dört sonuç (27.11.2026)

Her rota için dört ayrı ölçü; biri ötekinin yerine geçmez.

- **Erişim** — rota açılıyor mu: HTTP durumu, sayfa hatası yok, ekran
  hata sınırında değil, ana içerik boş değil.
- **Tasarım** — düzen ölçüldü: taşma yok, yatay kaydırma yok, iki
  sütunlu ekranlarda liste solda · panel sağda, telefonda detay tam
  genişlikte. Açık VE koyu temada alındı.
- **Gezinme** — kullanıcı gibi tıklandı: kaydır → kayıt aç → tam kart
  → tarayıcı geri → paneli kapat → yeni süzgeç; süzgeç, sıralama ve
  kaydırma konumu korunuyor mu.
- **İşlem** — yazan işlem gerçek bir veritabanında denendi mi.
  İzole ortam `tests/db` (PGlite, gerçek fonksiyon ve tetikleyiciler).

| Rota | Erişim | Tasarım | Gezinme | İşlem |
| --- | --- | --- | --- | --- |
| `/panel` | ✓ | ✓ açık+koyu · 768/390 | ✓ kuyruk kalemi kayda açılıyor | — (okuma) |
| `/panel/platform` | ✓ 308 | ✓ | ✓ üç giriş yolu | — |
| `/panel/platform/musteriler` | ✓ | ✓ açık+koyu · 1440/768/390 | ✓ tam akış | UNVERIFIED (yeni müşteri) |
| `/panel/platform/musteriler/[id]` | ✓ | ✓ | ✓ panelden tam kart | UNVERIFIED (lisans, üye, not) |
| `/panel/platform/kullanicilar` | ✓ | ✓ açık+koyu · 1440/768/390 | ✓ tam akış | — (okuma) |
| `/panel/platform/kullanicilar/[id]` | ✓ | ✓ | ✓ | UNVERIFIED (erişim aç/kapat) |
| `/panel/platform/subscribers` | ✓ | ✓ liste–panel YOK (gerekçe aşağıda) | ✓ | UNVERIFIED (plan düzenleme) |
| `/panel/platform/duyuru` | ✓ | ✓ | ✓ | UNVERIFIED (duyuru yayımla) |
| `/panel/platform/rapor` | ✓ | ✓ | ✓ | — (okuma) |
| `/panel/platform/tahsilat` | ✓ | ✓ rapor ekranı | ✓ | — (okuma) |
| `/panel/platform/tahsilat/proforma/[id]` | ✓ | ✓ | ✓ | UNVERIFIED (proforma gönder) |
| `/panel/platform/payments` | ✓ | ✓ açık+koyu · 1440/768/390 | ✓ tam akış | **✓ ARAYÜZDEN onay + ret, kalıcı, yetkisizde reddediliyor, dekont erişimi** |
| `/panel/platform/billing` | ✓ | ✓ sorun panosu (gerekçe aşağıda) | ✓ | — (okuma) |
| `/panel/platform/yenilemeler` | ✓ 308 | ✓ | ✓ üç giriş yolu | — |
| `/panel/platform/sozlesmeler` | ✓ | ✓ açık+koyu · 1440/768/390 | ✓ tam akış | UNVERIFIED (abonelik onayı — izole ortamda sıraya alınmadı) |
| `/panel/platform/destek` | ✓ | ✓ açık+koyu · 1440/768/390 | ✓ tam akış | **✓ ARAYÜZDEN yanıt, kalıcı, talep "Müşteri bekleniyor"a geçiyor** |
| `/panel/platform/destek/[id]` | ✓ | ✓ | ✓ paylaşılmış bağlantı | **✓ (aynı bileşen)** |
| `/panel/platform/destek/hazir` | ✓ | ✓ | ✓ | UNVERIFIED (yanıt ekle) |
| `/panel/platform/urunler` | ✓ | ✓ açık+koyu | ✓ | — (okuma) |
| `/panel/platform/urunler?gorunum=moduller` | ✓ | ✓ | ✓ | UNVERIFIED (modül aç/kapat) |
| `/panel/platform/urunler/[urun]` | ✓ | ✓ · 768/390 | ✓ fiyat ürünün içinde | **✓ ARAYÜZDEN yayım + eşzamanlı taslak değişikliğinde ret** |
| `/panel/platform/moduller` | ✓ 308 | ✓ | ✓ üç giriş yolu | — |
| `/panel/platform/fiyatlar?urun=ek` | ✓ | ✓ | ✓ | **✓ toplu yayım kapsamı** |
| `/panel/platform/fiyatlar?gorunum=karsilastirma` | ✓ | ✓ | ✓ | — (okuma) |
| `/panel/platform/fiyatlar` | ✓ 308 | ✓ | ✓ üç giriş yolu | — |
| `/panel/platform/saglik` | ✓ | ✓ · 768/390 | ✓ | UNVERIFIED (işi elle çalıştır) |
| `/panel/platform/saglik/is` | ✓ | ✓ · 768/390 (telefonda bağlantı eklendi) | ✓ | UNVERIFIED |
| `/panel/platform/kurulumlar` | ✓ (çökme düzeltildi) | ✓ | ✓ | UNVERIFIED (kurulumu tamamla) |
| `/panel/platform/ayarlar` | ✓ | ✓ · 768/390 | ✓ | UNVERIFIED (ayar kaydet) |
| `/panel/platform/ara` | ✓ | ✓ | ✓ | — (okuma) |
| `/panel/notifications` | ✓ (çökme düzeltildi) | ✓ | ✓ | — (okuma) |
| `/panel/kilavuz` | ✓ | ✓ | ✓ | — (okuma) |

### Rota başına: hangi tasarım, hangi akış ölçüldü

Matristeki "✓" neyin ✓'si olduğunu söylemiyordu. Aşağıda her rotanın
HANGİ tasarım kalıbına göre kurulduğu ve gezinme sütununun HANGİ
tıklama dizisiyle ölçüldüğü yazıyor. Kalıplar:

- **liste–panel** — `kl-duzen`: solda liste, sağda seçili kayıt
  (onaylı Müşteriler görseli). Telefonda tek sütun.
- **detay + sekme** — üstte künye, altında sekme şeridi (geniş ekranda
  bağlantı rayı, dar ekranda açılır liste).
- **kart ızgarası** — eşit ağırlıklı kartlar (Ana Sayfa, Ürünler).
- **rapor** — dönem seçimli özet, dağılım ve tablolar; seçilecek kayıt yok.
- **sorun panosu** — sekmelerde açık sorunlar, satırın "detayı" başka kayıt.
- **form** — tek kolonlu form kartları.
- **yönlendirme** — içerik yok, ara katmanda 308.
- **kabuk yüzeyi** — konsolun ortak kabuğu (arama, bildirim, kılavuz).

| Rota | Tasarım kalıbı | Ölçülen akış |
| --- | --- | --- |
| `/panel` | kart ızgarası (karar kuyruğu + ürün kartları) | kuyruk kalemine tıkla → ilgili KAYIT açılıyor (1440/768/390) |
| `/panel/platform` | yönlendirme | üç giriş yolu (doğrudan, uygulama içi, geri/ileri) → 308 |
| `…/musteriler` | liste–panel | süzgeç → kaydır → kayıt aç → tam kart → geri → kapat → yeni süzgeç |
| `…/musteriler/[id]` | detay + sekme | panelden tam karta geçiş ve geri dönüşte süzgecin korunması |
| `…/kullanicilar` | liste–panel | evre süzgeci → kaydır → kayıt aç → kapat → yeni süzgeç |
| `…/kullanicilar/[id]` | detay + sekme | listeden detay, geri dönüş |
| `…/subscribers` | liste (satır içi düzenleme) | adresten açılış + düzen ölçümü |
| `…/duyuru` | form | adresten açılış + düzen ölçümü |
| `…/rapor` | rapor | adresten açılış + düzen ölçümü |
| `…/tahsilat` | rapor | adresten açılış + düzen ölçümü |
| `…/tahsilat/proforma/[id]` | detay | listeden detaya geçiş |
| `…/payments` | liste–panel | kaydır → ödeme aç → uyarı ve tutar oku → karar formu → kapat |
| `…/billing` | sorun panosu | adresten açılış + düzen ölçümü |
| `…/yenilemeler` | yönlendirme | üç giriş yolu → 308 |
| `…/sozlesmeler` | liste–panel | kaydır → kayıt aç → kapat |
| `…/destek` | liste–panel | sekme → kaydır → görüşme aç → yanıt kutusuna eriş → kapat → yeni sekme |
| `…/destek/[id]` | liste–panel (tam sayfa) | paylaşılmış bağlantıdan açılış |
| `…/destek/hazir` | form | adresten açılış + düzen ölçümü |
| `…/urunler` | kart ızgarası | ürün kartına tıkla → ürün detayı (1440/768/390) |
| `…/urunler?gorunum=moduller` | matris tablosu | sekme değişimi adresten |
| `…/urunler/[urun]` | detay + sekme | ürün aç → "Fiyat basamakları" sekmesi → taslak kutusu ve Kaydet erişimi (768/390) |
| `…/moduller` | yönlendirme | üç giriş yolu → 308 |
| `…/fiyatlar?urun=ek` | detay + sekme | taslak kaydet → yayım önizlemesi → onay |
| `…/fiyatlar?gorunum=karsilastirma` | rapor | adresten açılış + düzen ölçümü |
| `…/fiyatlar` | yönlendirme | üç giriş yolu → 308 |
| `…/saglik` | sorun panosu | "Zamanlanmış işler" sekmesi → iş satırı → iş detayı (768/390) |
| `…/saglik/is` | detay | sağlık ekranından geçiş |
| `…/kurulumlar` | liste (tablo) | adresten açılış + düzen ölçümü |
| `…/ayarlar` | form (bölüm sekmeli) | bölüm sekmesine tıkla → adres `?bolum=` → içerik geldi (768/390) |
| `…/ara` | kabuk yüzeyi | üst bar aramasından sonuç listesi |
| `/panel/notifications` | liste | adresten açılış + düzen ölçümü |
| `/panel/kilavuz` | kabuk yüzeyi | adresten açılış + düzen ölçümü |

Ortak kaplama yüzeyleri (rota değil, her ekranda var):

| Yüzey | Tasarım | Ölçülen akış |
| --- | --- | --- |
| Komut paleti (Ctrl+K) | `<dialog>` kaplama | üst bar aramasıyla aç → yaz → sonuç listesi ekranın içinde → ilk sonuca eriş → Esc kapatıyor (768/390) |
| Uygulamalar penceresi | kaplama | telefonda alt çubuğun "Daha fazla" gözünden, tablette sol rayın altından aç → pencere ekranın içinde, bağlantıları var |
| Tema | üst bar düğmesi / palet komutu | 768'de düğmeyle, 390'da palet komutuyla (düğme 520 px altında bilerek gizli) — `data-theme` gerçekten değişiyor |
| Alt çubuk (dock) | sabit şerit | telefonda son eylemin üstünü örtmüyor (ürün detayında "Kaydet" ölçüldü) |

### Tablet ve telefonda kritik akışlar (28.11.2026)

Akış kabulü (`konsol-akis-kabulu.mjs`) BEŞ liste ekranını tıklıyor;
konsolun geri kalanı o kalıba girmiyor. Liste dışındaki kritik
akışlar ayrı bir betikte:

```
GENISLIK=768 YUKSEKLIK=1024 node scripts/konsol-mobil-akis.mjs
GENISLIK=390 YUKSEKLIK=844  node scripts/konsol-mobil-akis.mjs
```

Ölçülen: hedef gerçekten geldi mi, yatay kaydırma doğdu mu ve eylem
ERİŞİLEBİLİR mi — görünür, ekranın içinde ve üstünü örten bir şey yok
(`elementFromPoint`). "Görünür" tek başına yetmiyor: alt çubuk sabit
ve son eylemin üstüne binen bir düğme ekranda durur ama tıklanmaz.

| Akış | 768×1024 | 390×844 |
| --- | --- | --- |
| Ana Sayfa karar kuyruğu → kayıt | ✓ | ✓ |
| Ürünler → ürün detayı → Fiyat basamakları → taslak kutusu + Kaydet | ✓ | ✓ (sekme açılır listeden) |
| Ayarlar → bölüm sekmesi (`?bolum=`) | ✓ | ✓ |
| Sistem sağlığı → zamanlanmış iş detayı | ✓ | ✓ (düzeltmeden sonra) |
| Komut paleti: aç → yaz → sonuç → Esc | ✓ | ✓ |
| Uygulamalar penceresi | ✓ (sol ray) | ✓ (alt çubuk) |
| Tema değişimi | ✓ (üst bar) | ✓ (palet komutu) |

**Telefonda çıkan ürün hatası:** Sistem sağlığı → "Zamanlanmış işler"
satırının mobil özeti (`MobilSatir`) `href` ALMIYORDU. 760 px'in
altında tablonun öteki hücreleri gizleniyor, iş adının bağlantısı da
onlarla birlikte gizleniyor — bağlantı sayfada duruyor, genişliği
sıfır. Sonuç: zamanlanmış bir işin detayı telefondan hiç açılamıyordu.
Sağlıktaki öteki tabloların hepsi `href` veriyordu, yalnızca bu
vermiyordu; ekran doğru göründüğü için önceki turlar görmemişti.
Düzeltildi ve ölçüm yeşil.

**Ölçümün kendisinde iki yanlış alarm çıktı** ve ikisi de betikte
kapatıldı: `:visible` / `has-text` Playwright'ın sözde sınıfları,
tarayıcının `querySelector`'ı onları bilmiyor (biri masaüstünün gizli
hücresini ölçüp "boyut 0" diyordu); Next'in geliştirme göstergesi
(`nextjs-portal`) sol alt köşede durup sol rayın en alttaki düğmesinin
tıklamasını yutuyordu. İkisi de üründe olmayan şeyler.

### Liste–panel düzeni NEREDE var, nerede YOK

Düzen beş ekranda: Müşteriler, Ödeme onayları, Destek, Sözleşme
onayları, Kullanıcılar. Ortak yanları: kaydın panelde gösterilecek
bir künyesi ve orada yapılacak bir işi var.

Üç ekranda BİLEREK yok:

| Ekran | Neden |
| --- | --- |
| Bireysel aboneler | Kayıtlar satır içinde düzenleniyor (`AboneListesi`); panele taşımak aynı düzenleyiciyi iki yerde tutmak olurdu. |
| Abonelikler (billing) | Kayıt listesi değil SORUN PANOSU: ödeme sorunları ve dönem sonu yaklaşanlar. Satırın "detayı" müşterinin kendi kartı. |
| Tahsilatlar | Rapor ekranı: dönem seçimli özet ve dağılımlar. Seçilecek bir kayıt yok. |

### Oturumlu tarayıcı kabulü (28.11.2026)

Önizlemenin ikinci kipi: altında GERÇEK bir veritabanı (PGlite,
canlı şemanın tamamı — tetikleyiciler, işlevler, RLS). Oturum
çerezden geliyor, yani yetkili ve yetkisiz hesap aynı turda
sınanıyor.

```
npm run onizleme:db                   # port 3126
node scripts/konsol-islem-kabulu.mjs  # altı senaryo
```

| Senaryo | Sonuç |
| --- | --- |
| Ödeme ONAYI arayüzden; yenileyince "Onaylandı", not kayıtta, lisans dönemi uzamış | ✓ |
| Ödeme REDDİ arayüzden; yenileyince "Reddedildi" | ✓ |
| Uyarı ("Beklenen tutarla uyuşmuyor") karardan ÖNCE okunuyor | ✓ |
| Destek yanıtı arayüzden; mesaj kayıtta, talep "Müşteri bekleniyor" | ✓ |
| Yetkisiz hesap: ekran kapalı, karar formu yok, KAYIT DEĞİŞMİYOR | ✓ |
| Dekont bağlantısı yetkilide var, yetkisizde yok | ✓ |
| Fiyat yayımı: ikinci oturum taslağı değiştirince ESKİ onay reddediliyor | ✓ |
| Güncel kapsam gösteriliyor ve yeniden onayla yayım geçiyor | ✓ |

**Arayüzden çıkan ürün hatası:** ödeme karar formunda onay penceresi
formun içinde çiziliyordu (iç içe form). Tarayıcı iç formu düşürüyor,
"Onayla" kararı GÖNDERMİYOR ve panel hata durumuna düşüyordu. Ekran
doğru çizildiği ve düğme erişilebilir olduğu için önceki kabuller
görmemişti; ancak tıklanınca ortaya çıktı.

**Kapsam kontrolü ile yazma aynı işlemde mi?** Değildi: sunucu
işlemi listeyi okuyup imzayı karşılaştırıyor, sonra RPC'yi
çağırıyordu — arada bir aralık var. Kontrol veritabanına indi
(migration 20261127182525): işlev bekleyen satırları `for update`
ile kilitliyor, imzayı kendi içinde hesaplıyor ve ancak ondan sonra
yazıyor.

**Önizlemenin bu kipinin sınırı:** Supabase Storage yok; dekont
bağlantısı yetkiye bakan bir TAKLİT. "Yetkisiz hesap dekonta
ulaşamıyor" kuralının arayüzdeki karşılığı sınanıyor, gerçek kova
politikası DEĞİL.

### İzole ortamda doğrulanan işlemler

`tests/db/konsol-kritik-islemler.test.mjs` (PGlite, gerçek fonksiyon
ve tetikleyiciler, canlıya dokunmadan):

| Senaryo | Sonuç |
| --- | --- |
| Ödeme onayı lisansı açıyor, dönemi uzatıyor, notu yazıyor | ✓ |
| Ödeme reddi lisansa DOKUNMUYOR | ✓ |
| Karar kurucuya özel (başka kurumun sahibi reddediliyor) | ✓ |
| Aynı bildirime ikinci kez karar verilemiyor | ✓ |
| Geçersiz karar sözcüğü reddediliyor | ✓ |
| Destek yanıtı talebi "müşteri bekleniyor"a çeviriyor + kuruma bildirim | ✓ |
| Başka kurumun talebine yanıt yazılamıyor | ✓ |

`tests/db/fiyat-toplu-yayim-yetkisi.test.mjs`: toplu yayım iki ürünü
birden yayımlıyor, kurucu olmayan reddediliyor, anon'a yetki yok,
iptal yalnızca kurucuda.

Kapsam kilidi (`tests/unit/fiyat-dogrulama`): önizlemeden sonra
taslak kümesi değişirse eski onayla yayım YAPILMIYOR.

**UNVERIFIED kalan:** imzalı dekont bağlantısı (Supabase Storage;
PGlite'ta depolama yok) ve arayüzden uçtan uca yazma (önizlemede
yazma simülasyon). Bunlar yetkili bir test ortamı ister.

### Beş kabul betiği ne ölçüyor

| Betik | Ne yapıyor | Ne SÖYLEMİYOR |
| --- | --- | --- |
| `konsol-rota-kabulu.mjs` (23 görsel) | Bir adresi açar, düzeni ÖLÇER (taşma, sütun sırası, yatay kaydırma, seçili satır, telefonda tek sütun) ve görüntüsünü alır. | Tıklama dizisinin ne yaptığını; ekranın durumu adresten mi geldiğini. |
| `konsol-akis-kabulu.mjs` (15 senaryo) | KULLANICI GİBİ TIKLAR: kaydır → kayıt aç → tam kart → tarayıcı geri → paneli kapat → yeni süzgeç. Süzgeç, sıralama ve kaydırma konumunu her adımda doğrular. | Yazan işlemlerin gerçekten yazdığını. |
| `konsol-panel-erisimi.mjs` | Sağ panelin SON EYLEMİNE üç yoldan erişimi: bilgi sırası, kaydırınca görünürlük + üstünü örten bir şey olup olmadığı, klavyeyle ulaşma. | Eylemin sonucunu. |
| `konsol-mobil-akis.mjs` (7 akış × 2 genişlik) | LİSTE DIŞINDAKİ kritik akışları tablet ve telefonda tıklar: karar kuyruğu, ürün sekmeleri, Ayarlar bölümleri, iş detayı, komut paleti, Uygulamalar penceresi, tema. Eylemin üstünü örten bir şey olup olmadığına bakar. | Yazan işlemlerin sonucunu; masaüstü düzenini. |
| `konsol-islem-kabulu.mjs` (6 senaryo) | GERÇEK veritabanının üstünde, oturum çereziyle: arayüzden onay/ret/yanıt/yayım, yenileyince kalıcılık, yetkisiz hesabın reddi, dekont erişimi, eşzamanlı yayım çakışması. | Supabase Storage'ın gerçek kova politikasını; e-posta/WhatsApp gönderimini. |

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

**Yönlendirme hatası KAPATILDI (27.11.2026).** Sebep: sayfa
`redirect()`ten önce bir şey beklediğinde `app/panel/loading.tsx`
Suspense sınırının altında kalıyor ve yönlendirme HTTP değil istemci
tarafı oluyordu. Dört eski adres artık ara katmanda
(`lib/konsol/eski-adresler.ts`), gerçek 308. Doğrulama: dört adres ×
üç giriş yolu (doğrudan, uygulama içi, geri/ileri), hem geliştirme
önizlemesinde hem İZOLE ÜRETİM DERLEMESİNDE — 12/12 temiz.
