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
| `supabase/migrations/20261115014302_docentlik_atomik_faaliyet_yazimi.sql` | `docentlik_faaliyet_ekle` / `docentlik_faaliyet_duzenle` (security invoker RPC) | Yazım ve puan doğrulaması tek veritabanı işleminde |

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
| `faaliyetEkle` | `kriter_id, baslik, birim_sayisi, yazar_sayisi, baslica_yazar, faaliyet_tarihi?, notlar?, istek_anahtari?` | üye | `{id, tekrar}` | Kriter aktif olmalı. Puan istemciden ALINMAZ; tetikleyici yazar. Sunucu PR #318 çekirdeğiyle beklenen puanı/katsayıyı/kural sürümünü hesaplayıp `docentlik_faaliyet_ekle`'ye verir; işlev yazım ve karşılaştırmayı TEK işlemde yapar, tutmazsa `DP001` ile işlem geri alınır — satır hiç doğmaz. Aynı `istek_anahtari` → ilk kayıt döner (`tekrar: true`); uyuşmazlıkla düşen istek anahtarı tüketmez. |
| `faaliyetDuzenle` | yukarıdakiler + `faaliyet_id, surum` (`updated_at`, **zorunlu**) | sahibi | `{id, tekrar}` | Kayıt `surum` ile okunur, beklenen puan o sürüme göre hesaplanır, `docentlik_faaliyet_duzenle` yalnızca o sürüm hâlâ geçerliyse yazar. Uyuşmazlıkta `DP001`: alanlar, puan ve `updated_at` olduğu gibi kalır. Sürüm tutmazsa hiçbir şey yazılmaz; yeniden okunur: aynı değerler → başarı (yeniden deneme), farklı → "bu arada değişti". Başlık/not/tarih/belge puanı değiştirmez; birim değişikliğinde eski birim puan korunur; girdiler aynıyken kaydın kendi kural sürümü korunur. |
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

## Atomiklik: veritabanı işlevleri (20261115014302)

| İşlev | Dönüş | Hata kodları |
|---|---|---|
| `docentlik_faaliyet_ekle(p_org, p_kriter, p_baslik, p_birim, p_yazar_sayisi, p_baslica, p_tarih, p_notlar, p_istek_anahtari, p_beklenen_puan, p_beklenen_katsayi, p_beklenen_surum)` | `(kayit_id, tekrar)` | `DP001` uyuşmazlık · `22004` beklenen eksik · `42501` oturum/RLS · `23503` kriter |
| `docentlik_faaliyet_duzenle(p_id, p_org, p_surum, p_kriter, p_baslik, p_birim, p_yazar_sayisi, p_baslica, p_tarih, p_notlar, p_beklenen_puan, p_beklenen_katsayi, p_beklenen_surum)` | `(kayit_id, guncellendi)` | `DP001` · `22004` (sürüm ya da beklenen eksik) · `23503` |

- **security invoker**, `search_path = ''`: tablonun RLS'i, sütun yetkileri ve puan tetikleyicisi aynen uygulanır; işlev çağıranın tabloya doğrudan yapabileceğinden fazlasını yapamaz. Definer gerekmedi.
- Sahip parametre değil (`auth.uid()`); kurum RLS'ten geçer.
- `p_beklenen_*` puanı belirlemez, yalnızca karşılaştırma değeridir: tarayıcıdan doğrudan çağrılıp başka değer verilirse olan tek şey reddedilmektir.
- Yalnızca `authenticated` çalıştırır (anon, public, service_role kapalı).
- Karşılaştırma çift duyarlıkta (TS'teki `Object.is(Number(kayit), beklenen)` ile aynı soru) ve kural sürümünü de kapsar.
- Tarayıcının oturum jetonuyla tabloya DOĞRUDAN yazımı RLS'in izin verdiği ölçüde hâlâ mümkün; o yolda da puanı tetikleyici yazar, yalnızca TS çekirdeğiyle karşılaştırma yapılmaz (kalan risk, aşağıda).

## Depo temizliği (ayrı takip işi)

Bugünkü telafi akışları ve kalan boşluk:

| Akış | Bugün | Düşerse |
|---|---|---|
| `belgeKaydet` doğrulama/kayıt başarısız | yüklenen nesne silinir | sahipsiz nesne |
| belge değiştirme | eski nesne, kayıt yeni yolu aldıktan SONRA silinir | sahipsiz eski nesne |
| `faaliyetSil`, `belgeKaldir`, `uakSil` | önce kayıt, sonra nesne | sahipsiz nesne |
| tarayıcı yükledi ama `belgeKaydet`'i hiç çağırmadı (sekme kapandı) | hiçbir şey | sahipsiz nesne — en olası durum |

Sahipsiz nesne kova politikası gereği kimseye okunmaz (izin kayda bağlı), ama kişisel veri taşıyan bir PDF olarak depoda kalır. PR5'te yalnızca silme hatası sabit etiketle (`[docentlik][sahipsiz-nesne]`, JSON) günlüğe yazılıyor; günlük kaybolursa iz de kaybolur.

Önerilen kalıcı çözüm (migration + cron + dar yetkili silme gerektirdiği için PR5 kapsamı dışında):

1. **Kuyruk tablosu** `docentlik_depo_temizlik (kurum, yol, neden, deneme, son_hata, sonraki_deneme, created_at)`; RLS açık, kullanıcıya hiçbir politika yok.
2. **Kuyruğa yazan tetikleyiciler**: faaliyet silinince / `belge_yolu` değişince / ÜAK tablosu silinince eski yol AYNI işlemde kuyruğa girer — kayıt değişikliği ile temizlik isteği birbirinden ayrılamaz.
3. **Cron rotası** (`cronRotasi`, `vercel.json`, `lib/cron-isleri.ts`'te "durursa ne olur"): kuyruktaki yolu silmeden önce hiçbir kaydın onu göstermediğini yeniden doğrular, yalnızca `docentlik-belgeleri` kovasında siler, başarısızlıkta üstel bekleme ile tekrar dener, N denemeden sonra Sistem sağlığı'nda görünür.
4. **Sahipsiz nesne taraması**: kovada 24 saatten eski olup hiçbir `belge_yolu` / `depo_yolu` tarafından gösterilmeyen nesneleri kuyruğa ekler (terk edilmiş yüklemeleri de kapsar).
5. Silme yetkisi service_role ile ama yalnızca bu rotada ve yalnızca bu kovada; rota yolu kuyruktan alır, istekten almaz.

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

- İki ayrı oturumun GERÇEK eşzamanlı düzenleme yarışı: PGlite tek bağlantı. Sınanan, okunan sürümün geçersizleştiği durum; eşzamanlı ikinci UPDATE'in ilkini bekleyip WHERE'i yeniden değerlendirmesi PostgreSQL'in (READ COMMITTED) belgelenmiş davranışı, burada koşturulmadı.
- PostgREST'in RPC'yi tek işlemde çalıştırması ve `DP001` kodunu supabase-js `error.code`'a taşıması: canlıda sınanmadı.


Gerçek tarayıcı, Next çalışma zamanı ve canlı Storage API ile sınanmadı:
`storage.info()`, `download()`, `createSignedUrl` (60 sn ömrün gerçekten
dolması), tarayıcıdan doğrudan yükleme, `runPanelAction` çerez mesajı.
DB davranışı PGlite'ta storage taklidiyle sınandı; işlem kodunun yapısı
kaynak sözleşme testleriyle (`tests/unit/docentlik-sunucu-sozlesmesi.test.ts`).
