# Takip — yerleşim ve ortak kontrol kuralları (PR #314 sonrası)

Ürün kuralları (10.11.2026): sayfa düzeyinde kaydırma yok, kart/panel içinde yatay kaydırma yok, uzun içerik
yalnızca ilgili alanın içinde dikey kayar; dock ve temel eylemler erişilebilir kalır; yakınlaştırma serbest.

Bu belge **iddia değil, durum listesidir**. "Uygulandı" kod düzeyini anlatır; gerçek tarayıcıda ölçülmeden
hiçbir satır "doğrulandı" sayılmaz.

## PR #314 kapsamı (uygulandı; tarayıcı doğrulaması bekliyor)

| Ekran / parça | Durum | Kanıt düzeyi |
|---|---|---|
| Ortak kabuk: etiketli dock, Uygulamalar paneli, bölüm menüsü | Uygulandı | Kaynak testleri (`tests/unit/os-dock-yerlesim.test.ts`, `os-apps.test.ts`, `posta-rozeti.test.ts`). Gerçek uygulamada **UNVERIFIED** |
| Ana ekran: sabit yerleşim, kart içi dikey kaydırma, telefonda görünüm seçici | Uygulandı | **UNVERIFIED** (390×844, 768×600, 1363×936, 1440×900, 1440×600 açık/koyu ölçülmedi) |
| CRM genel bakış: aynı yerleşim, NAV-01 rozetin alt satıra inmesi | Uygulandı | **UNVERIFIED** |
| Kısaltılmış adın tamamı (dokunma/klavye) | Uygulandı | Bileşen düzeyinde gerçek Chromium: `scripts/tam-metin-tarayici.mjs` 8/8. Uygulamada **UNVERIFIED** |
| Ortak gönderim düğmesi (çift gönderim) | Uygulandı: ana ekran "Tamamla" | Bileşen düzeyinde gerçek Chromium: `scripts/gonder-dugmesi-tarayici.mjs` 11/11. Uygulamada **UNVERIFIED** |
| Yakınlaştırma serbest | Uygulandı (viewport, iOS hareket engeli, sayfa `touch-action` kaldırıldı) | **UNVERIFIED**: büyütülmüş yazı ve iki parmak yakınlaştırmada taşma ölçülmedi |
| Sanal klavyede odaklanan alan | Kod değişikliği yok | **UNVERIFIED** |

## Kalan ihlaller (yapılmadı)

1. **Operasyon, Finans, İK genel bakışları**: eski 4 sütunlu, sayfa boyunca kayan düzen. Çözüm hazır parçalarla:
   `GenelBakis sinif="dash-sabit"` + `GorunumSecici` (ana ekran / CRM genel bakışta olduğu gibi).
2. **Liste sayfaları (talepler, teklifler, sözleşmeler, işler, cari, finans)**: dar ekranda tablo satırları; ürün
   kuralı öncelikli sütun ya da kayıt kartı istiyor. Tablolarda yatay taşma olup olmadığı ölçülmedi.
3. **Uzun formlar (çekmece ve pencere)**: başlık ve gönder alanı sabit, gövde kayar kuralı her formda
   doğrulanmadı (`panel-drawer`, `panel-modal`, `kayit-formu`).
4. **Seçiciler**: aranabilir seçim, klavyeyle gezinme, Esc ve odak dönüşü ortak bir bileşende yok.
5. **Ortak gönderim düğmesi** yalnızca ana ekranda kullanılıyor. `useFormStatus` kullanan beş yerel kopya
   (`invite-team-form`, `proposal-builder-form`, `contract-*-form` vb.) ve `useFormStatus` kullanmayan formlar
   taşınmadı.
6. **Sunucu tarafı tekrar koruması** (arayüz kilidi veri bütünlüğü garantisi değildir):
   - `toggleWorkflowStep`: koşullu güncelleme eklendi, çift gönderim geçmişe ikinci satır yazmıyor
     (`app/panel/operations/actions.ts`, `lib/is-adimlari.ts · adimZatenHedefte`).
   - Talep oluşturma (`app/panel/crm/actions.ts`, `crm_opportunities` insert): tekillik/idempotency anahtarı
     **yok**; çift gönderim iki talep açabilir. Öneri: formda tek kullanımlık istek anahtarı + benzersiz kısıt.
   - PayTR bildirimi (`merchant_oid` tekil) ve havale onayı (`status = pending` koşulu) zaten tekrara dayanıklı.
7. **Sayfa genel geri bildirimi** (`global-action-feedback.tsx`): "Yükleniyor…" göstergesi en geç 6 sn'de
   kapanıyor; işlem sürüyor olabilir. Kilit vermiyor (PR #314'te bu yüzden kilit kaldırıldı); gösterge
   metni ileride "işlem sürüyor olabilir" diye netleştirilebilir.
