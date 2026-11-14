# Doçentlik — sunucu işlemleri (F6 PR5)

Bağımlılık zinciri: #317 (özel modül izin listesi) → #318 (puan çekirdeği)
→ #319 (şema/RLS/depo) → #320 (navigasyon/yetki) → bu PR. Kullanıcı
ekranları bu PR'da YOK; sayfalar sonraki PR'da buradaki işlemleri çağırır.

## Dosyalar

| Dosya | Ne | Neden ayrı |
|---|---|---|
| `lib/docentlik-islem.ts` | Saf: form doğrulama, depo yol sözleşmesi, PDF/boyut denetimi, beklenen puan, özet, ÜAK onay kararı | Birim testine girebilsin (Next/Supabase'e dokunmuyor) |
| `app/panel/docentlik/baglam.ts` | `docentlikBaglami()` kapısı, `yetkiGerekli`, `okunamadiysaFirlat` | `server-only`, "use server" DEĞİL — dışarıya uç nokta açmaz |
| `app/panel/docentlik/veri.ts` | Okumalar (liste, özet, profil, kriter, hedef, ÜAK) | Aynı gerekçe |
| `app/panel/docentlik/actions.ts` | "use server" yazma işlemleri | Yalnızca dışarıya açık olması gerekenler export |
| `supabase/migrations/20261114213340_docentlik_istek_anahtari.sql` | `istek_anahtari` sütunu + benzersiz dizin + sütun INSERT yetkisi | Çift gönderimde ikinci satır doğmasın |

## Her işlemin ortak kapısı

`docentlikBaglami()` her işlemin İLK satırı:

1. `getPanelContext()` — oturum + ETKİN üyelik (kimlik ve kurum YALNIZCA
   buradan; formdan `owner_id`/`organization_id` okunmaz).
2. Kurumda `docentlik` modülü açık değilse `DOCENTLIK_KAPALI`.
3. `assertModuleKeyAccess(rol, "docentlik", gizliModüller)` — kullanıcı
   düzeyinde modül erişimi.
4. Yetenek anahtarları `izin("docentlik.tumunu_gor" | "kriter_yonet" |
   "uak_yonet")` ile, ArvoOS yetki sistemi üzerinden (#320).

Sunucu kapısı yalnızca anlaşılır mesaj içindir; asıl karar RLS'te
(#319). İşlem sırasında üyelik ya da modül kapanırsa RLS yazımı eler, her
yazım `.select()` ile döner ve 0 satır "üyelik/modül bu arada kapanmış
olabilir" hatasıdır — sessiz "başarılı" yok. `service_role` hiçbir yolda
kullanılmıyor.

## Sunucu işlemleri (hepsi `runPanelAction` ile sarılı)

| İşlem | Girdi (FormData) | Yetki | Dönüş | Not |
|---|---|---|---|---|
| `faaliyetEkle` | `kriter_id, baslik, birim_sayisi, yazar_sayisi, baslica_yazar, faaliyet_tarihi?, notlar?, istek_anahtari?` | üye | `{id, tekrar}` | Kriter aktif olmalı. Puan istemciden ALINMAZ; tetikleyici yazar, sunucu PR #318 çekirdeğiyle beklenen puanı hesaplayıp karşılaştırır — tutmazsa satır silinir ve hata. Aynı `istek_anahtari` → ilk kayıt döner (`tekrar: true`). |
| `faaliyetDuzenle` | yukarıdakiler + `faaliyet_id, surum` (`updated_at`) | sahibi | `{id, tekrar}` | İyimser eşzamanlılık: `surum` tutmazsa yeniden okur; aynı değerler → başarı (yeniden deneme), farklı → "bu arada değişti". Başlık/not/tarih/belge puanı değiştirmez; birim değişikliğinde eski birim puan korunur. |
| `faaliyetSil` | `faaliyet_id` | sahibi | `{silindi}` | Önce kayıt, sonra depo nesnesi. Tekrarı zararsız. |
| `profilKaydet` | `doktora_tarihi?, temel_alan?, alt_alan?` | kendisi | — | Tarih gerçek takvim günü, gelecekte değil (Türkiye günü); alt alan yalnızca temel alanla. |
| `kriterEkle` / `kriterDuzenle` | `kod (yalnız ekleme), etiket, grup, birim_puan, esit_bolusum, baslica_katsayi, diger_katsayi, temel_alan?, alt_alan?, notlar?, aktif` (+`kriter_id`) | `kriter_yonet` | `{id}` | Kriter değişince eski faaliyetlerin puanı DEĞİŞMEZ (tetikleyici girdiler aynıyken dokunmaz). |
| `kriterSil` | `kriter_id` | `kriter_yonet` | `{silindi}` | Faaliyeti olan kriter: 23503 → "pasife alın". |
| `hedefKaydet` / `hedefSil` | `hedef_id?, grup, asgari_puan?, azami_puan?, doktora_sonrasi, temel_alan?, alt_alan?, notlar?` | `kriter_yonet` | — / `{silindi}` | 23505 → anlaşılır mesaj. |
| `belgeYuklemeHazirla(faaliyetId)` | — | sahibi | `{kova, yol}` | Yolu SUNUCU üretir: `<kurum>/faaliyet/<sahip>/<faaliyet>/<uuid>.pdf`. |
| `belgeKaydet` | `faaliyet_id, yol` | sahibi | `{yol, tekrar}` | Yol sözleşmeye uymalı (kurum/sahip/faaliyet bu oturumdan); nesne `info()` ile PDF türü ve ≤ 20 MB, ilk baytlar `%PDF-`. Herhangi bir başarısızlıkta yüklenen nesne silinir; eski belge DB güncellemesinden SONRA silinir. |
| `belgeAdresi(faaliyetId)` | — | sahibi ya da `tumunu_gor` (RLS + depo okuma politikası) | `{adres, saniye: 60}` | Kısa ömürlü imzalı adres. |
| `belgeKaldir` | `faaliyet_id` | sahibi | `{kaldirildi}` | Önce kayıt, sonra nesne. |
| `uakYuklemeHazirla()` | — | `uak_yonet` | `{kova, yol}` | `<kurum>/uak/<uuid>/<uuid>.pdf` |
| `uakKaydet` | `yol, temel_alan, donem, dosya_adi?` | `uak_yonet` | `{id, tekrar}` | Aynı temel alanda tablo varsa reddeder ("önce kaldırın"); temizlik aynı. |
| `uakAdresi(tabloId)` | — | `uak_yonet` | `{adres, saniye}` | |
| `uakSil` | `tablo_id` | `uak_yonet` | `{silindi}` | Önce kayıt, sonra nesne. |
| `uakOnayla` | `tablo_id` | — | her zaman hata | `UAK_ONAYI_ETKIN = false`: PDF içeriği doğrulanmadan onay yok, otomatik onay yok, veritabanına yazmaz. Öneri üretimi (yapay zekâ / dış API) kapsam dışı. |

## Okumalar (`veri.ts`)

`faaliyetlerim(sayfa)`, `kurumFaaliyetleri(sayfa, kisi?)` (`tumunu_gor`),
`docentlikOzetim()` (kendi doktora tarihiyle), `kisiOzeti(kisi)`
(`tumunu_gor`; doktora tarihi YOK — `docentlik_profil_ozetleri` ve
`docentlik_faaliyet_donemleri` işlevlerinden), `profilim()`,
`kriterleriOku()` (pasifler yalnızca `kriter_yonet`'e), `hedefleriOku()`,
`uakTablolari()` (`uak_yonet`). Özet bütün faaliyetleri 1000'lik sayfalarla
okur (satır tavanı toplamı eksiltmesin); grup puanı, tavan ve hedef durumu
PR #318 çekirdeğinden. Her okuma hatayı fırlatır.

## Doğrulanmamış (UNVERIFIED)

Gerçek tarayıcı, Next çalışma zamanı ve canlı Storage API ile sınanmadı:
`storage.info()`, `download()`, `createSignedUrl` (60 sn ömrün gerçekten
dolması), tarayıcıdan doğrudan yükleme, `runPanelAction` çerez mesajı.
DB davranışı PGlite'ta storage taklidiyle sınandı; işlem kodunun yapısı
kaynak sözleşme testleriyle (`tests/unit/docentlik-sunucu-sozlesmesi.test.ts`).
