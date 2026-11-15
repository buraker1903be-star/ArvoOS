# Doçentlik F6 PR8 — Production öncesi güvenlik tamamlama

PR7'nin (`docs/docentlik-pr7-sonuclari.md`) dört açık riski kapatıldı. Bütün ölçümler
yerel, izole yığında yapıldı: PostgreSQL 17 + GoTrue + PostgREST + Storage API +
`next build && next start`. Veriler sentetiktir. Production ya da paylaşılan Test
Supabase'e bağlanılmadı, canlıya migration uygulanmadı.

Migration: `supabase/migrations/20261115145234_docentlik_belge_guvenligi_ve_gozetim.sql`.

## 1. `belge_yolu` yalnızca sunucu akışından

**Eskiden:** `authenticated` rolünün `update (belge_yolu)` yetkisi vardı. Oturum jetonu
tarayıcıda olduğundan sunucunun `%PDF-` denetimi PostgREST'e doğrudan istek atılarak
atlanabiliyordu (PR7, risk 2).

**Şimdi:**
- `authenticated` rolünden `insert/update (belge_yolu)` kaldırıldı. Doğrudan PostgREST
  UPDATE isteği `42501` alıyor; bu gerçek PostgREST'te ölçüldü.
- Belgeyi bağlamak ve kaldırmak için iki işlev var: `docentlik_belge_bagla` ve `docentlik_belge_kaldir`.
  - İkisi de **security invoker** ve yalnızca `service_role`'e açık; `authenticated` RPC'yi çağıramıyor.
  - Çağıran tek yer `app/panel/docentlik/belge-baglama.ts`. Dosya `server-only` ve bilerek `"use server"` değil; yoksa dışarıdan çağrılabilen bir uç nokta olurdu.
  - Sunucu işlemi önce oturum, modül ve sahiplik denetiminden geçer, sonra bu işlevleri çağırır.
- İşlev kararı kullanıcı adına verir. `request.jwt.claims` işlem süresince kullanıcıya
  ayarlanır, böylece modül kapısı (`auth.uid()` tabanlı) o kullanıcı için değerlendirilir.
- İşlev şunları kendisi denetler:
  - yol biçimi;
  - faaliyetin sahibi, kurumu ve modül erişimi (`FOR UPDATE`);
  - iyimser kilit (`p_eski`): araya giren başka bir değişiklik varsa DB409;
  - Storage nesnesi:
    - var olmalı ve sahibi kullanıcı olmalı;
    - `application/pdf`, 1 bayt ile 20 MB arası;
    - son 1 saatte yüklenmiş olmalı (DB410);
    - temizlik kirasında olmamalı.
- **Ayrıcalık yükseltme denetimi.** Invoker seçildi, çünkü `service_role` zaten RLS'i atlıyor. Definer işlev ek bir yetki kazandırmazdı ama `search_path` ve sahiplik riskini getirirdi.
  - `p_kullanici` istemciden değil, sunucunun doğruladığı oturumdan geliyor.
  - İşlev `authenticated` ya da `anon` tarafından çağrılamıyor (`revoke` + test).
- Doğrulama başarısız olursa önceki bağlantı korunur ve yüklenen yeni nesne silinir.
  Başka kullanıcının ya da kurumun nesnesi bağlanamaz (DB403); bu PGlite'ta ve gerçek Storage'da sınandı.

## 2. Sahipsiz PDF otomatik temizliği

- Cron rotası `/api/cron/docentlik-belge-temizligi` saatte bir çalışır (`35 * * * *`, `vercel.json`).
  `cronRotasi` ile sarılıdır; `lib/cron-isleri.ts`'e "durursa ne olur" tanımı eklendi.
  `cronAraligiDk` artık saatlik ifadeyi de ayrıştırıyor.
- Akış: `docentlik_temizlik_al` → her nesne için `docentlik_temizlik_onayla` → Storage API `remove` → `docentlik_temizlik_sonuc`.
  - **Eşik en az 24 saat.** Veritabanında `greatest` ile zorlanır; istekten parametre okunmaz.
  - **Yalnızca başvurusuz nesneler.** Ne bir faaliyetin ne bir ÜAK satırının başvurduğu nesneler alınır; yalnızca `docentlik-belgeleri` kovası ve katı yol deseni geçerlidir. Başka kovaya dokunulmaz.
  - **Silmeden hemen önce yeniden doğrulama.** `onayla` başvuruyu yeniden denetler.
    Bağlayıcı yalnızca son 1 saatteki nesneyi, temizlik yalnızca 24 saatten eski nesneyi alıyor; bu yüzden ikisi aynı nesne üzerinde hiç kesişmez.
  - **Eşzamanlılık.** `FOR UPDATE SKIP LOCKED` ve 10 dakikalık kira kullanılıyor. Gerçek Next.js'te iki eşzamanlı koşuda her nesne bir kez silindi.
  - **Hata ve yeniden deneme.**
    - Başarısız silmede `deneme+1` yazılır; üstel geri çekilme en fazla 24 saattir.
    - `son_hata` en fazla 200 karakterdir; yol ve kimlik ayıklanır (`guvenliHataMetni`).
    - Storage kapalıyken ölçüldü: koşu başarısız sayılıyor, geri çekilme süresinde nesne yeniden alınmıyor, Storage açılınca siliniyor.
  - **Görünürlük.** Cron kaydı `silinen`, `basarisiz`, `bekleyen_hatali` ve `en_cok_deneme` sayılarını taşır. Günlüğe yalnızca nesne kimliği yazılır, yol yazılmaz; günlük ve cron kaydında yol olmadığı test ediliyor.
- Kullanıcının isteğiyle tetiklenen keyfi bir silme yolu yok. Kira tablosu
  (`private.docentlik_belge_temizligi`) yalnızca `service_role`'e açık ve RLS açık.

## 3. Gözetim adları

- `profiles` RLS'i gevşetilmedi. Yeni işlev `docentlik_kisi_adlari(p_org, uuid[])`:
  - security definer, yalnızca `authenticated`'e açık;
  - modül açık olmalı ve çağıranın `docentlik.tumunu_gor` yetkisi olmalı;
  - yalnızca aynı kurumun üyelerinin adını döndürür;
  - en fazla 200 kimlik kabul eder;
  - yalnızca `(kisi, ad)` döndürür; doktora tarihi, e-posta ve öteki profil alanları dönmez.
- Ad önceliği: `hr_employees` adı, yoksa `profiles.full_name`.
- Olumsuz testler: yetkisiz üye, başka kurum, kapalı modül, başka kurumun kimliği (dönmez), 201 kimlik ve dönen sütun kümesi.
- Tarayıcıda (1102 kişi) sayfa 1'de ve son sayfada "Üye xxxxxxxx" yedeği yok.

## 4. Büyük kurum performansı

- `docentlik_gozetim_listesi(p_org, p_sinir ≤ 100, p_atla)` listeyi sunucuda sayfalar.
  - Sıralama kararlı: önce faaliyet sayısı (çoktan aza), sonra kişi kimliği.
  - Doktora tarihinin kendisi dönmez, yalnızca "girildi mi".
- Şerit sayıları ayrı bir özet işlevinden gelir (`docentlik_gozetim_ozeti`); sayfa satırlarından toplanmaz.
- Kurum sayfası bir sunucu bileşeni: 50 satır ve `?sayfa=` bağlantıları, istemci bileşeni yok.
  Aralık dışı sayfa çökmez, ilk sayfaya yönlendirir.
- 1100 profil üzerinde sınandı (PGlite ve PostgREST, tavan 300):
  - sayfa sınırları doğru;
  - toplam doğru;
  - sayfalar kesişmiyor;
  - sıra kararlı.
- Tarayıcıda 1102 kişiyle sınandı:
  - sayfa 1: 50 satır, `1–50 / 1102`;
  - sayfa 2: `51–100`;
  - son sayfa (23): 2 satır.

## Kabul matrisi

G = gerçek yığın (PG17 + GoTrue + PostgREST + Storage + `next start`, Chromium). P = PGlite. S = sentetik bileşen düzeneği.

| Madde | Sonuç | Tür | Kanıt |
|---|---|---|---|
| Doğrudan PostgREST `belge_yolu` UPDATE reddi (42501), önceki bağlantı korunur | PASS | G | `docentlik-yigin` 5b |
| Bağlama RPC'si `authenticated`/`anon`'a kapalı | PASS | G+P | `docentlik-yigin`, `docentlik-pr8` |
| Başka kullanıcı/kurum nesnesi bağlanamaz (DB403), yarış (DB409), PDF olmayan (DB415), eski nesne (DB410) | PASS | G+P | `docentlik-yigin`, `docentlik-pr8` |
| Arayüzden PDF ekle/değiştir/kaldır, sahte PDF reddi ve önceki bağlantının korunması | PASS | G | tarayıcı 2.1–2.6 |
| Temizlik: 24 saat eşiği, kayıtlı/yeni/başka kova nesnesine dokunmama | PASS | G+P | `docentlik-temizlik`, `docentlik-pr8` |
| Temizlik: eşzamanlı iki koşu, her nesne bir kez | PASS | G | `docentlik-temizlik` |
| Temizlik: Storage kapalı → başarısız, geri çekilme, sonra yeniden deneme | PASS | G | `docentlik-temizlik` |
| Temizlik: günlükte ve cron kaydında yol yok; yetkisiz istek 401 | PASS | G | `docentlik-temizlik` |
| Ad RPC'si: yetki, modül ve kurum kapıları; yalnızca ad sütunu | PASS | G+P | `docentlik-yigin` 5c, `docentlik-pr8` |
| Gözetim sayfalama: 1100+ kişide sınırlar, toplam, kararlı sıra | PASS | G+P | `docentlik-yigin` 5c, `docentlik-pr8`, tarayıcı 3.1–3.2d |
| Kişi sayfası puan toplamı veritabanıyla aynı | PASS | G | tarayıcı 3.4 |
| Tarayıcı kabulü (39 madde) | PASS | G | `tarayici-kabul.mjs` 39/39 |
| Yerleşim ve PanelModal düzenekleri | PASS | S | yerleşim: sorun yok; PanelModal 26/26 |
| tsc, lint, 8 `check:*` denetimi, birim 1857, DB 788, build | PASS | — | yerel; CI ayrıca |
| Barındırılan Supabase'e özgü ayarlar (Kong, S3 arka ucu, Vercel Cron çağrısı) | UNVERIFIED | — | yerelde ölçülemez |
| Migration'ın canlıya uygulanması | UNVERIFIED | — | bilerek uygulanmadı |

## Açık noktalar

- Migration canlıya uygulanmadan önce `supabase/schema/canli-sema.sql` ve `katalog.json`
  yenilenmeli. `check:schema` yeni işlevleri şimdilik "katalog gecikmesi" uyarısıyla geçiriyor.
- Vercel Cron, `CRON_SECRET` ortam değişkenini gerektirir. Bu değişken mevcut cron işleri için zaten tanımlı olmalı.
