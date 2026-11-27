# Doçentlik — PR7 kabul senaryoları

F6 PR6b'nin (15.11.2026) kod aşaması kapandı. Bu belge, **gerçek Next.js
çalışma zamanı, gerçek PostgREST ve gerçek Supabase Storage** ile koşulacak
kabul senaryolarını sayar. Hiçbiri canlı (Production) ya da paylaşılan Test
projesinde koşulmaz: izole bir Supabase projesi (ya da yerel `supabase
start`) ve yalnızca **sentetik** kurum/kişi verisi kullanılır.

Her satırın sonucu şunlardan biri yazılır:
- **PASS**: gözlendi.
- **FAIL**: düzeltme gerekiyor.
- **UNVERIFIED**: altyapı yok, koşulamadı.

"Yerelde kanıtlanan" sütunu, aynı davranışın bugün hangi yerel testle
sınandığını gösterir. PR7, yerel testin göremediği farkı ölçer: çerez, Set-Cookie,
PostgREST'in satır tavanı ve aralık hataları, depo politikası, imzalı adres.

## Ön koşullar (izole ortam)

1. İzole Supabase projesine şema dökümü ve bekleyen migration'lar uygulanır.
   Canlıya migration uygulanmaz.
2. Sentetik tohum kurulur:
   - iki kurum (AM, AM2) ve 8 aktör: sahip, üye, gözetim, yönetici, Kurum Sahibi, yabancı, iptal, gözetimKapalı;
   - `tests/db/docentlik-ortak.mjs` ile aynı yetki dağılımı;
   - kişi başına 1500 faaliyet ve 1100 profilli bir "büyük kurum".
3. Uygulama izole projeye bağlı bir Vercel Preview'da ya da `npm run build && npm start` ile ayağa kalkar.
4. `PGRST_DB_MAX_ROWS` iki değerle ayrı ayrı denenir: 1000 (varsayılan) ve 300. İkincisi küçük satır tavanını sınar.

## 1. Akademisyen faaliyet ve profil akışları

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 1.1 | Profil kaydet (temel alan, alt alan, doktora tarihi) | Bildirim "Profil kaydedildi", sayfa yenilenince değerler duruyor | Form durumları (düzenek), sunucu sözleşmesi |
| 1.2 | Faaliyet ekle | Tek satır; puan çekirdeğin değeriyle; liste ve özet aynı anda yenileniyor (`revalidatePath` layout) | `docentlik-atomik-yazim` (DB), düzenek |
| 1.3 | Aynı gönderimi çift tıkla / yeniden gönder | Tek satır (istek anahtarı) | DB + düzenek |
| 1.4 | DP001 (kriter arada değişti) | Bildirimde Türkçe mesaj, form alanları korunuyor | Birim (`faaliyetYazimHatasi`), düzenek (alan korunuyor) |
| 1.5 | DP002 (anahtar başka içerikte) | Türkçe mesaj, yeni satır yok | DB |
| 1.6 | Eşzamanlı düzenleme (iki sekme) | İkinci kayıt "başka biri değiştirdi" der, üzerine yazmaz | DB (tek bağlantı, UNVERIFIED gerçek yarış) |
| 1.7 | Faaliyet sil (onay penceresi) | Vazgeç → hiçbir şey; Sil → tek kayıt gider, belgesi de silinir | Düzenek |
| 1.8 | `?sayfa=99999` | İlk sayfaya yönlendirme, çökme yok | Sözleşme testi |

## 2. Puan ve hedef doğruluğu

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 2.1 | Sayılan/ham puan, grup tavanı | Ekran = PR #318 çekirdeği | `docentlik-puan`, `docentlik-ozet` |
| 2.2 | Doktora sonrası hedef; tarih yokken | "Ölçülemedi", "yok" değil | Birim |
| 2.3 | **1500 faaliyetli kişi**: kişinin kendi özeti ve gözetimden kişi sayfası | Toplam ve doktora sonrası puan iki yerde aynı; "bilinmiyor" dönemi yok | `docentlik-eksiksiz-okuma` (DB, PostgREST taklidi) |
| 2.4 | 2.3, `max-rows = 300` ile | Aynı sonuç (kısa sayfa son sayfa sayılmıyor) | `docentlik-sayfalama` (birim) |
| 2.5 | Okuma sırasında faaliyet eklenmesi | "Eksiksiz okunamadı, yenileyin" hatası; yanlış toplam gösterilmez | Birim |
| 2.6 | Kriter puanı değişince eski faaliyetler | Eski puan değişmez | DB (tetikleyici) |

## 3. PDF Storage işlemleri

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 3.1 | PDF ekle (1 MB) | Hazırla → yükle → kaydet; Görüntüle 60 sn'lik imzalı adresle açılıyor | Düzenek (taklit depo) |
| 3.2 | PDF değiştir | Yeni kayıt sonra eski nesne silinir; arada hata olursa eski belge kalır | Kod incelemesi |
| 3.3 | PDF kaldır | Önce kayıt, sonra nesne; faaliyet ve puan kalır | Kod incelemesi |
| 3.4 | .png'yi .pdf adıyla yükle | Sunucu `%PDF-` imzasında reddeder, nesne silinir, bildirim görünür | Sunucu kodu; bildirim düzenekte |
| 3.5 | 20 MB'a yakın dosya, yavaş ağ (DevTools "Slow 3G") | 15 sn'yi aşsa da sunucu hatası bildirimde görünür | Düzenek (16,5 sn'lik yükleme, düzeltme kapalıyken düşüyor) |
| 3.6 | Başkasının ya da başka kurumun yoluna doğrudan yükleme (API) | Depo politikası reddeder | `docentlik-belge-kovasi` (DB) |
| 3.7 | İmzalı adres 60 sn sonra | Erişim reddedilir | — (UNVERIFIED) |
| 3.8 | Yükleme ile kayıt arasında sekmeyi kapat | Sahipsiz nesne kalır; kimse okuyamaz; günlükte `[docentlik][sahipsiz-nesne]` | Açık risk (temizlik kuyruğu yok) |

## 4. Gözetim yetkileri

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 4.1 | `tumunu_gor` rol düzeyinde: Kurum listesi | 1101 kişi (büyük kurum) eksiksiz; doktora tarihi hiçbir yanıtta yok (ağ sekmesinde de) | DB + düzenek |
| 4.2 | Kişi sayfası | Yalnızca okuma ve Görüntüle düğmesi var | Düzenek |
| 4.3 | Kişi düzeyinde kapatılmış `tumunu_gor` (gözetimKapalı) | "Yetkiniz yok", veri okunmuyor | DB (RLS), düzenek |
| 4.4 | Yetkisiz üye `/kurum`, `/kriterler`, `/uak` | Kapalı ekran, tablo yok, veri sızıntısı yok | Düzenek (`sizinti` denetimi) |
| 4.5 | Ad görünmüyorsa | "Üye xxxxxxxx" yedeği (profiles RLS) | UNVERIFIED |

## 5. Kriter ve ÜAK yönetimi

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 5.1 | Kriter ekle/düzenle/pasife al/sil | Faaliyeti olan kriter silinmez ("pasife alın") | DB + düzenek |
| 5.2 | Hedef asgari/azami, doktora sonrası azami yazılamaz | Veritabanı kısıtı, Türkçe mesaj | DB |
| 5.3 | ÜAK yükle, aynı temel alana ikinci tablo | İkinci reddedilir, yüklenen nesne silinir | Sunucu kodu |
| 5.4 | ÜAK "Öneri hazır" | Rozet ayrı, içerik görünmez, Onayla devre dışı ve nedeni yazılı | Düzenek |
| 5.5 | `uakOnayla` API'den doğrudan | Her koşulda reddedilir | Sunucu sözleşmesi |

## 6. Kurumlar arası erişim engeli

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 6.1 | AM2 sahibi, AM'nin kişi kimliğiyle `/kurum/<id>` | Boş özet, "kurumunuzda değil" | DB (RLS matrisi) |
| 6.2 | AM2 sahibi, AM'nin faaliyet kimliğiyle `belgeAdresi` | "Belge bulunamadı" | DB |
| 6.3 | PostgREST'e doğrudan `docentlik_faaliyet_donemleri(AM)` | 0 satır | DB |

## 7. Modül devre dışı bırakılması ve üyelik iptali

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 7.1 | Modül kapanınca `/panel/docentlik/*` | Yerleşim yönlendirir; RPC'ler boş döner | DB + sözleşme |
| 7.2 | İşlem sırasında modül kapanır | Yazım yapılmaz; Türkçe mesaj | DB |
| 7.3 | Üyelik iptal | Yazamaz; geçmiş faaliyet gözetimde görünür | DB |

## 8. Gerçek Next.js/PostgREST davranışı

| # | Senaryo | Beklenen |
|---|---|---|
| 8.1 | `runPanelAction` hata çerezi üretimde | Bildirim görünür (Next üretimde mesajı gizliyor) |
| 8.2 | `count: "exact"` RPC üzerinde | `Content-Range` toplamı dönüyor; `hepsiniOku` sayıyı alıyor |
| 8.3 | Aralık dışı istek (416) | Okuma "okunamadı" ile düşer, sayfa çökmez |
| 8.4 | `revalidatePath(..., "layout")` | Ekleme sonrası özet ve liste birlikte yenilenir |
| 8.5 | `npm run duman` doçentlik rotaları | 7 rota açılıyor, sayısal digest yok |

## 9. Masaüstü, tablet ve mobil regresyon

| # | Senaryo | Beklenen | Yerelde kanıtlanan |
|---|---|---|---|
| 9.1 | 1440, 1024, 768, 390 × açık/koyu, 7 ekran | Taşma yok, kontrast ≥ 4,5 | Düzenek: 136 durum, 0 sorun |
| 9.2 | Gerçek cihaz: iOS Safari ve Android Chrome; dosya seçici, pencere, odak | Dosya seçici açılır, pencere klavyeyle kapanır | UNVERIFIED |
| 9.3 | Talep/teklif formları (PanelModal odak tuzağı) | Gerileme yok | `panel-modal-odak-tarayici` 26/26 |
