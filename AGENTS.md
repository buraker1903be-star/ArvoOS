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
  `assertModuleKeyAccess`) + menüde gizleme. Yeni bir server action yazarken
  modülün yetki kontrolünü çağırmayı unutmayın: yalnızca sayfada kontrol etmek
  işlemi açıkta bırakır.
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

**ARC 19 Eylül 2026'dan beri ayrı Supabase projesinde** (`obaskcdxaaezjglayash`;
ArvoOS `oahshpkgdzrraqdzjqau`'da kaldı). Bu projedeki `arc_*` tabloları geçişten
kalma salt okunur yedek: onlara migration yazmayın, kod eklemeyin. ARC'ın kurum,
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

**Şema sözleşmesi** (`npm run check:schema`): koddaki tablo, sütun ve RPC
adları canlı şemanın kataloğuyla (`supabase/schema/katalog.json`)
karşılaştırılır. Supabase istemcisi tipsiz olduğu için yanlış sütun adı
derlemede görünmez; üretimde sorgu hata verir ve çoğu yerde hata yakalanıp
boş veri gösterilir (Platform → Ödemeler bu yüzden iki gün "sorun yok"
gösterdi). Yeni sütun/fonksiyon kullanan kodu, migration canlıya uygulanıp
katalog yenilendikten sonra birleştirin.
