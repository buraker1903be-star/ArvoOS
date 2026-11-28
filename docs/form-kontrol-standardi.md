# Ortak form kontrol standardı

10.11.2026. İlk uygulama: **Yeni talep formu** (`app/panel/crm/request-entry-form.tsx`). Diğer formlara kabulden
sonra yayılacak. Yeni görsel kimlik yok: renk, tipografi, açık/koyu tema ve mevcut sınıflar
(`panel-primary` / `panel-secondary` / `panel-danger`, `kayit-formu`, `PanelDrawer`) korunur.

## Parçalar

| Parça | Dosya | Ne yapar |
|---|---|---|
| Form alanı | `app/panel/components/form-alani.tsx` (`FormAlani`) | Kalıcı etiket (`for`), zorunlu işareti, yardım ve hata metni `aria-describedby` ile bağlı, `aria-invalid`. Alanın kendisi yerleşik `input`/`select`/`textarea`/`TarihSecici` olarak kalır (render prop). |
| Doğrulama | `formuDenetle`, `alanaGit` (aynı dosya) | Tarayıcının kendi kuralları (`required`, `minLength`, `type=email`) sorulur, kural kopyalanmaz; ilk hatalı alana odak ve görünür kaydırma. |
| Hata metinleri | `lib/form-hatalari.ts` (saf, birim testli) | "Talep konusu boş bırakılamaz.", "Geçerli bir e-posta adresi yazın (ör. ad@alan.com)." Sunucu doğrulama mesajını alana eşler. |
| Sonucu dönen işlem | `lib/panel-action.ts` · `runPanelActionDurumlu` | `{ tamam, hata }` döner. Form yalnızca "tamam"da sıfırlanır; hata çereze değil forma yazılır. |
| Gönderim düğmesi | `app/panel/components/gonder-dugmesi.tsx` (`bekliyor`) | Gerçek bekleme durumu. Süre dolunca açılmaz; 8 sn'de "Hâlâ işleniyor"; bekleyen düğme soluklaşmaz, dönen halka gösterir. |
| Görünüm | `app/panel/components/kayit-formu.css` | Alan kutusu, üzerine gelme, odak, hata (kalın çerçeve + simge + metin), devre dışı, boş seçim; bölüm grubu; telefonda 16px yazı. |

## Kurallar

- **Etiket kalıcı.** Yer tutucu yalnızca örnek verir, etiketin yerini tutmaz.
- **Zorunlu alan.** Etikette `*` gösterilir (ekran okuyucuya gizli), alanda `required` vardır; formun altında "* işaretli alanlar zorunlu" yazar.
- **Hata yalnızca renkle anlatılmaz.** Alanda kalın çerçeve, altında simge ve metin olur; metnin başında ekran okuyucu için "Hata:" vardır. Kaydet çubuğunda "Talep kaydedilmedi. N alanı kontrol edin · İlk alana git" yazar.
- **Değer kaybolmaz.** Gönderim elle başlatılır (`useActionState` + `startTransition`). React 19, `action` özniteliğiyle gönderilen ve fırlatmadan biten formu sıfırlıyordu. Başarı yalnızca sunucu "tamam" dediğinde gösterilir.
- **Çift gönderim.** Düğme, işlem süresince kilitlidir; Enter da ikinci işlem başlatmaz. Bu kilit veritabanı tekilliği **değildir**: talep eklemede tekillik anahtarı yok (`docs/takip-yerlesim-kurallari.md`, madde 6).
- **Seçiciler.** Yerleşik `select` ve `datalist` korunur; klavye, Esc ve ekran okuyucu davranışı tarayıcınındır. Az seçenekli alana arama eklenmez. Tarih için panelin `TarihSecici`'si kullanılır: panelin köküne çizilir, ekran dışına ya da pencere gövdesinin arkasına düşmez; Esc yalnızca takvimi kapatır.
- **Klavye türü.** Telefon için `type=tel`, e-posta için `type=email` kullanılır; ikisi de `inputMode` ile. Müşteri bilgisi alanlarında `autocomplete="off"`: personel müşterinin bilgisini yazıyor, tarayıcı personelin kendi bilgisini önermemeli.
- **Yerleşim.** Pencere başlığı ve kaydet çubuğu sabit kalır; yalnızca gövde dikey kayar. Yatay taşma olmaz. Telefonda kaydet çubuğu satır kırar (hata özeti tam satır) ve formun üçte birini aşmaz.
- **Hareket.** Mevcut 0.15–0.18 sn geçişler kullanılır. Hareketi azaltma tercihinde geçiş ve dönen halka durur. Animasyon kütüphanesi ya da ağır bulanıklık eklenmez.

## Pencere odağı (F-01, PR #316)

Kural `app/panel/components/odak-tuzagi.ts` · `useOdakTuzagi` içinde. Bu kancayı PanelDrawer, PanelBottomSheet, bildirim ve mesaj
çekmeceleri ile rapor penceresi kullanıyor.

- **Arka plan inert.** Pencere açıkken katmanın kökünden `body`'ye kadar her atanın kardeşleri `inert` olur: dock, sayfa ve kabuğun
  dışına eklenen öğeler (ör. Vercel Preview araç çubuğu). Eskiden yalnızca `.panel-root`'un çocukları inert oluyordu.
- **Sınırda sarma.** Tab son kontrolden ilk kontrole, Shift+Tab ilk kontrolden son kontrole döner. Kontroller her basışta yeniden
  sayılır; hata alanları ve beklerken devre dışı kalan düğme döngüyü bozmaz. Dinleyici katmanın kendi öğesindedir, yani odağı
  yalnızca en üstteki katman yönetir. Takvim gibi `.panel-root`'a çizilen açılır kontroller kendi tuşlarını yönetir.
- **Odak kaybı.** Odaktaki düğme devre dışı kalınca odak katmanın kapsayıcısına geri alınır.
- **Arka plan katmanı** fareyle ve dokunarak kapatır, Tab sırasında değildir. Klavyeyle kapatma Esc ve Kapat düğmesiyle olur. İlk Esc
  açık takvimi, sonraki Esc pencereyi kapatır; odak açan düğmeye döner.
- **Açılış.** Fareli cihazda odak ilk form alanına gider. Telefonda (`pointer: coarse`) kapsayıcıda kalır, çünkü alana odak sanal
  klavyeyi hemen açar.
- **Görünür odak.** Tab ile odaklanan alan sabit kaydet çubuğunun altında kalırsa pencere gövdesi o kadar kayar
  (`panel-drawer.tsx`).

## Ortak değişikliklerin diğer formlara etkisi

- **`kayit-formu.css`** panelde 50'yi aşkın formda kullanılıyor.
  - **Özgüllük aynı.** Mevcut `> label >` seçicilerinin özgüllüğü birebir korundu; yeni alan ayrı seçicide.
  - **Odak.** Odak kuralı daha önce temel alan kuralına özgüllükte yeniliyordu, artık geçerli. Bütün bu formlarda odaklanan alan genel dış çizgi yerine vurgu renkli çerçeve ve hafif halka alır.
  - **Üzerine gelme ve devre dışı.** Üzerine gelince çerçeve belirginleşir; devre dışı alan soluk zeminli olur.
  - **Telefon yazı boyu.** Telefonda alan yazısı 16px (iOS odakta sayfayı büyütmesin).
- **`GonderDugmesi`**: ana ekrandaki "Tamamla", teklif/sözleşme listeleri ve detayları, WhatsApp gönderimi, müşteri sohbeti, Bugün paneli. Bekleyen düğme artık soluk gri değil, kendi renginde ve dönen halkalı; uzun bekleme etiketi dar düğmede satır kırar.
- **Telefonda pencere kaydet çubuğu.** Satır kırma kuralı yalnızca `kayit-formu-eylem` taşıyan çubuklarda geçerli; diğer `panel-form-actions` çubukları değişmedi.

## Sınama

- `scripts/talep-formu-tarayici.mjs`: bileşen düzeyi, gerçek Chromium, sunucu işlemi taklit. 10 senaryo × 4 boyut × 2 tema.
- `scripts/pencere-odak-tarayici.mjs`: bileşen düzeyi; Yeni talep, Yeni teklif, Direkt sözleşme ve temsili Talebi düzenle pencereleri,
  `body`'ye eklenmiş dış öğe (Preview benzeri) varken ve yokken.
- `tests/unit/form-hatalari.test.ts`.

Gerçek uygulamada kabul ve sanal klavye: **UNVERIFIED** (ayrıntı PR'da).
