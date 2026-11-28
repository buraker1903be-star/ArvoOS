# Çok para birimi: geçiş, dağıtım penceresi ve geri dönüş

Dört migration, iki uygulama sürümü ve aralarındaki aralık. Bu
dosyadaki her satır `tests/db/` altında ölçülüyor; ölçülmeyen bir
cümle buraya yazılmıyor.

Ölçüm dosyaları:

| Dosya | Ne sabitliyor |
| --- | --- |
| `tests/db/para-birimi-gecis-sirasi.test.mjs` | Migration bağımlılıkları ve uygulama sırası |
| `tests/db/fiyat-surum-araligi.test.mjs` | İki uygulama sürümü × iki şema |
| `tests/db/fiyat-eski-uygulama-uyumu.test.mjs` | Canlıdaki sürümün (main @ `5ef77c8e`) ürettiği SQL |
| `tests/db/para-birimi-geri-donus.test.mjs` | Hazırlanmış geri dönüş betiği |
| `tests/db/fiyat-para-birimi.test.mjs` | Bileşik anahtar ve kapsamlı yayım |
| `tests/db/odeme-para-birimi.test.mjs` | Ödeme onayında para birimi denetimi |

## 1. Migration'lar: gerçek bağımlılıklar ve uygulama sırası

Sıra: **114027 → 120350 → 122145 → 122230.**

| # | Dosya | Ne yapıyor | Gerçek bağımlılığı | Eksikse ne olur |
| --- | --- | --- | --- | --- |
| 1 | `20261128114027_fiyat_listesi_para_birimi` | `platform_fiyat_listesi.para_birimi` + ISO kısıtı; fiyat geçmişine birim; geçmiş tetikleyicisi | Yok (yalnızca canlı şema) | — |
| 2 | `20261128120350_lisans_para_birimi_ve_usd_anahtari` | Lisans satırlarına `para_birimi`; `platform_urun_para_ayarlari` (RLS + kurucu politikaları) | Yok (yalnızca canlı şema) | — |
| 3 | `20261128122145_fiyat_para_birimi_anahtari` | Birincil anahtar → `(kod, para_birimi)`; kapsam imzası `kod:birim:tutar`; `fiyat_kapsam_cozumle` 3 sütun; `fiyat_kapsam_yayimla` birim eşleşmesi | **#1** (sütun), ayrıca canlıda uygulanmış `20261127182525` + `20261127191104` | **Uygulama anında** hata: `para_birimi` sütunu yok (ölçüm: madde 1) |
| 4 | `20261128122230_odeme_para_birimi_dogrulamasi` | `private.para_birimi_coz`; iki dönem açma işlevi + havale onayında birim denetimi | **#2** (lisans sütunları) | Ön koşul bloğu düşürüyor: *"Önce 20261128120350 uygulanmalı"* |

İki çift var ve çiftler **birbirinden bağımsız**: fiyat tarafı (1→3) hiç
uygulanmamışken ödeme tarafı (2→4) çalışıyor, tersi de doğru. Zorunlu
olan, her çiftin **kendi içindeki** sıra.

**#4'e ön koşul bloğu neden eklendi.** plpgsql gövdesi sütunları
çalışma anında denetliyor (AGENTS.md). Ön koşul olmasaydı #2 olmadan
uygulanan #4 **hata vermeden** geçer, SQL Editor "Success" der ve iş
ilk havale onayında düşerdi — sebebi yalnızca sunucu günlüğünde.
29.10.2026'daki proforma migration'ı dört gün uygulanmadan kaldığı için
bu sınıf hata bu depoda zaten ölçülü.

## 2. Dağıtım penceresi: iki sürüm × iki şema

Uygulamanın yeni sürümü Vercel'e çıkıyor, migration'lar SQL Editor'den
elle uygulanıyor; arada bir **aralık** var. "Eklemeli şema" = #1 ve #2
uygulandı, #3 henüz uygulanmadı.

| Yol | Eklemeli şema · **yeni** sürüm | Eklemeli şema · **eski** sürüm | Bileşik şema · **yeni** sürüm | Bileşik şema · **eski** sürüm |
| --- | --- | --- | --- | --- |
| Fiyat okuma (konsol) | ✅ | ✅ tek satır görüyor | ✅ | ⚠️ `maybeSingle` iki satırda hata; USD tutarını TL sanıyor |
| Taslak kaydetme | ✅ güncelle-yoksa-ekle | ✅ `on conflict (kod)` | ✅ | ❌ `no unique or exclusion constraint` |
| Taslağı geri alma | ✅ birim süzgeçli | ✅ tek satır | ✅ | ⚠️ iki birimi birden geri alıyor |
| Yayından kaldırma | ✅ | ✅ | ✅ | ⚠️ iki birimi birden düşürüyor |
| Yayım (kapsam imzalı) | ✅ imza `kod:tutar` | ✅ imzasız çağrı | ✅ imza `kod:birim:tutar` | ✅ imzasız çağrı |
| Site fiyat okuma | ✅ TRY süzgeçli | ✅ | ✅ | ⚠️ USD satırı TL tablosunu eziyor |
| **USD fiyatı girme** | ❌ anahtar tek sütunlu (anlaşılır mesaj) | ❌ | ✅ | ❌ |
| Havale onayı (birim denetimi) | ✅ #4 uygulandıysa | ✅ | ✅ | ✅ |

İki şeyi bu tablo değiştirdi:

1. **`upsert` kaldırıldı.** Çatışma hedefi o anki birincil anahtarla
   birebir eşleşmek zorunda: `on conflict (kod)` bileşik şemada,
   `on conflict (kod, para_birimi)` eklemeli şemada düşüyor — yani
   upsert uygulamayı tek bir şema sürümüne çiviliyor. Yeni sürüm
   **önce güncelle, yoksa ekle** yapıyor ve iki şemada da çalışıyor.
2. **Kapsam imzası veritabanından okunuyor.** Biçim iki yerde
   yaşarken (uygulama + yayım işlevi) aralıkta ayrışıyordu: işlev
   `kod:tutar`, uygulama `kod:birim:tutar` üretiyor, imza hiç tutmuyor
   ve **yayım düğmesi hiç çalışmıyordu**. Artık imza
   `platform_fiyat_kapsam_imzasi()` çağrısından geliyor; önizlemeye
   giden, geri gelen ve RPC'ye gönderilen değer aynı metin. Okunamazsa
   düğme kapalı kalıyor — yanlış kapsamla yayımlamaktansa durmak doğru.

**Aralığın bilinen sınırı:** #3 uygulanmadan **USD fiyatı girilemiyor**
(aynı kodun ikinci satırı tek sütunlu anahtarı çiğniyor). Kabul
edilebilir, çünkü USD satışı yayımlanmış bir USD fiyatı istiyor
(`lib/satis-para-birimi.ts`), yani o aralıkta USD zaten kapalı.
Kurucuya ham `duplicate key` değil nedeni yazılıyor: *"USD fiyatı
henüz açılamıyor: fiyat listesinin para birimi geçişi tamamlanmadı."*

## 3. Geri dönüş

### Geri alınan iddia

28.11.2026'da bir ara **"USD satırları yayından kaldırılırsa eski
sürüme dönmek güvenli"** yazılmıştı. **Yanlıştı, geri alındı.**
`on conflict (kod)` satırların İÇERİĞİNE değil **anahtara** bakıyor:
veritabanında hiç USD satırı olmasa bile düşüyor
(`fiyat-surum-araligi` → *"tek satır varken bile upsert düşüyor"*).
Yayından kaldırmak yalnızca **site okumasını** düzeltiyor, yazma
yolunu düzeltmiyor.

Ayrıca **canlı fiyatları topluca yayından kaldırmak bir geri dönüş
adımı değil** ve plana girmiyor: yayından kalkan basamak ücretler
sayfasında "Teklif"e düşer, kurulumun "liste fiyatını uygula" tutarı
boşalır. Müşteriye görünen bir değişiklik, sessiz bir tedbir değil.

### Varsayılan: ileri yönlü düzeltme

#3 uygulandıktan sonra **Vercel'den bir önceki dağıtıma dönmek bir geri
dönüş değildir** — eski sürüm o şemada fiyat taslağı kaydedemez. Bu
yüzden varsayılan yol ileri yönlü düzeltme:

1. USD satışını kapat. Anahtar veritabanında
   (`platform_urun_para_ayarlari.usd_satis_acik`), dağıtım beklemiyor;
   kart ve otomatik yenileme zaten kapalı. Kapanınca yeni satış TRY'ye
   döner, mevcut abonelikler kendi biriminde kalır.
2. Gerekiyorsa USD **taslağını** geri al (yayındaki satırlara
   dokunmadan): `taslagiGeriAl`, birim süzgeçli.
3. Hatayı yeni bir migration ile düzelt. Mevcut migration düzenlenmez
   (AGENTS.md).

### Son çare: hazırlanmış şema geri dönüş betiği

`supabase/geri-donus/20261128122145-geri-al.sql` — **numaralı migration
değil**, elle çalıştırılır (numaralı olsaydı her dağıtımda geçişi geri
alırdı). Anahtarı `(kod)`'a döndürüyor ve imza/çözümleme/yayım
işlevlerini `20261127182525` + `20261127191104` hâline alıyor; ondan
sonra **eski sürüm yeniden çalışıyor** (ölçüldü).

- `para_birimi` **sütunu kalıyor**: eski sürüm sütunu yazmıyor,
  varsayılan TRY devreye giriyor; düşürmek fiyat geçmişindeki birimi de
  götürürdü.
- Lisans sütunları ve `platform_urun_para_ayarlari` kalıyor: ödeme
  tarafı fiyat anahtarına bağlı değil.
- Aynı kodun iki birimde satırı varsa betik **hiçbir şey yapmadan
  düşüyor** ve hangi satırın kalacağını kurucuya bırakıyor. Veri
  silmiyor.

### Uygulanmamış migration denetimi

`npm run migration:izleri` çalıştırıldı; dördü de
`lib/migration-izleri.json`'da. Canlıda eksik kalan bir migration
Sistem sağlığı → Veritabanı ekranında ve konsolun Sorunlar kuyruğunda
görünüyor.

**Denetimin bu geçişteki körlüğü yazılı olsun:** izler yalnızca
YARATILAN nesneye bakıyor (AGENTS.md). #1, #2 ve #4 için bu yeterli
(yeni sütun, yeni tablo, yeni işlev `private.para_birimi_coz`). **#3
için değil:** izleri üç işlev adı ve üçü de zaten var — değişen şey
gövdeleri ve birincil anahtar, ikisi de izlerden görünmüyor. Yani
"#1, #2, #4 uygulandı ama #3 uygulanmadı" hâli ekranda **sorun olarak
çıkmaz**. Uygulandığı şöyle doğrulanır (SQL Editor, tek satır):

```sql
select string_agg(a.attname, ',' order by k.ord)
  from pg_constraint c
  join lateral unnest(c.conkey) with ordinality as k(attnum, ord) on true
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
 where c.conrelid = 'public.platform_fiyat_listesi'::regclass and c.contype = 'p';
```

`kod,para_birimi` → uygulandı. `kod` → uygulanmadı, aralıktayız.
