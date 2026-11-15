# Doçentlik — PR7 entegrasyon ve kabul sonuçları

Bu belge 15.11.2026 tarihli koşunun sonuçlarını özetler. Kapsam
`docs/docentlik-pr7-kabul-senaryolari.md` dosyasıdır.

Ortam yalnızca bu makinedeki yerel kapsayıcılardan ve sentetik veriden oluşur
(`scripts/docentlik-entegrasyon/ortam.sh`). Canlı (Production) ya da paylaşılan
Test Supabase projesine bağlanılmadı. Canlıya migration uygulanmadı.

## Yığın: taklit yok

| Katman | Sürüm | Not |
|---|---|---|
| PostgreSQL | 17 (docker `postgres:17`) | Canlı döküm, 31 bekleyen migration ve 904 yetki satırı `sema-kur.mjs` ile kuruldu. |
| GoTrue | 2.197.0 | Parolalı giriş ve JWT; kullanıcılar yönetici API'siyle açıldı. |
| PostgREST | 12.2.3 | İki örnek: `db-max-rows` 1000 ve 300. |
| Supabase Storage API | 1.19.3 (dosya arka ucu) | Kova politikaları gerçek `storage.objects` tablosunda. |
| Next.js | 16.2.6 | `next build` ve `next start`; tarayıcı Chromium (Playwright). |
| Ağ geçidi | `gecit.mjs` | Kong'un yönlendirmesini ve CORS ön kontrolünü taklit eder; gövdeye dokunmaz. |

Düz `postgres:17` imajında olmayan, barındırılan Supabase imajında hazır gelen
iki ayar elle eklendi:
- `storage` şemasında `anon`, `authenticated` ve `service_role` yetkileri (`storage-yetkileri.sql`);
- CORS ön kontrolü (ağ geçidinde).

## Bulunan ve düzeltilen hatalar

1. **Büyük kurumda akademisyen adları hiç görünmüyordu.**
   - `lib/kisi-adlari.ts` 1102 kimliği tek bir `in.(…)` süzgecine koyuyordu.
   - Gerçek PostgREST isteği **431 Request Header Fields Too Large** ile reddetti; herkes "Üye xxxxxxxx" yedeğiyle göründü.
   - Düzeltme: kimlikler 100'lük parçalarla soruluyor. Birim testi eklendi.
2. **Sunucu işleminin isteği koptuğunda ekran susuyordu.**
   - Gerçek Next.js'te ölçüldü: yanıtı kaybolan istek kaydı yazdı, ama "Failed to fetch" yakalanmadı ve mesaj çıkmadı.
   - Düzeltme: formlar artık "Bağlantı koptu; sonuç bilinmiyor" diyor (`lib/baglanti-hatasi.ts`).
   - İstek anahtarı korunuyor: aynı form yeniden gönderilince ikinci kayıt oluşmuyor, içerik değişmişse DP002 bildirimi çıkıyor.
   - Düzeltme olmayan derlemede kabul testi düşüyor, yeni derlemede geçiyor.

## Sonuçlar

**G** = gerçek yığında doğrulandı. **S** = yalnızca sentetik taklitte doğrulandı (PR6b düzeneği).

| Senaryo | Sonuç | Tür | Kanıt |
|---|---|---|---|
| Profil kaydı | PASS | G | tarayıcı 1.3 |
| Faaliyet ekle, düzenle, sil; çift tıklama | PASS | G | tarayıcı 1.4, 1.5, 1.10, 1.11 |
| Puan çekirdeği ↔ tetikleyici eşdeğerliği | PASS | G | API 2.1; tarayıcı 1.4 |
| 1500 faaliyet ve 1101 profil, tavan 1000 ve 300: eksiksiz sayfalama | PASS | G | API 1.x; tarayıcı 1.1, 1.2, 3.1, 3.4 |
| Aralık dışı istek (416) | PASS | G | API |
| Aynı isteğin tekrarı; eşzamanlı iki gönderim | PASS | G | API (iki bağlantı, `Promise.all`) |
| İki oturumlu eşzamanlı düzenleme | PASS | G | API (yalnızca biri yazar) |
| DP001 Next.js ekranına ulaşıyor | PASS | G | tarayıcı 1.6 (geçici tetikleyiciyle) |
| DP002 Next.js ekranına ulaşıyor | PASS | G | tarayıcı 1.8 (ağ kopması ve değişen içerik) |
| Ağ kopmasında "sonuç bilinmiyor" mesajı ve anahtarın korunması | PASS (düzeltildi) | G | tarayıcı 1.7, 1.9 |
| PDF yükle, görüntüle (60 sn), değiştir, kaldır | PASS | G | tarayıcı 2.1–2.6; API 5.x |
| İçeriği PDF olmayan dosya: sunucu reddeder, nesne silinir | PASS | G | tarayıcı 2.4 |
| İmzalı adresin süresi dolunca reddedilmesi | PASS | G | API (2 sn'lik adres; 60 sn'lik adreste exp−iat = 60) |
| Yetkisiz Storage erişimi (başka kişi/kurum, upsert, 21 MB, PNG, ÜAK yolu) | PASS | G | API 5.x |
| Kurumlar arası yalıtım | PASS | G | API 4.x; tarayıcı 5.2 |
| Yetkisiz gözetim, kriter ve ÜAK ekranlarında veri sızmaması | PASS | G | tarayıcı 5.1 (4 ekran) |
| Kriter, hedef ve ÜAK yönetimi (Türkçe ondalık, faaliyetli kriter, onay kapalı) | PASS | G | tarayıcı 4.x; API 6.x |
| Modül kapanması | PASS | G | API 7; tarayıcı 5.3 |
| Üyelik iptali | PASS | G | API 4.4 |
| Doğrudan tablo yazımı puanı bozamıyor | PASS | G | API 3.x |
| Gözetim adları (1102 kişi) | PASS (düzeltildi) | G | tarayıcı 3.2 (personel kaydı olan) |
| Masaüstü, tablet, mobil; açık ve koyu tema | PASS | G | tarayıcı 6.1 (5 ekran × 4 boyut × 2 tema) |
| Ortak PanelModal (gerçek uygulama) | PASS | G | tarayıcı 6.2 |
| Kontrast ve iç taşma (136 durum) | PASS | S | `docentlik-yerlesim-tarayici.mjs` |
| Gerçek iOS Safari ve Android Chrome | UNVERIFIED | — | cihaz yok |
| Barındırılan Supabase'e özgü ayarlar (Kong, CDN, S3 arka ucu, gerçek alan adı) | UNVERIFIED | — | yerelde dosya arka ucu ve taklit ağ geçidi |

## Açık riskler

1. **Gözetim adları ve `profiles` RLS.** `profiles` tablosu yalnızca kişinin kendi
   satırına açık. Gözetim rolü adı yalnızca `hr_employees` kaydı varsa görüyor;
   personel kaydı olmayan akademisyen "Üye xxxxxxxx" olarak görünüyor.
   - RLS gevşetilmedi.
   - Öneri: dar bir `security definer` RPC, örneğin `docentlik_kisi_adlari(p_org, p_kisiler uuid[])`.
     Yalnızca o kurumun üyelerinin adını döndürür; yalnızca `docentlik.tumunu_gor` ve modül açıkken çalışır.
2. **`belge_yolu` RPC dışından yazılabiliyor (düşük).** Sütun istemciye açık, bu yüzden
   sunucunun `%PDF-` denetimi atlanabiliyor.
   - Sınırlar: yol kişinin kendi klasöründe olmak zorunda (CHECK kısıtı); kova yalnızca
     `application/pdf` kabul ediyor; nesne `application/pdf` olarak sunuluyor (ölçüldü).
   - Öneri: `update (belge_yolu)` yetkisini kaldırıp yazımı bir `security definer` RPC'ye almak.
     Bu RPC nesnenin varlığını ve türünü denetler.
3. **Sahipsiz PDF temizliği.** Tespit sorgusu hazır ve gerçek Storage'da sınandı
   (`sahipsiz-nesneler.sql`). Önerilen güvenli ve tekrar denenebilir temizlik:
   - Saatlik bir `cronRotasi` işi, `service_role` ile çalışır.
   - Tespit sorgusunu 24 saat eşikle kullanır ve en fazla N nesneyi `storage.remove` ile siler. Silinemeyen nesne bir sonraki turda yeniden denenir.
   - İş idempotenttir: silinmiş nesne sorguda bir daha çıkmaz. Kayda bağlı nesneye asla dokunmaz.
   - Sonucu cron kaydına yazar.
4. **Gözetim listesi sayfasız.** 1102 kişi tek sayfada çiziliyor (sayfa yüksekliği yaklaşık 50.000 px).
   Doğruluk sorunu yok; büyük kurumda yavaşlık riski.
