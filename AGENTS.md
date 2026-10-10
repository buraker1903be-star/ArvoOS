<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
# ArvoOS

Çok kiracılı kurumsal panel + Arvo pazarlama sitesi. Next.js 16 · React 19 ·
Supabase. Genel tanıtım ve komutlar için `README.md`.

## Dil

Arayüz metinleri, hata mesajları ve kod yorumları **Türkçe**. Yorumlar "ne
yaptığını" değil **neden öyle olduğunu** anlatır; bir hata düzeltiliyorsa
eski davranış da yazılır ("Eskiden … oluyordu"). Yeni kod bu üsluba uyar.

## Değişmezler

Bunlar geçmişte gerçek hatalara yol açtı; birim testleri bunları sabitliyor
(`npm run test:unit`).

- **Yetki üç yerdedir, üçü de gerekir.** RLS + sunucu (`assertModuleAccess` /
  `assertModuleKeyAccess` / `assertYetki`) + menüde gizleme. Yeni bir server
  action yazarken yetki kontrolünü çağırmayı unutmayın: yalnızca sayfada
  kontrol etmek işlemi açıkta bırakır.
- **Yetki kararı rol listesiyle verilmez.** `["owner","admin"].includes(role)`
  yazmak kararı koda gömer ve kiracı onu değiştiremez; seksen kadar yerde
  böyleydi. Karar `lib/yetkiler.ts`teki yetenek anahtarlarında: sayfada
  `izin("crm.teklif.sil")`, sunucu işleminde `assertYetki(yetkiler, "…")`.
  Kurum bunları Ayarlar → Yetkilendirme'de rol ve kişi düzeyinde değiştirir.
  Birim testi (`yetkiler.test.ts`) eski kalıba dönüşü yakalar.
- **RLS de uyguluyorsa yetki gevşetilemez.** Katalogdaki `rlsBagli` işareti
  "yalnızca kısıtlanabilir" demek. Silme politikası owner/admin'e açık olan
  bir işlemi panelden manager'a açmak düğmeyi gösterir, RLS satırı sessizce
  eler, kullanıcı "sildim ama silinmedi" ile kalır — bu bir kez yaşandı.
  RLS'i de gevşetmek gerekiyorsa politikayı migration'la değiştirin.
- **Kurum Sahibi (`owner`) hiçbir zaman kısıtlanamaz.** Kendi panelinden
  kilitlenip dışarıda kalmasını önlemek için.
- **Para kuruş cinsinden tamsayıdır.** Kullanıcı girdisi için
  `parseTurkishAmount` ("1.500" bin ayırıcılıdır, 1,5 değil). Bölüştürmede
  artan kuruş baştaki taksitlere eklenir; toplam her zaman birebir tutar.
- **Tarih Türkiye saatiyle.** Sunucu UTC'de çalışıyor; gün anahtarı için
  `todayInIstanbul`, karşılaştırma için `istanbulMidnight`.
  `new Date().toISOString().slice(0,10)` gece 00:00–03:00 arasında bir önceki
  günü verir.
- **RLS "kim yazabilir"i söyler, "neyi"yi söylemez.** Oturum jetonu
  tarayıcıda; bir tabloya UPDATE yetkisi olan kullanıcı her sütunu API'den
  doğrudan yazabilir. Durum ve kanıt sütunları tetikleyiciyle korunur:
  sözleşmenin `status = 'signed'` ve `signed_*` alanları yalnızca imza
  fonksiyonlarıyla yazılır, imzalı sözleşme geri alınamaz
  (`private.arvo_guard_contract_signature`). Bu koruma çağıranın rolüne
  (`current_user`) baktığı için security **invoker**'dır.
- **`service_role` istemcisi RLS'i atlar.** `createAdminClient` kullanan her
  yol yetkiyi kendisi doğrulamalıdır.
- **Sırlar `NEXT_PUBLIC_` ile başlamaz.** Eksik ortam değişkeni uygulamayı
  düşürmez, ilgili özelliği kapalı gösterir ve nedenini kullanıcıya yazar.
- **WhatsApp'a doğrudan çağrı yapılmaz.** Dört ürün de kapıdan geçer
  (`app/api/bridge/whatsapp` → `lib/whatsapp-gateway.ts`): tek yerde erişim
  anahtarı, tek yerde mesaj kaydı, tek yerde hata haritası. Gönderen kararı
  (kurumun kendi numarası mı Arvo'nunki mi) kapıdadır; ürün seçmez. Meta'nın
  kuralı gereği iş tarafının başlattığı mesaj onaylı şablonla gider, serbest
  metin yalnızca müşterinin son mesajından sonraki 24 saat içinde.
- **Silme engeli, kaskat yüzeyi kadar geniş olmalı.** Bir kaydı silmeden
  önce "bağlı kayıt var mı" diye bakan kontrol, veritabanının o silmeyle
  BİRLİKTE götürdüğü her şeyi kapsamalı. Sözleşmede engel yalnızca işe ve
  ödeme planına bakıyordu; oysa kaskat maliyet kalemlerini, ek sözleşmeyi
  ve müşteri yazışmasını da siliyordu (10.10.2026). Yeni bir yabancı
  anahtar eklerken silme engelini de gözden geçirin;
  `tests/db/sozlesme-silme-bagimliliklari.test.mjs` kaskatın hâlâ var
  olduğunu sabitliyor.
- **Engelin sorgusu hata yutmaz.** `if (bagli?.length)` kalıbında sorgu
  düştüğünde `data` undefined kalıyor ve koşul yanlış çıkıyor: engel AÇIK
  GEÇİYOR. Bir engelin okunamaması "engel yok" demek değil; hatayı okuyup
  fırlatın. Teklif ve sözleşme silmede iki kez böyleydi.
- **Müşteri yazışması olan sözleşme silinmez.** Kurum sahibinin kararı
  (10.10.2026): yazışma kurumun müşteriyle arasındaki kayıt, bir sözleşme
  kaydından daha kalıcı. Panelde mesaj silme olmadığı için engel bir
  çıkmaz değil, yönlendirme: yanlış açılan sözleşme silinmek yerine
  "İptal" durumuna alınıyor.
- **Giden postanın HTML'i varsa düz metni de olmalı.** Mesaj
  `multipart/alternative` ile iki biçimde birden gidiyor
  (`lib/posta-gonderim.ts`): HTML'i göstermeyen kutuda (kurumsal Outlook
  kuralları, otomatik işleyen sistemler) yalnızca HTML göndermek boş
  mesaj demek. HTML'e giren her metin `htmlKacis`'tan geçer — gövdeyi
  personel yazıyor ve kaçırılmayan bir "<" cümlenin kalanını yutuyor.
  İki biçimin sırası da aynı olmalı: yanıt → imza → alıntı.
- **Sunucunun indireceği adres kullanıcıdan geliyorsa genel olmalı.**
  İmza logosu kurum ayarlarından gelen bir adresten iniyor ve postaya
  gömülüyor; `logoAdresiUygunMu` yalnızca https ve genel alan adlarına
  izin veriyor (IP, localhost, iç alan adları ve yönlendirmeler kapalı).
  Yoksa kurumu yöneten biri sunucunun ağındaki bir şeyi kendi postasına
  çektirebilir.
- **Sayfa, kullandığı sınıfın CSS'ini kendi import etmeli.** Next rotanın
  CSS'ini o rotanın modül ağacından topluyor: sayfa (ya da içindeki bir
  bileşen/layout) dosyayı import etmiyorsa o rotada stil YOK — hata da
  yok. Posta konuşma ekranı `talep-*` düzen sınıflarını kullanıp
  `kayit-detay.css`'i import etmiyordu: listeden tıklayınca doğru
  görünüyor (önceki sayfanın CSS'i yüklü), sayfa YENİLENİNCE düzen
  dağılıyordu (10.10.2026). Bir bileşen her yerde kullanılıyorsa CSS'ini
  kendisi import etsin. `npm run check:css` bunu CI'da denetliyor.
- **Müşteriye giden sayfalarda `ad-` öneki yasak.** Teklif ve sözleşme
  belgelerinin sınıfları `doc-` ile başlar. `ad-root`, `ad-sheet` gibi adlar
  reklam engelleyicilerin kozmetik filtresine takılıyor ve belge, hiçbir hata
  vermeden bomboş görünüyordu — imzaya gönderilen sözleşme dahil.
- **Pazarlama sayfaları yalnızca `arvo-os.com`'da.** Host kararları
  `lib/site/host-rules.ts` içinde saf fonksiyonlardadır; proxy ve `robots.ts`
  oradan okur, kopya mantık yazılmaz.

## Sunucu işlemleri

Panel işlemleri `runPanelAction` ile sarılır (`lib/panel-action.ts`): üretimde
Next hata mesajlarını gizlediği için Türkçe açıklamalar çereze yazılıp bildirim
olarak gösterilir. Mesajlar URL'ye yazılmaz — dışarıdan sahte mesaj
enjekte edilemesin diye.

## Veritabanı

Migration'lar `supabase/migrations/` altında. Yeni dosyayı **`npm run db:new -- <ad>`**
ile açın; sürümü son migration'ın ardına kendisi yerleştirir (elle yazılan
damgalarda "…250000" gibi geçersiz saatler oluştu). `npm run check:migrations`
CI'da çalışır. Mevcut bir migration düzenlenmez; yenisi eklenir. Yeni tablo eklerken RLS'i açıp
politikalarını aynı migration'da yazın.

**ArvoARC 19 Eylül 2026'dan beri ayrı Supabase projesinde** (`obaskcdxaaezjglayash`;
ArvoOS `oahshpkgdzrraqdzjqau`'da kaldı). Bu projedeki `arc_*` tabloları geçişten
kalma salt okunur yedek: onlara migration yazmayın, kod eklemeyin. ArvoARC'ın kurum,
lisans, modül ve personel kopyasını `lib/arc-bridge.ts` yazar (Platform sayfası
köprünün durumunu gösterir). Ayrıntı: ArvoARC/AYRILMA.md.

Bu deponun migration'ları şemanın tamamını kurmaz (`crm_contracts`, `crm_proposals`, `hr_employees`,
`organization_memberships` gibi çekirdek tabloların `CREATE`'i hiçbir
migration'da yok). Canlı şemanın tam anlık görüntüsü
`supabase/schema/canli-sema.sql`: ArvoARC'taki `scripts/sema-disa-aktar.sql`
bu projenin SQL Editor'ünde çalıştırılır, sonuç **"Download CSV"** ile
indirilir (hücreyi elle kopyalamayın: tırnak kaçışları bozuluyor) ve iki
betikle dosyaya çevrilir — ikisi de hedef depoyu ikinci argümandan alır:

```
node ../ArvoARC/scripts/sema-kaydet.mjs ~/Downloads/<indirilen>.csv .
node ../ArvoARC/scripts/sema-katalog.mjs .
```

Bir fonksiyonun canlıdaki gövdesini ya da bir tablonun
gerçek sütunlarını oradan okuyun — buradaki eski migration'dan değil.
Migration uyguladıktan sonra anlık görüntüyü yenileyin; akış testleri onu
kurar.

**plpgsql gövdesi sütunları çalışma anında denetler.** Var olmayan bir sütuna
başvuran fonksiyon oluşurken hata vermez, ilk çağrıda düşer. Yeni ya da
değiştirilmiş her fonksiyonu gerçek tablo yapısıyla en az bir kez çalıştırın;
`submit_site_lead` bu yüzden 5 gün boyunca her geçerli başvuruyu düşürdü.

**security definer fonksiyonun yetkisini açıkça yazın.** Postgres yeni
fonksiyonu varsayılan olarak herkese (`public`) açar. Her security definer
fonksiyonun ardından `revoke all … from public, anon` ve yalnızca gereken
rollere `grant` yazın; anon'a açılan fonksiyon kendi yetki kontrolünü
yapmalıdır.

## Testler

`tests/unit/` yalnızca saf mantık modülleri içindir (Next/React/Supabase'e
dokunmayanlar). Bir hata düzeltince onu sabitleyen testi de ekleyin.

**`olarak()` bir `islem()` içinde çağrılmaz.** `olarak` kendi işlemini
açıp sonunda geri alıyor; bir `islem`'in içinde çağrıldığında DIŞ işlemi de
geri alıyor ve o noktadan sonraki her ifade kuralsız duruma bakıyor. Kuralı
kurup iki kez okuyan bir test ikinci okumada yanlış şeyi ölçüyor ve yeşil
kalıyor (06.10.2026'da üç dosyada vardı). `islem` içinde rol değiştirmek
için `rol(db, "authenticated", kullanici)` kullanın.

**Eski bir migration'ı yeniden uygulamak yeni korumayı düşürebilir.**
`tests/db/` dosyalarındaki `MIGRATIONLAR` listesi anlık görüntünün
ÜSTÜNE uygulanıyor: listede `create or replace function` içeren eski bir
migration varsa, aynı işlevin anlık görüntüdeki yeni gövdesini eski
hâline döndürür. Test o korumayı hiç sınamamış olur ama yeşil kalır —
09.10.2026'da `20261006190207` konuşma koruma işlevini eski sütun
listesiyle yeniden yaratıp çöp kutusu sütunlarının korumasını
düşürüyordu. Bir işlevi değiştiren migration'ı listeye SONDAN ekleyin ya
da eski olanı listeden çıkarın; kuralın gerçekten yürürlükte olduğunu
reddedilme bekleyen bir senaryoyla kanıtlayın. **`npm run
check:db-testleri` bunu CI'da denetliyor** (09.10.2026'da eklendi);
bilerek eski gövdeyle koşan bir satırın sonuna `govde-tamam: <sebep>`
yazılır.

**Bir işlevi yeniden yazarken gövdeyi anlık görüntüden alın**, eski bir
migration dosyasından değil. Çöp kutusu migration'ı konuşma korumasını
20261006190207'deki gövdeden türetti ve arada eklenmiş `okunmamis`
satırını düşürdü: koruma canlıda iki gün yoktu ve düzenek eski dosyayı
yeniden uyguladığı için test bunu söylemedi.

`tests/db/` (`npm run test:db`) canlı şemayı PGlite'a kurar ve akışları gerçek
fonksiyon/tetikleyicilerle, Supabase rolleriyle (anon, authenticated) koşar.
Bir tabloya koruma (tetikleyici, RLS) eklerken o tabloya yazan **meşru** yolların
senaryosu burada yeşil kalmalı; 19.09.2026'da teklif dondurma kuralı yalnızca
saldırı senaryolarıyla sınandı ve müşterinin onayını canlıda kırdı. Yeni
kuralı önce anlık görüntüye uygulayıp testleri çalıştırın.

## Kontroller

`npx tsc --noEmit`, `npm run lint`, `npm run test:unit`, `npm run test:db`,
`npm run check:rakamlar` — hepsi CI'da
(`.github/workflows/ci.yml`) çalışır. Derleme CI'da yapılmaz.

**Rakam denetimi** (`npm run check:rakamlar`): ekrandaki sayıların iki
bilinen yanlış kaynağını arar. Birincisi `.limit()` ile sınırlı bir
sorgudan `.reduce()` ile toplam almak — 22.09.2026'da konsolun üç
sayfasında ayrı ayrı çıktı ("Tahsil edildi" son 50 kaydın toplamıydı) ve
sınıra ulaşılana kadar hiçbir belirti vermiyor. İkincisi adı doğru gelen
ama başka bir şey tutan tablodan okumak: `billing_invoices` kiracının
KENDİ müşterilerine kestiği faturalar, `billing_subscriptions` bir abonelik
kütüğü değil ödeme günlüğü, `ai_credits_used` hiç yazılmıyor. Bilerek
kullanıyorsanız satırın üstündeki yorum bloğuna `tuzak-tamam: <sebep>`
yazın — sebebi yazmak, denetimi susturmanın bedeli. Yeni bir tuzak
öğrenildiğinde betikteki listeye eklenir.

**Döküm tablo ve SÜTUN yetkilerini taşımıyor.** `user_presence`'ta
SELECT sütun düzeyinde kısıtlı (sayfa ve cihaz bilgisi herkese kapalı):
sonradan eklenen her sütun varsayılan olarak okunamaz geliyor ve hata
"permission denied for table …" diye çıkıyor — upsert'in ON CONFLICT
dalı excluded değerini okuduğu için UPDATE yetkisi olsa bile. Böyle bir
tabloya sütun eklerken `grant select (<sütun>) on … to authenticated`
yazın. Akış testleri bunu YAKALAMAZ: düzenek Supabase varsayılanını
taklit edip her tabloya tam yetki veriyor, sütun düzeyinde yetki
yalnızca canlıda var (10.10.2026'da görünürlük anahtarı bu yüzden
canlıda düştü).

**Şema sözleşmesi** (`npm run check:schema`): koddaki tablo, sütun ve RPC
adları canlı şemanın kataloğuyla (`supabase/schema/katalog.json`)
karşılaştırılır. Supabase istemcisi tipsiz olduğu için yanlış sütun adı
derlemede görünmez; üretimde sorgu hata verir ve çoğu yerde hata yakalanıp
boş veri gösterilir (Platform → Ödemeler bu yüzden iki gün "sorun yok"
gösterdi). Yeni sütun/fonksiyon kullanan kodu, migration canlıya uygulanıp
katalog yenilendikten sonra birleştirin.
