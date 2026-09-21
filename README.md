# ArvoOS

Çok kiracılı (multi-tenant) kurumsal yönetim paneli ve Arvo'nun pazarlama
sitesi. Tek kod tabanı üç katmanı birlikte yayınlar:

| Katman | Yol | Alan adı |
| --- | --- | --- |
| Pazarlama sitesi (TR/EN) | `app/(site)/` | `arvo-os.com` |
| Panel | `app/panel/` | `app.arvo-os.com` ve kurumların kendi alan adları |
| Ürün köprüleri | `app/api/` | her iki host |

Panel modülleri: CRM (talep → teklif → sözleşme), Operasyon (iş akışları,
adımlar, müşteri dosyaları), Finans (cari, banka, tahsilat, PayTR, raporlar),
İnsan Kaynakları (ekip, prim, gizlilik sözleşmeleri), Dokümanlar, Mesajlaşma,
Bildirimler ve Platform yönetimi.

## Yığın

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres + Auth +
Storage) · Cloudflare vinext üzerinde çalışır, dağıtım Sites/Vercel tarafında.

## Kurulum

```bash
npm ci
cp .env.example .env.local   # değerleri doldurun
npm run dev
```

Zorunlu olan tek şey Supabase URL'i ve publishable anahtarıdır; geri kalan
değişkenler ilgili özelliği açar (PayTR, ArvoLab köprüsü, Vercel alan adı
bağlama). Hangisinin ne açtığı `.env.example` içinde tek tek yazılı — eksik
değişken uygulamayı düşürmez, o özelliği kapalı gösterir.

## Komutlar

| Komut | Ne yapar |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu |
| `npm run test:unit` | Saf mantık birim testleri (derleme gerekmez) |
| `npx tsc --noEmit` | Tip denetimi |
| `npm run lint` | ESLint |
| `npm run build` | Sites artefaktını üretir ve doğrular |
| `npm test` | Derleme + yayınlanan HTML doğrulaması |
| `npm run check:css` | CSS değişken (token) denetimi |
| `npm run validate:artifact` | Mevcut artefaktın manifest/ESM kontrolü |

Her push ve PR'da `.github/workflows/ci.yml` tip denetimi, lint ve birim
testlerini çalıştırır. Derleme CI'da değil, dağıtım tarafında yapılır.

## Testler

`tests/unit/` altındaki birim testleri Next, React ya da Supabase'e dokunmayan
saf mantık modüllerini kapsar: tutar ayrıştırma, KDV hesabı, Türkiye tarihi,
ödeme planı, satış primi dağıtımı, rol yetkilendirmesi, pazarlama host
kuralları, telefon biçimlendirme ve mesaj balonu gruplama. Çoğu test, koddaki
yorumlarda anlatılan gerçek hataların tekrarını engeller.

Bir mantık parçası test edilemiyorsa nedeni genellikle Next/Supabase'e bağlı
bir dosyanın içinde durmasıdır; `lib/sales-amounts.ts` ve
`app/panel/messages/message-format.ts` bu yüzden ayrı durur.

Node 24 TypeScript'i kendisi sıyırdığı için derleme adımı yoktur;
`tests/register.mjs` yalnızca `@/…` takma adını ve uzantısız import'ları
tsconfig'deki gibi çözer.

`tests/rendered-html.test.mjs` bundan ayrıdır: derlenmiş Worker artefaktının
yayınlanabilir olduğunu doğrular ve `npm test` ile çalışır.

## Veritabanı

Supabase migration'ları `supabase/migrations/` altında, zaman damgası
sırasıyla uygulanır. Kurum verisi Row Level Security ile ayrılır; yetki üç
yerde birden kurulur ve üçü de gereklidir:

1. **Veritabanı** — RLS politikaları (kurum üyeliği).
2. **Sunucu** — `assertModuleAccess` / `assertModuleKeyAccess`
   (`lib/role-permissions.ts`). Sayfa düzeni *ve* her server action bunu
   çağırır; yalnızca sayfada çağırmak modül işlemlerini açıkta bırakır.
3. **Arayüz** — menüde gizleme. Tek başına güvenlik değildir.

Kurum Sahibi (`owner`) hiçbir zaman kısıtlanamaz — kurumun kendi panelinden
kilitlenip dışarıda kalmasını önlemek için.

`supabase/functions/` altında üç Edge Function var: kurum sağlama, ekip daveti
ve kimlik doğrulama e-postaları.

## Ürün köprüleri

- **ArvoLab** ayrı bir Supabase projesinde. Lisans durumu her istekte
  sorulmaz; ArvoOS değişiklik oldukça ArvoLab'a yazar (`lib/arvolab.ts`), böylece
  ArvoOS erişilemez olsa bile ArvoLab son bilinen duruma göre çalışır.
- **Bireysel abonelik** için ürün, `app/api/bridge/subscription` ucuna
  sunucudan sunucuya sorar; yetki iki tarafta aynı olan `PRODUCT_BRIDGE_SECRET`
  ile doğrulanır. Fiyat, deneme ve askıya alma kararları ArvoOS'ta kalır.
- **PayTR** "Link ile Ödeme" entegrasyonu kurum başınadır; mağaza anahtarları
  veritabanında AES-256-GCM ile şifreli tutulur (`lib/payment-credentials.ts`).
- **WhatsApp** dört ürünün ortak kapısıdır: ürünler Meta'ya değil
  `app/api/bridge/whatsapp` ucuna çağırır (`lib/whatsapp-gateway.ts`). Tek
  yerde erişim anahtarı, tek yerde mesaj kaydı, tek yerde hata haritası.
  Ayrıntı: **WhatsApp** bölümü.

## Alan adları ve SEO

Pazarlama sayfaları yalnızca `arvo-os.com`'da yayınlanır; kurum alan adından
veya panel hostundan istenirse kanonik adrese 308 ile yönlendirilir. Panel,
müşteri belgeleri ve oturum yolları hiçbir hostta dizine girmez. Kararların
tamamı `lib/site/host-rules.ts` içinde saf fonksiyonlardadır ve birim
testlidir; `lib/supabase/proxy.ts` ile `robots.ts` oradan okur.

## Platform notları (Sites)

Sites yaşam döngüsü CLI'ı kilitli bağımlılık kurulumunu kendisi yapar. Kaynağı
düzenleyin, tutarlı bir aşama hazır olunca kontrol noktası alın; uzak Sites
derleyicisi gönderilen commit üzerinde `npm run build` çalıştırır. Kurulum ve
derlemeyi normal akışın parçası olarak tekrarlamayın.

`install:ci` tek seferlik, yeniden denemeyen bir `npm ci`'dir: aynı proje için
eşzamanlı kurulumu reddeder, imaj önbelleğini `--prefer-offline` ile kullanır,
npm'i tek sokete indirir ve takılan kurulumu sonlandırır. Bu yardımcılar Linux
ve GNU `timeout` içindir, macOS'ta çalışmaz. Zaman aşımları
`SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT` ve
`SITES_BUILD_KILL_AFTER` ile değiştirilebilir; hiçbiri yeniden denemez.

Yazılabilir proje kapsamlı HOME/npm/XDG yolları gereken betikler
`scripts/sites-env.sh` kullanır. Üretilen `.sites-runtime/` klasörü geçicidir
ve Git'e girmez. Bu proje `wrangler.jsonc` kullanmaz.

## Şablondan kalan, şu an kullanılmayan parçalar

Bunlar vinext başlangıç şablonundan gelir ve ArvoOS'ta **kullanılmaz**; silinmediler
çünkü platform iskeletinin parçası:

- **Cloudflare D1 + Drizzle** (`db/`, `drizzle.config.ts`, `examples/d1/`):
  `db/schema.ts` boş, `.openai/hosting.json` içinde `d1: null`. Tüm veri
  Supabase'de.
- **ChatGPT ile giriş** (`app/chatgpt-auth.ts`): hiçbir yerden import
  edilmiyor. Panel girişi Supabase Auth ile yapılır.

Bunlardan birini açacaksanız önce `.openai/hosting.json` bağlamalarını tanımlayın.

## WhatsApp

Dört ürün de (ArvoOS, ArvoLab, ARC, Randevu) müşterilerine WhatsApp'tan
mesaj gönderir. İki ayrı gönderen var ve ayrımı ürün değil **kurum** belirler:

- **Kurumun kendi numarası** — kurum WhatsApp Business hesabını bağladıysa
  (`whatsapp_accounts`) mesaj onun numarasından gider. Müşteri "Arvo"dan
  değil çalıştığı işletmeden mesaj aldığını görür.
- **Arvo'nun ortak numarası** — Arvo'nun kendi mesajları (ödeme hatırlatma,
  lisans bildirimi) ve numarasını bağlamamış kurumlar için yedek.
  Anahtarı ortam değişkeninde (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`).

Numarayı kurum iki yerden bağlayabilir: ArvoOS panelinde Ayarlar →
Entegrasyonlar, Randevu panelinde Ayarlar → WhatsApp numarası (köprü:
`app/api/bridge/randevu/whatsapp`). İşin kendisi tek yerde:
`lib/whatsapp-account.ts`. Bağlarken numara Meta'ya sorulur; anahtar
yanlışsa kayıt hiç yazılmaz, yoksa hata ilk mesajda anlaşılırdı.

Akış:

```
ürün → POST /api/bridge/whatsapp   (x-arvo-bridge-secret, ürün başına ayrı anahtar)
     → gönderen çözülür (kurumun numarası / Arvo'nunki)
     → Meta Cloud API
     → her mesaj whatsapp_messages'a yazılır
Meta → POST /api/webhooks/whatsapp (X-Hub-Signature-256)
     → gelen mesaj + durum bildirimi (iletildi / okundu / gitmedi)
```

Bilinmesi gerekenler:

- **Şablon zorunluluğu Meta'nın kuralı.** İş tarafının başlattığı mesaj,
  müşterinin son yazışmasından 24 saat sonra yalnızca onaylı şablonla
  gönderilebilir. Serbest metin yalnızca pencere içinde (gelen kutusundan
  verilen yanıt); dışında Meta 131047 ile reddeder.
- **Kısmi başarısızlıkta kapı 207 döner**, gövdede her mesajın sonucu vardır.
  Ürün "hepsi gitti" sanmasın diye 200 değil.
- **Webhook'a her zaman 200.** Meta 200 almadığı bildirimi saatlerce yeniden
  dener ve sonunda aboneliği askıya alır; yalnızca yeniden denemenin işe
  yarayacağı durumda (anahtar yok, veritabanı düştü) 500 döneriz.
- **Gelen mesajın tekilliğini veritabanı kurar** (kısmi tekil indeks):
  Meta aynı bildirimi yeniden yollayabilir.
- **Gelen kutusu** Ayarlar → Entegrasyonlar → WhatsApp gelen kutusu. Dört
  ürünün mesajı tek akışta; müşteri için hepsi aynı sohbet.
