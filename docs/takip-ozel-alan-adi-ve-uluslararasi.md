# Takip — özel alan adı (beyaz etiket) ve uluslararası altyapı

10.11.2026. **Bu PR'da düzeltme yok, veri dönüşümü yok.** Her madde iki kısımda:
**Doğrulanmış kod bulgusu** (dosya/işlev okundu) ve **Denenmemiş kullanıcı davranışı** (çalışan uygulamada
gözlenmedi; koddan çıkarım).

## 1. Alan adı ile çalışma alanı marka uyuşmazlığı

- **Kod:** Proxy, özel alan adının kurumunu çözüyor (`lib/supabase/proxy.ts` → `lib/alan-adi-kurumu.ts` →
  RPC `resolve_organization_by_domain`, yalnızca `custom_domain_status = 'verified'`). Çalışma alanı çerezi
  yalnızca kök yolda ya da çerez yokken alan adının kurumuna ayarlanıyor; bu bilinçli (aynı dosyadaki yorum:
  her istekte sıfırlamak başka kuruma geçişi geri alıyordu). Panel bağlamı kurumu çerezden okuyor
  (`lib/panel-context.ts`, `WORKSPACE_COOKIE`), host'a bakmıyor. Sekme başlığı ve simgesi ise host'tan
  geliyor (`app/panel/layout.tsx · generateMetadata`, `lib/kurum-simgesi.ts`).
- **Denenmemiş davranış:** A kurumunun alan adında B'ye geçen çok kurumlu kullanıcı sekmede A'nın adı/simgesini,
  içerikte ve temada B'yi görür. Veri sızıntısı değil (kullanıcı yalnızca kendi yetkili kurumlarını görür, RLS).
- **Öneri:** özel alan adında başka kuruma geçiş o kurumun doğrulanmış alan adına ya da app.arvo-os.com'a yönlensin.

## 2. Eski alan adını yeni bağlantı başarılı olmadan kaldırma

- **Kod:** Kurucu konsolunda kurum kaydı (`app/panel/platform/actions.ts`): eski alan adı
  `disconnectDomainFromVercel` ile ÖNCE kaldırılıyor, sonra `connectDomainToVercel`; bağlama başarısızsa
  işlem hata veriyor ama eski alan adı çoktan kaldırılmış. Kurum Ayarları yolu (`app/panel/settings/actions.ts`)
  sırayı bilerek tersine yapıyor.
- **Denenmemiş davranış:** konsoldan alan adı değiştirirken yeni alan adı reddedilirse kurumun çalışan adresi kapanır.
- **İlgili:** periyodik yeniden doğrulama yok (`lib/vercel-domains.ts` yalnızca kaydet/kontrol et anında);
  `organizations` UPDATE politikası yalnızca kurucuda — kiracı kendi alan adını pratikte bağlayamıyor;
  `custom_domain_status` için koruma tetikleyicisi yok (UPDATE açılırsa önce bu gerekir).

## 3. `primary_color` / `brand_color` tutarsızlığı

- **Kod:** Kurum Ayarları `primary_color` yazıyor (`app/panel/settings/actions.ts`). Giriş ekranı markası
  `primary_color` okuyor (`lib/login-branding.ts`). Panel teması `brand_color` okuyor
  (`app/panel/layout.tsx` → `lib/tenant-theme.ts`). Uygulama kodunda `brand_color` yazan bir yol bulunamadı.
- **Denenmemiş davranış:** kurum rengini Ayarlar'dan değiştiren kiracı girişte yeni rengi, panelde varsayılan rengi görür.
- **Öneri:** tek alan; geçiş için veri dönüşümü ayrı ve onaylı bir migration (burada yapılmadı).

## 4. Yabancı telefonların son 10 haneye indirgenmesi

- **Kod:** `private.arvo_search_digits` (canlı şema): `+90`/`0090` değilse ve 10 haneden uzunsa `right(digits, 10)`;
  liste aramaları ve görünümler bu anahtarı kullanıyor (`lib/liste-arama.ts` aynı indirgeme).
  `lib/format-phone.ts` +90 dışını biçimlemiyor (ham bırakıyor).
- **Denenmemiş davranış:** son 10 hanesi aynı iki yabancı numara aramada birbirini bulur; Türk numarasıyla da
  çakışabilir. Kayıt bozulmaz (anahtar yalnızca arama için).

## 5. Dil, saat dilimi, tarih/sayı, para birimi

- **Kod:** Panel için çeviri katmanı yok, metinler Türkçe (AGENTS.md kuralı); `<html lang="tr">` sabit
  (`app/layout.tsx`). Saat dilimi `Europe/Istanbul` sabit (`lib/istanbul-date.ts`, SQL özet işlevleri);
  kurum/kullanıcı saat dilimi kolonu yok. `tr-TR` biçimi yaygın; `lib/turkish-amount.ts` Türkçe yazımı okur.
  Kurumda varsayılan para birimi yok; teklif oluşturucuda `TRY` sabit (`app/panel/crm/proposal-builder-form.tsx`),
  okumalar `|| "TRY"`. Gösterim ve tahsilat para birimi ayrılmamış. Ödeme/vergi davranışı bu belgede değişmedi.
- **Denenmemiş davranış:** yabancı kurumda saatler ve gün sınırları İstanbul'a göre, tutarlar TRY varsayımıyla görünür.

## 6. Kuruma özgü hizmet ve sözleşme alanları

- **Kod:** Hizmet türleri kurum başına yapılandırılabiliyor (`organization_service_types`, `lib/hizmet-turleri.ts`)
  ama varsayılan liste akademik (`VARSAYILAN_HIZMET_TURLERI`: "Tez Danışmanlığı"…). Akademik künye alanları
  (üniversite, fakülte, seviye, dil) talep/teklif/sözleşme formlarında; talep formunda bir aşamaya bağlı,
  teklif ve sözleşme detayında koşulsuz.
- **Denenmemiş davranış:** akademik olmayan bir kurum bu alanları teklif/sözleşmede görür.
- **Öneri:** künye alanlarını kurum yapılandırmasına bağlamak; AkademikMerkez'in süreci zorunlu olmamalı.

## Ek: özel alan adında hâlâ "ArvoOS/Arvo" görünenler (kod)

iOS ana ekran adı (`app/layout.tsx`, `applicationName`/`appleWebApp.title`), giriş ekranındaki destek e-postası
(`app/login/page.tsx`, `mailto:info@arvo-os.com`), kök 404 (`app/not-found.tsx`), platform e-postalarının göndereni
(`lib/eposta-gonder.ts`). **Kalmalı:** auth e-postasındaki "ArvoOS altyapısıyla" atfı, kullanım sözleşmesi ve
belge metnindeki zorunlu Arvo maddeleri.
