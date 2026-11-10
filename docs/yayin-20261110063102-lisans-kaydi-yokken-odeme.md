# Yayın planı — 20261110063102 lisans kaydı yokken ödeme (PR #313)

Bu belge yalnızca plandır. Migration'ı uygulamak, PR'ı birleştirmek ve deploy etmek kurucunun kararıdır.
Hiçbir adım geçmiş kayıtları otomatik değiştirmez ya da yeniden işlemez: migration yalnızca işlev tanımlarını
değiştirir, veriye dokunmaz; yeniden işleme kurucunun tek tek bastığı bir düğmedir.

## Doğrulama durumu (prova: 10.11.2026, commit 761f175)

Prova ortamı: yerel, geçici bir PostgreSQL 16 kümesi. `listen_addresses=''` (TCP dinlemiyor, yalnızca unix
soket), yeni `initdb`, sentetik veri; üretime hiçbir bağlantı ya da kimlik bilgisi yok. Şema
`canli-sema.sql` + bekleyen migration'lar (bu migration HARİÇ) ile "üretimdeki hâl" kuruldu, migration
ardından §0.2'deki gibi tek işlemde uygulandı. PayTR çağrısı taklit edildi; gerçek ödeme yok.

Prova yeniden çalıştırılabilir: `scripts/yayin-provasi.sh` (gereksinimler dosyanın başında; PostgreSQL 16 +
Node 22.18+, Docker/Supabase gerekmez). Çıkış kodu 0 → bütün kontroller geçti.

| Kontrol | Durum | Kanıt |
|---|---|---|
| §1 ön kontrol sorguları çalışıyor | Doğrulandı (sentetik veri) | prova, 6 sorgu hatasız |
| §1 sonuçları üretimde | **Denenmedi** | üretime erişilmedi |
| §1.5 yeni işlevler önce yok | Doğrulandı | prova |
| §1.6 canlı gövde = anlık görüntü | **Denenmedi** (üretim gerekiyor) | gövde farkı anlık görüntüye karşı mekanik doğrulandı |
| §0.2 migration tek işlemde uygulanıyor | Doğrulandı | prova |
| §3.1 işlevler security definer, search_path boş | Doğrulandı | prova |
| §3.2 yetkiler | Doğrulandı | prova: anon hiçbiri; authenticated yalnızca yeniden işleme; service_role yeniden işleme + kayıt; iç işlev kimseye açık değil |
| §3.3 migration veriye dokunmuyor | Doğrulandı | prova |
| Sistem sağlığı → Veritabanı ekranı | **Denenmedi** | uygulama yığını kurulamadı (aşağıda) |
| Eksik lisans + tahsilat → `no_license`, bağlantı `paid`, onaylı ödeme/aktivasyon/fatura yok | Doğrulandı | prova + tests/db |
| Kapatma hatası → 503, günlükte iz; tekrar bildirim `duplicate`, kapatma yeniden denenir, yan işlem çoğalmaz | Doğrulandı | prova (rota modülü + gerçek DB) + tests/db/paytr-link-bildirimi |
| Müşteri ekranının okuduğu "ödeme alındı, uygulama bekliyor" verisi | Doğrulandı (sorgu düzeyi) | prova; müşteri tabloyu doğrudan okuyamıyor (RLS) |
| Müşteri ekranında metnin görünmesi | **Denenmedi** | sayfa çizilmedi |
| Kurucu listesinde olay + yeniden işlenebilir sonuç | Doğrulandı (sorgu düzeyi) | prova |
| Kurucu ekranında "Yeniden işle" düğmesi ve sunucu işlemi | **Denenmedi** | sayfa çizilmedi; işlemin çağırdığı RPC kurucu oturumuyla doğrulandı |
| Lisans (kurucu RLS'iyle) oluşturulup yeniden işleme → tek aktivasyon, olay kimliği/zamanı/payload korunur, işlem kaydı | Doğrulandı | prova + tests/db |
| Aynı olay ikinci kez yeniden işlenemez; sonraki PayTR tekrarı uzatmaz | Doğrulandı | prova + tests/db |
| Eşzamanlı yeniden işleme, bildirim yarışı, lisans silme yarışı | Doğrulandı | scripts/odeme-eszamanlilik.sh (iki bağlantı) |
| §5 geri alma SQL'i + migration'ın yeniden uygulanması | Doğrulandı | scripts/odeme-eszamanlilik.sh, 7. senaryo |
| §4 imzalı HTTP callback, gerçek PayTR bağlantı silme, Vercel günlükleri, Vercel geri dönüşü | **Denenmedi** | dış servis / üretim gerekiyor |
| PayTR'nin "zaten silinmiş bağlantı" hata metni | **Bilinmiyor** | §2'deki sınırlama |

**Uygulama yığını neden kurulmadı:** Docker hizmeti bu ortamda çalışmıyor (yerel Supabase yok); PostgREST'in
dışarıdan indirilip çalıştırılmasına izin verilmedi. Sayfaların çizimi ve sunucu işlemleri bu yüzden
uçtan uca denenmedi; veritabanı tarafı uygulamanın kullandığı rollerle ve sorgularla sınandı. Kapatmak
için: Docker'lı bir makinede `supabase start` ya da üretimden ayrı bir Supabase dalı (branch), sonra §4.

## 0. Sıra

1. Aşağıdaki salt okunur kontroller (SQL Editor).
2. Migration: `supabase/migrations/20261110063102_lisans_kaydi_yokken_odeme.sql`, SQL Editor'de `begin; … commit;` içinde.
3. Migration sonrası SQL doğrulaması (3. bölüm).
4. PR #313 birleştirilir → Vercel üretim dağıtımı.
5. Uygulama sonrası doğrulama (4. bölüm).
6. Şema anlık görüntüsü ve katalog yenilenir (`AGENTS.md` → Veritabanı), `BEKLEYEN_MIGRATIONLAR` boşaltılır.

Migration ile dağıtım arasını kısa tutun (2. bölümdeki sınırlamalar o aralıkta geçerli).

## 1. Migration öncesi salt okunur kontroller

Hiçbiri yazmaz. Sonuçları kaydedin; geri dönüş kararında karşılaştırılacak.

```sql
-- 1.1 ArvoOS lisans satırı olmayan kurumlar (asıl riskin yüzeyi).
select o.id, o.name, o.status, o.created_at
  from public.organizations o
  left join public.organization_licenses l on l.organization_id = o.id
 where l.organization_id is null
 order by o.created_at desc;

-- 1.2 Lisanssız kurumların bekleyen havale bildirimleri (migration sonrası onay 'license_missing' verecek).
select r.id, r.organization_id, r.amount, r.created_at
  from public.organization_payment_requests r
  left join public.organization_licenses l on l.organization_id = r.organization_id
 where r.status = 'pending' and r.product = 'arvoos' and l.organization_id is null;

-- 1.3 Eski hatanın olası izi: lisansı olmayan kurumda "onaylı" ArvoOS ödemesi.
--     (Bilgi amaçlı; DÜZELTME YAPILMAZ. Bulunursa kurucu tek tek inceler.)
select r.id, r.organization_id, r.amount, r.payment_method, r.reviewed_at
  from public.organization_payment_requests r
  left join public.organization_licenses l on l.organization_id = r.organization_id
 where r.status = 'approved' and r.product = 'arvoos' and l.organization_id is null;

-- 1.4 İşlenemeyen PayTR olaylarının bugünkü dökümü (sonrası ile karşılaştırmak için).
select result, count(*) from public.payment_provider_events group by result order by 2 desc;

-- 1.5 Yeni işlevler henüz yok (yanlışlıkla iki kez uygulanmadığını gösterir).
select n.nspname, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname in ('arvo_apply_paytr_event', 'arvo_reprocess_paytr_event');

-- 1.6 Değişecek iki işlevin canlı gövdesi anlık görüntüyle aynı mı?
--     Çıktıyı supabase/schema/canli-sema.sql'deki gövdeyle karşılaştırın; farklıysa DURUN
--     (migration o gövdenin üzerine yazar — arada canlıda yapılmış bir değişiklik kaybolur).
select pg_get_functiondef('public.arvo_record_paytr_payment(uuid,text,bigint,bigint,text,boolean,jsonb)'::regprocedure);
select pg_get_functiondef('private.arvo_activate_license_period(uuid,plan_code,bigint,text,text,uuid)'::regprocedure);
```

## 2. Migration ile uygulama arasında bilinen sınırlamalar

**Migration uygulandı, eski uygulama çalışıyor:**
- PayTR callback `no_license` sonucunda yine `OK` döner (kırılmaz), ama eski kod PayTR bağlantısını yalnızca
  `recorded` sonucunda kapatır: lisanssız kurumda PayTR adresi açık kalır. Müşteri yeniden öderse ikinci tahsilat
  ayrı bir `no_license` olayı olur (kaybolmaz) ve kurucunun listesine düşer.
- Kurucunun Ödemeler ekranında olay ham `no_license` etiketiyle görünür; "Yeniden işle" düğmesi yoktur.
- Müşterinin kartla ödeme dönüşü, lisansa uygulanmamış tahsilatta da "lisansınız uzatıldı" yazabilir (eski metin).
- Havale onayı lisanssız kurumda "Ödeme kararı kaydedilemedi: license_missing" der; bildirim bekliyor kalır.

**Uygulama, migration'dan önce dağıtılırsa:**
- "Yeniden işle" düğmesi "işlev bulunamadı" hatası verir; müşteri ekranındaki bekleyen tahsilat uyarısı boş kalır.
- Callback çalışır; `no_license` hiç oluşmaz (eski veritabanı davranışı, yani eski hata sürer).

**Yeni callback davranışı (dağıtımdan sonra kalıcı):**
- PayTR bağlantısını kapatma başarısızsa PayTR'ye 503 döner; PayTR bildirimi yeniden gönderir, veritabanı
  `duplicate` der (ikinci tahsilat/uzama yok) ve kapatma yalnızca önceki olay bu bağlantının tahsilatıysa
  yeniden denenir. Kapatma kalıcı olarak başarısızsa (ör. bağlantı PayTR'de zaten silinmiş ya da süresi dolmuş
  ve PayTR hata dönüyorsa) PayTR yeniden deneme süresi bitene kadar 503 alır; her deneme günlükte
  `[paytr] bağlantı kapatılamadı` satırıdır. Para tarafında etkisi yoktur. PayTR'nin bu durumda hangi hata
  metnini döndürdüğü bilinmiyor; "zaten kapalı" ayırt edilmiyor.

## 3. Migration sonrası SQL doğrulaması (uygulama dağıtımından önce)

```sql
-- 3.1 Yeni işlevler var, security definer, search_path boş.
select n.nspname, p.proname, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname in ('arvo_apply_paytr_event', 'arvo_reprocess_paytr_event', 'arvo_record_paytr_payment', 'arvo_activate_license_period');

-- 3.2 Yetkiler: iç işlev hiçbir istemci rolüne açık değil; yeniden işleme anon'a kapalı.
select r.rolname,
       has_function_privilege(r.rolname, 'private.arvo_apply_paytr_event(uuid)', 'execute') as ic_islev,
       has_function_privilege(r.rolname, 'public.arvo_reprocess_paytr_event(uuid)', 'execute') as yeniden_isleme,
       has_function_privilege(r.rolname, 'public.arvo_record_paytr_payment(uuid,text,bigint,bigint,text,boolean,jsonb)', 'execute') as kayit
  from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role');
-- Beklenen: ic_islev hepsi false; yeniden_isleme anon false, authenticated/service_role true;
--           kayit yalnızca service_role true.

-- 3.3 Veri değişmedi: 1.4'teki döküm aynı.
select result, count(*) from public.payment_provider_events group by result order by 2 desc;
```

Sistem sağlığı → Veritabanı (`platform_sema_eksikleri`) bu migration için eksik göstermemeli.

## 4. Uygulama dağıtımı sonrası doğrulama (gerçek ödeme YAPILMAZ)

1. Kurucu: Platform → Ödemeler açılıyor; işlenemeyen bildirim yoksa liste görünmüyor, varsa `no_license`
   satırı "Tahsil edildi · lisansa uygulanmadı" etiketiyle ve "Yeniden işle" düğmesiyle.
2. Kurum: Abonelik ve faturalama ekranı açılıyor (lisanslı bir kurumda değişiklik görünmemeli).
3. Vercel günlükleri (ilk günler): `[paytr] bağlantı kapatılamadı`, `lisans kaydı yok`, `ikinci tahsilat`,
   `tekrarlanan bildirimin önceki olayı okunamadı`. Herhangi biri çıkarsa olay kimliğiyle incelenir.
4. Doğal trafikte ilk PayTR ödemesinden sonra (deneme ödemesi yapılmaz):
   ```sql
   select e.merchant_oid, e.result, e.received_at, l.status, l.paid_at
     from public.payment_provider_events e join public.payment_links l on l.id = e.payment_link_id
    order by e.received_at desc limit 5;
   ```
   Beklenen: `recorded`, bağlantı `paid`, `paid_at = received_at`; PayTR panelinde bağlantı kapalı.
5. Lisanssız kurum çıkarsa (1.1): kurucu Platform → Lisanslar'dan lisansı paket/ücret/limitle oluşturur, sonra
   o olay için "Yeniden işle"ye basar. İşlem kaydı müşteri kartının Hareketler sekmesinde görünür.

## 5. Geri dönüş

**Ne zaman:** callback'te 500/503 artışı ve `ödeme kaydedilemedi` günlükleri; lisansı OLAN kurumlarda havale
onayının `license_missing` vermesi; yeniden işlemenin beklenmeyen sonuç döndürmesi.

**Nasıl:**
1. Uygulama: Vercel'de önceki üretim dağıtımına dönülür (promote/rollback).
2. Önce bakılır: `select id, merchant_oid, organization_id, payment_amount, received_at from public.payment_provider_events where result = 'no_license';`
   Satır varsa listesi kaydedilir; geri dönüşten sonra yeniden işleme işlevi kalmaz, bu tahsilatlar elle işlenir.
3. Veritabanı: `scripts/geri-donus/20261110063102_geri_al.sql` SQL Editor'de çalıştırılır (canlı gövdeleri birebir
   geri koyar, yeni iki işlevi kaldırır, veriye dokunmaz). İzole PostgreSQL'de sınandı
   (`scripts/odeme-eszamanlilik.sh`, 7. senaryo).

**Geri dönüş ESKİ HATAYI GERİ GETİRİR:** lisans satırı olmayan kurumda havale onayı ve PayTR ödemesi yine
"onaylı" yazılır, lisans açılmaz ve hiçbir yerde görünmez. Geri dönüş yalnızca yeni kodun daha büyük bir
soruna yol açtığı durumda seçilmeli; geri dönüldüyse 1.1 sorgusu düzenli çalıştırılıp lisanssız kurum
olmadığı elle izlenmelidir.

## 6. Bilerek yapılmayanlar

- Geçmiş ödemeler, olaylar ya da lisanslar üzerinde otomatik düzeltme veya toplu yeniden işleme yok.
- 1.3'te bulunan eski "onaylı" kayıtlar değiştirilmez; kurucu tek tek karar verir.
- Gerçek bir PayTR ödemesiyle deneme yapılmaz.
