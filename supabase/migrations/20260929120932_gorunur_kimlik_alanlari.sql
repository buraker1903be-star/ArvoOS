-- ============================================================
-- SIR OLMAYAN KİMLİK ALANLARI GÖRÜNÜR OLSUN
--
-- Garanti'nin Terminal Numarası bugün SIR olarak saklanıyor
-- (credentials_enc içinde, şifreli) ve bu yüzden hiçbir ekranda geri
-- gösterilmiyor. Terminal numarası bir sır değil: bankanın güvenliği
-- PROVAUT şifresi ve 3D StoreKey üzerinde duruyor, terminal numarası
-- ise üye işyeri panelinde ve her entegrasyon belgesinde yazılı bir
-- kimlik.
--
-- ÜÇ MARKA TEK ÜYE İŞYERİ, AYRI TERMİNALLER kurulumunda bu bir sorun:
-- ArvoOS, AkademikMerkez ve ArvoCulture aynı tüzel kişiliğe ait
-- (20260916250000) ve aynı Üye İşyeri Numarasını paylaşıyorlar. Üç
-- kaydı birbirinden ayıran TEK alan terminal numarası; o da
-- görünmeyince panelde "hangi kurum hangi terminale bağlı" sorusunun
-- cevabı yok. Yanlış terminale bağlanmış bir kurum sessizce başka bir
-- markanın hesabına tahsilat yapar.
--
-- credentials_enc'e yazılamaz: üzerindeki CHECK her değerin şifreli
-- olmasını şart koşuyor (arvo_sifreli_harita_mi) ve şifreli değer geri
-- gösterilemiyor. O yüzden AÇIK bir harita ekleniyor.
--
-- Sütunlaştırmıyoruz, çünkü sağlayıcı katmanının kuruluş gerekçesi bu:
-- her banka kendi alanlarını getiriyor ve bankanın bir alan eklemesi
-- canlıya elle uygulanan bir migration demek olmasın
-- (20260925130801). Hangi alanların istendiği yine kodda:
-- lib/payments/saglayicilar.ts.
-- ============================================================

alter table public.organization_payment_providers
  add column if not exists identifiers jsonb not null default '{}'::jsonb;

comment on column public.organization_payment_providers.identifiers is
  'Sır OLMAYAN kimlik alanları (örn. Garanti terminal numarası): alan adı → düz metin. Ekranda gösterilir. Sırlar credentials_enc''te.';

-- Düz metin ama denetimsiz değil: yalnızca nesne, en fazla 8 alan,
-- değerler kısa ve dar bir desende. Buraya yanlışlıkla bir sır
-- yapıştırılırsa uzunluk sınırına takılsın ve ekranda görünmeden önce
-- reddedilsin.
--
-- Denetim bir FONKSİYONDA: CHECK kısıtı alt sorgu içeremez (0A000) ve
-- hem "alan sayısı" hem "her değer" denetimi alt sorgu istiyor. Aynı
-- tablodaki credentials_enc de bu kalıpla denetleniyor
-- (private.arvo_sifreli_harita_mi).
create or replace function private.arvo_gorunur_harita_mi(deger jsonb)
 returns boolean
 language sql
 immutable
 set search_path to ''
as $function$
  select jsonb_typeof(deger) = 'object'
     and (select count(*) from jsonb_object_keys(deger)) <= 8
     and not exists (
       select 1
       from jsonb_each(deger) as alan(anahtar, icerik)
       where jsonb_typeof(icerik) <> 'string'
          or (icerik #>> '{}') !~ '^[A-Za-z0-9._-]{1,64}$'
     );
$function$;

comment on function private.arvo_gorunur_harita_mi(jsonb) is
  'identifiers haritasının biçim denetimi: nesne, en fazla 8 alan, değerler 1-64 karakter [A-Za-z0-9._-].';

-- Postgres yeni fonksiyonu PUBLIC'e açık oluşturuyor; önce kapatılıyor.
-- Yetkiler arvo_sifreli_harita_mi ile aynı: satırı yazan roller.
revoke all on function private.arvo_gorunur_harita_mi(jsonb) from public;
grant execute on function private.arvo_gorunur_harita_mi(jsonb) to authenticated;
grant execute on function private.arvo_gorunur_harita_mi(jsonb) to service_role;

alter table public.organization_payment_providers
  drop constraint if exists organization_payment_providers_identifiers_check;

alter table public.organization_payment_providers
  add constraint organization_payment_providers_identifiers_check
  check (private.arvo_gorunur_harita_mi(identifiers));

-- Geri almak için:
-- alter table public.organization_payment_providers
--   drop constraint if exists organization_payment_providers_identifiers_check,
--   drop column if exists identifiers;
-- drop function if exists private.arvo_gorunur_harita_mi(jsonb);
