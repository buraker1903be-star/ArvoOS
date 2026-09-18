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
- **`service_role` istemcisi RLS'i atlar.** `createAdminClient` kullanan her
  yol yetkiyi kendisi doğrulamalıdır.
- **Sırlar `NEXT_PUBLIC_` ile başlamaz.** Eksik ortam değişkeni uygulamayı
  düşürmez, ilgili özelliği kapalı gösterir ve nedenini kullanıcıya yazar.
- **Pazarlama sayfaları yalnızca `arvo-os.com`'da.** Host kararları
  `lib/site/host-rules.ts` içinde saf fonksiyonlardadır; proxy ve `robots.ts`
  oradan okur, kopya mantık yazılmaz.

## Sunucu işlemleri

Panel işlemleri `runPanelAction` ile sarılır (`lib/panel-action.ts`): üretimde
Next hata mesajlarını gizlediği için Türkçe açıklamalar çereze yazılıp bildirim
olarak gösterilir. Mesajlar URL'ye yazılmaz — dışarıdan sahte mesaj
enjekte edilemesin diye.

## Veritabanı

Migration'lar `supabase/migrations/` altında, `YYYYMMDDHHMMSS_ad.sql`. Mevcut
bir migration düzenlenmez; yenisi eklenir. Yeni tablo eklerken RLS'i açıp
politikalarını aynı migration'da yazın.

**ArvoOS ve ARC aynı Supabase projesini kullanır.** Bu deponun migration'ları
şemanın tamamını kurmaz (`crm_contracts`, `crm_proposals`, `hr_employees`,
`organization_memberships` gibi çekirdek tabloların `CREATE`'i hiçbir
migration'da yok). Canlı şemanın tam anlık görüntüsü ArvoARC deposunda:
`supabase/schema/` (güncelleme yöntemi oradaki README'de). Bir fonksiyonun
canlıdaki gövdesini ya da bir tablonun gerçek sütunlarını oradan okuyun —
buradaki eski migration'dan değil.

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

## Kontroller

`npx tsc --noEmit`, `npm run lint`, `npm run test:unit` — üçü de CI'da
(`.github/workflows/ci.yml`) çalışır. Derleme CI'da yapılmaz.
