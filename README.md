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
saf mantık modüllerini kapsar: tutar ayrıştırma, Türkiye tarihi, ödeme planı,
satış primi dağıtımı, rol yetkilendirmesi ve pazarlama host kuralları. Çoğu
test, koddaki yorumlarda anlatılan gerçek hataların tekrarını engeller.

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
