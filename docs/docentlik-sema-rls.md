# Doçentlik şeması, RLS ve belge kovası (F6 PR3)

**Bağımlılık:** PR #317 (özel modül izin listesi, `private.modul_kurumda_acik`)
ve PR #318 (puan çekirdeği, `lib/docentlik`). Bu dal ikisini içeriyor; ikisi
main'e girmeden bu PR birleştirilmemeli.

**Migration'lar**
- `20261114200939_docentlik_sema_rls.sql`: tablolar, kısıtlar, puan
  tetikleyicisi, RLS ve gözetim işlevleri.
- `20261114201157_docentlik_belge_kovasi.sql`: `docentlik-belgeleri` kovası
  ve kova politikaları.

Hiçbiri canlıya uygulanmadı.

## Kararlar

| # | Karar | Nerede |
|---|---|---|
| 1 | Modül kodu `docentlik`, özel modül | `arvo_modules` + `ozel_moduller` |
| 2 | Yalnızca AkademikMerkez. Kurum slug ile **birebir** (`akademikmerkez`) bulunur. Bulunamazsa izin listesi boş kalır ve modül hiçbir kurumda açılamaz. | Migration'ın `do` bloğu; test: `docentlik-kurum-cozumu` |
| 3 | Modül migration'la hiçbir kurumda **açılmaz**; açmayı kurucu yapar | `organization_modules`'a satır yazılmıyor |
| 4 | Üye kendi faaliyetini ve profilini yönetir | Faaliyet ve profil politikaları |
| 5 | Bütün faaliyetleri `docentlik.tumunu_gor` ve Kurum Sahibi görür (yalnızca okuma) | `docentlik_faaliyetleri_okur` |
| 6 | Kriter ve hedef: `docentlik.kriter_yonet` | Kriter ve hedef politikaları |
| 7 | ÜAK tabloları ve PDF'leri: `docentlik.uak_yonet` | ÜAK politikaları + kova |
| 8 | Gözetim doktora tarihini görmez. Profil tablosu yalnızca sahibine açık; gözetim tarih yerine "girildi mi" bilgisini ve faaliyet başına dönemi alır. | `docentlik_profil_ozetleri`, `docentlik_faaliyet_donemleri` |
| 9 | Ayrı, özel kova: `docentlik-belgeleri`, yalnızca PDF, 20 MB | 20261114201157 |
| 10 | Belge yolu kurum, sahip ve faaliyet kimliğine bağlı | `belge_yolu` kısıtı + kova izni |
| 11 | `computed_points`, `organization_id` ve `owner_id` istemciden serbestçe yazılamaz | Sütun yetkisi, tetikleyici, RLS |
| 12 | Puan `arvolab-2026-10-27` ile birebir; yeni kural yok | `docentlik_faaliyet_puani` ↔ `lib/docentlik/puan.ts` |

### Yetki anahtarlarının değerlendirilmesi

`private.docentlik_yetkisi(kurum, anahtar)` şu sırayla karar verir:

1. Üyelik etkin mi? Değilse hayır.
2. Kurum Sahibi ise evet.
3. Kişi kuralı.
4. Rol kuralı.
5. Hiç kural yoksa hayır.

Bu üç anahtarın varsayılanı **boştur**; yalnızca Kurum Sahibi yetkilidir. Bu
yüzden `lib/yetkiler.ts`teki varsayılan listesinin SQL'e kopyalanmasına gerek
kalmadı.

İşlev **yalnızca bu üç anahtarla** çalışır. Başka bir modülün yeteneği,
yazımı benzeyen ya da büyük harfli bir anahtar ve bilinmeyen bir
`docentlik.*` anahtarı, Kurum Sahibi için bile HAYIR döner. Yeni bir
Doçentlik yeteneği eklemek işlevdeki listeyi değiştirmeyi gerektirir.

Anahtarlar Yetkilendirme ekranına bu PR'da **eklenmedi**. Ekran grupları
modüle göre süzmüyor; Doçentlik grubu her kurumda görünürdü. Ekran PR'ında
gelecek.

## Taslak matrisle karşılaştırma

| Konu | Taslak (entegrasyon raporu) | Son tasarım | Gerekçe |
|---|---|---|---|
| NULL kurum ("genel liste") | Kriter/hedefte NULL = Arvo genel listesi, iç ekip yazar | **Yok.** Her tabloda `organization_id NOT NULL` | ArvoOS'ta bireysel abone yok. NULL kurum en kolay sızma yolu (kabul ölçütü). |
| Arvo iç ekip (kurucu) | Faaliyet ve profili salt okur | **Erişimi yok** | Veri en aza indirme; kurucu yalnızca modülü açar/kapatır. |
| Gözetim ↔ profil | Karar bekliyordu (K7) | Tablo kapalı; tarihsiz özet işlevleri | Karar 8 |
| Yetki modeli | `docentlik.kendi/gozetim/yonetim` | `tumunu_gor`, `kriter_yonet`, `uak_yonet` (kendi verisi için yetki gerekmez, üyelik yeter) | Kurum sahibinin kararı |
| Modül kapısı | Her politikada | Her politikada **ve** her tabloda kısıtlayıcı (restrictive) politika | İzin veren politikalar VEYA ile birleşir; kapıyı unutan tek bir politika bütün kapıyı açardı (testte kanıtlandı). |
| Kova yolu | `<kurum>/<sahip>/faaliyet/<kayıt>/…` | `<kurum>/faaliyet/<sahip>/<faaliyet>/<dosya>.pdf`, `<kurum>/uak/<klasör>/<dosya>.pdf` | Tür ikinci parçada; faaliyet yolu var olan bir satıra birebir bağlı. |
| K1 (istemci puanı) | Sunucu hesaplasın | Veritabanı hesaplıyor (tetikleyici); istemcinin sütun yetkisi yok | Sunucu yolu atlatılsa da (API'den doğrudan istek) puan doğru kalır. |
| K2 (kurum sahipliği) | Satıra kurum yaz, tetikleyici korusun | Kurum + sahip değişmez (tetikleyici, service_role dahil). Faaliyet ↔ kriter bileşik FK ile aynı kurumda. | — |
| K5 (ÜAK onayı) | Sunucu fonksiyonu | `authenticated` durum/öneri/onay sütunlarına dokunamaz; service_role yazar | Öneriyi doğrulayan sunucu yolu ekran PR'ında. |

## Kova: geniş politikalara karşı yalıtım (güvenlik incelemesi, 14.11.2026)

`storage.objects` bütün kovaların tek tablosu ve izin veren politikalar VEYA
ile birleşiyor. Bu depodaki öteki kova politikalarının hepsi kendi kovasıyla
sınırlı (tarandı; tek UPDATE politikası `organization-assets`'te). Ama canlıda
panelden eklenmiş ya da ileride yazılacak kova süzgeçsiz bir politika bu
kovayı açabilirdi. Örneğin Supabase'in "kendi nesnesini günceller" şablonu
(`owner = auth.uid()`) belgenin taşınmasına ve üzerine yazılmasına izin
verirdi.

İlk sürümdeki tek kısıtlayıcı politika yalnızca modül kapısını soruyordu.
Modülü açık bir kullanıcı için bu koşul doğru olduğundan, böyle bir politika
taşımayı açardı.

Artık her işlem için ayrı bir kısıtlayıcı politika var:

| İşlem | Kısıtlayıcı koşul (bu kovada) |
|---|---|
| SELECT | Modül kapısı + `docentlik_belge_izni(…, 'select')` |
| INSERT | Modül kapısı + `docentlik_belge_izni(…, 'insert')` |
| UPDATE | **Hiç kimse**: using ve with check. Yeniden adlandırma, başka klasöre/faaliyete/kullanıcıya/kuruma taşıma, kovadan dışarı ya da dışarıdan içeri taşıma, upsert'in `ON CONFLICT DO UPDATE` dalı kapalı. |
| DELETE | Modül kapısı + `docentlik_belge_izni(…, 'delete')` |
| anon (hepsi) | Bu kovada hiçbir şey; işlev çağırmaz |

`CASE` kullanılmasının nedeni, öteki kovalardaki satırlarda Doçentlik
yardımcılarının hiç çağrılmaması. Testte her işlem için herkese açık izin
veren politikalar ve "sahibi günceller" şablonu kuruluyor. Bunların öteki
kovada gerçekten etkili olduğu ve o kovanın davranışının değişmediği
gösteriliyor; Doçentlik kovasındaki izin matrisi ise aynı kalıyor.

## Kalan bilinçli farklar (ArvoLab'a göre)

- **Girdisi değişmeyen düzenleme puana dokunmaz.** Başlık ya da belge
  değişikliği bu kapsamda. ArvoLab'da başlık düzeltmesi de puanı
  `korunanBirimPuan` üzerinden yeniden hesaplıyordu ve son basamakta 1e-6
  kayma üretebiliyordu.
- **ArvoLab'daki abonelik kapısının karşılığı modül kapısı.** ArvoOS'ta
  abonelik yok. Kendi verisini silme de modül kapalıyken kapalı.

## Testler (`tests/db/`)

| Dosya | Kapsam |
|---|---|
| `docentlik-rls-matrisi` | 5 tablo × 8 aktör × 4 işlem (160 hücre) |
| `docentlik-guvenlik` | Yetki anahtarı kapsamı (başka modül, benzer yazım, başka kurum, owner istisnası yalnızca üç anahtarda), kapalı modül, izin listesinden çıkarma, kişide gizli modül, sahte gevşek politika, iptal edilmiş üye, kişi > rol kuralı, boş varsayılan, NULL ve çapraz kurum, K1/K2/K5, belge yolu, gözetim için en az veri, fonksiyon yetkileri, politika sözleşmesi |
| `docentlik-puan-tetikleyicisi` | Tetikleyici ↔ `lib/docentlik` çekirdeği: ~5900 ekleme+düzenleme senaryosu, `Object.is` ile birebir; JS `Math.round` sınırları |
| `docentlik-belge-kovasi` | 2 nesne türü × 7 aktör × 4 işlem, 15 uydurma yol, modül kapısı, iptal edilmiş üye, sahte politika, öteki kovalarda gerileme yok; geniş politikalar altında okuma/yükleme/silme matrisi, 5 taşıma hedefi + kova dışı/içi taşıma + yerinde değiştirme, upsert/üzerine yazma |
| `docentlik-kurum-cozumu` | Slug birebir; kurum yoksa fail-closed |

**Mutasyon denetimi:** testlerin kör olmadığı, migration'da tek tek bozulan
13 kuralla sınandı ve 13'ü de yakalandı:

- herkese açık okuma;
- açık varsayılan;
- Kurum Sahibi istisnasının kalkması;
- Postgres `round`;
- korunan birim puanın kalkması;
- kurum değişmezliğinin kalkması;
- kısıtlayıcı kapının kalkması (tablo ve kova);
- profilin gözetime açılması;
- ÜAK korumasının kalkması;
- kovada faaliyet varlığı denetiminin kalkması;
- gözetimin yükleyebilmesi;
- slug'ın `like` ile aranması.

İnceleme düzeltmesinden sonra 8 mutasyon daha denendi ve 8'i de yakalandı:

- anahtar süzgecinin kalkması;
- listeye başka modülün anahtarının girmesi;
- kısıtlayıcı UPDATE kapısının kalkması;
- UPDATE'in with check'inin kalkması;
- okuma, yükleme ve silme kapılarının yalnızca modüle bakması;
- anon kapısının kalkması.

## Doğrulanamayanlar (canlı ortam gerekir)

- **Depo API'si:** düzenekte depo şeması taklit. İmzalı URL üretiminin okuma
  politikasına bağlı olması ve MIME/boyut sınırının API'de uygulanması
  canlıda sınanmalı.
- **Sütun düzeyinde yetkiler:** `grant insert (…)`, `grant update (…)`.
  Düzenek migration'ın grant satırlarını tekrarlıyor, ama AGENTS.md'nin
  uyardığı gibi sütun yetkisi asıl canlıda sınanır.
