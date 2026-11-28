# Para akışı haritası — bugünkü durum (28.11.2026)

Çok para birimli (TRY + USD) fiyatlandırma ve tahsilat işinin birinci adımı:
paranın nereden geldiğini, nerede birim kabulü yapıldığını ve hangi kanalın
hangi para biriminde çalıştığını çıkarmak. Referans sürüm: `5ef77c8e`
(PR #335 birleşmesi). Bütün okumalar salt okunur; canlıya yazılmadı.

## 1 · Tek cümlelik özet

Para **tutarı** her yerde tam sayı alt birim (kuruş) olarak tutuluyor ve bu
doğru. **Para birimi** ise iki ayrı dünyada yaşıyor: tahsilat tarafındaki
tabloların çoğunda `currency` sütunu VAR ama her zaman `'TRY'` yazılıyor;
fiyat tarafında ise sütun bile YOK — fiyat listesi para biriminden habersiz.
Kart tahsilatı PayTR'ye her çağrıda `TL` gönderiyor.

## 2 · Fiyat: kod + veritabanı

| Katman | Dosya / tablo | Para birimi nereden geliyor |
| --- | --- | --- |
| Basamak tanımı (ad, kod, birim, teklif usulü) | `lib/site/pricing.ts` | `export const PARA_BIRIMI = "TRY"` — tek global sabit. `tl(...)` yardımcısı tutarı kuruşa çeviriyor. Plan tipinde para birimi alanı yok. |
| Yayımlanan tutar | `public.platform_fiyat_listesi` (`kod`, `tur`, `aylik_kurus`, `taslak_kurus`, `taslak_bekliyor`, `yayimlandi_at`) | **Para birimi sütunu yok.** Birincil anahtar `kod`; yani bir plan için tek bir tutar saklanabiliyor. |
| Çözüm (kod varsayılanı + veritabanı üstüne yazar) | `lib/site/fiyat-kaynagi.ts` → `fiyatlariBirlestir` | Yalnızca tutarı geçersiz kılıyor; birim kavramı yok. |
| Okuma (pazarlama sitesi) | `lib/site/fiyat-oku.ts` | `select kod,aylik_kurus` — birim okunmuyor. |
| Yıllık bedel | `YILLIK_ODENEN_AY = 10` (`pricing.ts`) | Aylığın tam katı; bölme/yuvarlama yok. Bu kural korunacak. |
| Konsol düzenleme/yayım | `app/panel/platform/fiyatlar/fiyat-duzenleme.tsx`, `app/panel/platform/urunler/actions.ts` | Tek tutar alanı; kapsam imzası `kod:tutar` (`lib/fiyat-dogrulama.ts` → `kapsamImzasi`). |
| Yayım işlevi | `public.platform_fiyatlari_yayimla(text)` + `private.fiyat_kapsam_cozumle/yayimla` (migration 20261127182525, 20261127191104) | İmza `kod:tutar|…`; para birimi ayırt edilmiyor. |

**Sonuç:** aynı planın TRY ve USD fiyatı bugün yan yana duramıyor; fiyat
listesinin anahtarı para birimini içermiyor.

## 3 · Tahsilat: kanal kanal

| Kanal | Kod | Bugün gönderilen/yazılan para birimi | USD durumu |
| --- | --- | --- | --- |
| **Havale/EFT bildirimi** (müşteri dekont yüklüyor) | `app/panel/billing/actions.ts` → `organization_payment_requests` | Satıra `currency: "TRY"` SABİT yazılıyor; seçilen banka hesabının `currency` sütunu okunmuyor bile | Tablo hazır (`currency` var). Kanalın USD çalışması için **doğrulanmış bir USD hesabı** gerekiyor — canlıda yok (bkz. §5) |
| **Kart (tek çekim / 3D)** | `lib/paytr-kart-akisi.ts` → `lib/paytr-direkt.ts` | `paraBirimi` hiç verilmiyor → `currency: g.paraBirimi ?? "TL"` yani **her zaman TL** | PayTR'nin doğrudan API'si `"TL" \| "EUR" \| "USD"` tipini zaten taşıyor; **hesap düzeyinde USD desteği doğrulanmadı** |
| **Ödeme bağlantısı** | `lib/paytr.ts` | `currency: "TL"` SABİT (imzaya da giriyor) | Değişiklik gerekiyor; hesap desteği doğrulanmadı |
| **Kayıtlı kartla otomatik yenileme** | `lib/paytr-direkt.ts` (recurring), `lib/otomatik-yenileme.ts` | Aynı varsayılan: `TL`. Hatırlatma metni tutarı `Intl … currency: "TRY"` ile yazıyor | `paytr_otomatik_yenileme` tablosunda para birimi sütunu YOK; yenileme aboneliğin birimini izleyemiyor |
| **Ödeme dönüşü (webhook/callback)** | `app/api/paytr/callback/route.ts`, `lib/paytr-kart-akisi.ts` | `p_currency: field("currency") || "TL"` — sağlayıcıdan geleni alıyor, yoksa TL varsayıyor | Eşleştirmede tutar var, **para birimi karşılaştırması yok** |
| **Proforma** | `lib/proforma.ts`, `platform_proformalari.para_birimi` (varsayılan `'TRY'`) | Sütun var, tek değer yazılıyor | Belge/PDF birimi buradan beslenebilir |
| **AI kredi siparişi** | `ai_credit_orders.currency` (varsayılan `'TRY'`) | Sabit | Kapsam dışı sayılabilir, kararı ayrıca verilecek |

## 4 · Belgeler, abonelik ve raporlar

- `crm_proposals.currency`, `crm_contracts.currency`, `payment_plans.currency`,
  `account_entries.currency`, `finance_transactions.currency`,
  `billing_invoices.currency` — hepsi var ve hepsi `'TRY'` varsayılanlı.
  Bunlar **kiracının kendi müşterisine** kestiği belgeler; Arvo'nun kendi
  satışı değil. Kapsam kararı gerekiyor (bkz. §6).
- `billing_subscriptions.currency`, `platform_subscription_requests.currency`,
  `subscriber_payments.currency` — Arvo'nun kendi abonelik tarafı; sütun var,
  değer sabit.
- Raporlar (`lib/rapor-tahsilat.ts`, konsol Tahsilatlar/Ödeme onayları/Ürün
  performansı) tutarları **tek nominal toplamda** topluyor; para birimi
  ayrımı yok. Bugün tek birim olduğu için sorun çıkmıyor, USD girince
  "12.500 + 850 = 13.350" gibi anlamsız bir toplam üretir.
- Ekranlarda **45 ayrı yerde** `Intl.NumberFormat(... currency: "TRY")`
  yazılı; ortak bir para biçimleyici yok (`lib/turkish-amount.ts` yalnızca
  Türkçe tutar OKUMA tarafını çözüyor: `kurusOku`, `parseTurkishAmount`,
  `liraYazisi`).

## 5 · Canlıdaki durum (salt okunur sayım, 28.11.2026)

| Tablo | Satır |
| --- | --- |
| `platform_bank_accounts` | **1 satır, `TRY`, aktif** — USD hesabı YOK |
| `organization_payment_requests` | 0 |
| `billing_subscriptions` | 0 |
| `platform_subscription_requests` | 0 |
| `platform_proformalari` | 0 |
| `subscriber_payments` | 0 |
| `paytr_otomatik_yenileme` | 0 |
| `platform_fiyat_listesi` | 16 satır, hepsi tek tutar, bekleyen taslak 0 |

Yani **para birimi karışması riski taşıyan canlı veri henüz yok**; dönüşüm
değil, ileriye dönük kural yazılacak. Yine de kural kodda korunacak: mevcut
kayıtlar kendi para birimini taşımaya devam edecek.

## 6 · Uygulamayı bekleyen kararlar

1. **USD kart tahsilatı.** PayTR'nin API'si USD alanını kabul ediyor; hesabın
   USD ile işlem ve mutabakat yapıp yapmadığı **doğrulanmadı** — bu oturumda
   sağlayıcı hesabına erişim ve gerçek test işlemi yetkisi yok. Doğrulanana
   kadar USD kart kanalı **UNVERIFIED** ve arayüzde kapalı gösterilecek.
2. **USD havale.** Canlıda USD banka hesabı tanımlı değil. USD havale
   kanalının açılabilmesi için Tahsilat → banka hesaplarına doğrulanmış bir
   USD hesabı eklenmesi gerekiyor.
3. **ArvoLab USD plan tutarları.** Gerçek rakamlar kurum sahibinden gelecek;
   bu işte yalnızca test örnekleri kullanılacak ve ayrı tutulacak.
4. **Kiracının CRM belgeleri** (teklif/sözleşme/ödeme planı) bu işin kapsamına
   giriyor mu? Bu belgeler kiracının kendi müşterisine ait ve `currency`
   sütunları zaten var; Arvo'nun kendi satışından bağımsızlar.
