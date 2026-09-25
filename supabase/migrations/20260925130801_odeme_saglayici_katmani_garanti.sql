-- ============================================================
-- Ödeme sağlayıcısı katmanı: Garanti BBVA bir sağlayıcı olarak tanınıyor
--
-- Bugün ödeme altyapısının tamamı TEK bir sağlayıcıya çivilenmiş durumda:
-- yedi ayrı CHECK kısıtı "provider = 'paytr'" diyor ve kimlik bilgileri
-- PayTR'nin alan adlarıyla sütunlaşmış (merchant_key_enc, merchant_salt_enc).
-- Garanti'nin ihtiyacı başka: Üye İşyeri No, Terminal No, PROVAUT kullanıcı
-- ve şifresi, 3D StoreKey, bir de test/canlı kipi — iki alan değil beş.
--
-- Bu migration sağlayıcıyı bir DEĞİŞKEN hâline getiriyor; Garanti'nin
-- protokolü (3D motoru, provizyon XML'i, tekrarlı ödeme) ayrı bir işte.
--
-- ---------- Kimlik bilgileri neden sütun değil de harita ----------
--
-- credentials_enc bir jsonb: alan adı → AES-256-GCM ile şifrelenmiş değer
-- (lib/payment-credentials.ts). Her sağlayıcı kendi alanlarını getiriyor ve
-- hangi alanları istediği kodda duruyor (lib/payments/saglayicilar.ts).
-- Sütunlaştırsaydık her yeni sağlayıcı ve bankanın her alan değişikliği
-- canlıya elle uygulanan bir migration demek olurdu.
--
-- Mevcut PayTR satırları ESKİ SÜTUNLARDA DA KALIYOR. Migration'lar koddan
-- önce elle uygulanıyor: o aralıkta üretimde hâlâ eski kod çalışıyor ve
-- merchant_key_enc'i okuyor. Sütunlar yalnızca bu sürüm dağıtıldıktan
-- sonra, ayrı bir migration'la düşecek.
-- ============================================================

-- ---------- 1. Sağlayıcı artık bir değişken ----------

do $$
declare
  k record;
begin
  -- 'paytr' dışına çıkmayı yasaklayan yedi kısıt. Adları ve tablolar
  -- açıkça yazılı: bir gün başka bir tabloya da 'paytr' yazılırsa bu
  -- döngü onu sessizce açmasın.
  for k in
    select * from (values
      ('billing_customers',             'billing_customers_provider_check',              'provider',            array['manual','paytr','garanti']),
      ('billing_invoices',              'billing_invoices_provider_check',               'provider',            array['manual','paytr','garanti']),
      ('billing_subscriptions',         'billing_subscriptions_provider_check',          'provider',            array['manual','paytr','garanti']),
      ('organization_payment_providers','organization_payment_providers_provider_check', 'provider',            array['paytr','garanti']),
      ('organization_payment_requests', 'organization_payment_requests_payment_method_check', 'payment_method', array['bank_transfer','paytr','garanti']),
      ('payment_installments',          'payment_installments_payment_link_source_check', 'payment_link_source', array['paytr','garanti','manual']),
      ('payment_links',                 'payment_links_provider_check',                  'provider',            array['paytr','garanti'])
    ) as t(tablo, kisit, sutun, degerler)
  loop
    execute format('alter table public.%I drop constraint if exists %I', k.tablo, k.kisit);
    execute format('alter table public.%I add constraint %I check (%I = any (%L::text[]))',
                   k.tablo, k.kisit, k.sutun, k.degerler);
  end loop;
end $$;

-- ---------- 2. Sağlayıcıdan bağımsız kimlik bilgisi ----------

alter table public.organization_payment_providers
  add column if not exists credentials_enc jsonb not null default '{}'::jsonb,
  add column if not exists mode text not null default 'production';

comment on column public.organization_payment_providers.credentials_enc is
  'Alan adı → AES-256-GCM şifreli değer. Hangi alanların istendiği lib/payments/saglayicilar.ts''te.';
comment on column public.organization_payment_providers.mode is
  'test | production. Garanti''nin test ve canlı uçları ayrı sunucularda; yanlış kip sessizce başarısız olur.';

alter table public.organization_payment_providers drop constraint if exists organization_payment_providers_mode_check;
alter table public.organization_payment_providers
  add constraint organization_payment_providers_mode_check check (mode in ('test', 'production'));

/*
  Haritanın her değeri ŞİFRELİ metin olmalı: biçim "v1:iv:etiket:veri"
  (lib/payment-credentials.ts). Kural, düz metin bir sırrın yanlışlıkla
  yazılmasını veritabanında durduruyor — koddaki bir unutkanlık veritabanına
  düz parola bırakamasın.

  Denetim bir fonksiyonda çünkü CHECK içinde alt sorgu kullanılamıyor;
  jsonb'nin bütün alanlarını gezmenin başka yolu yok.
*/
create or replace function private.arvo_sifreli_harita_mi(deger jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select jsonb_typeof(deger) = 'object'
     and not exists (
       select 1
       from jsonb_each(deger) as alan(anahtar, icerik)
       where jsonb_typeof(icerik) <> 'string'
          or (icerik #>> '{}') !~ '^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$'
     );
$$;

-- Kısıt YAZAN rolün yetkisiyle çalışır; tablo yalnızca service_role'e açık
-- ama authenticated bir gün yazarsa kısıt "permission denied" ile düşmesin.
revoke all on function private.arvo_sifreli_harita_mi(jsonb) from public, anon;
grant execute on function private.arvo_sifreli_harita_mi(jsonb) to authenticated, service_role;

alter table public.organization_payment_providers drop constraint if exists organization_payment_providers_credentials_check;
alter table public.organization_payment_providers
  add constraint organization_payment_providers_credentials_check
    check (private.arvo_sifreli_harita_mi(credentials_enc));

/*
  Mevcut PayTR satırları haritaya taşınıyor. Eski sütunlar da duruyor
  (yukarıdaki gerekçe); kod bu sürümden sonra yalnızca haritayı okuyor.
*/
update public.organization_payment_providers
set credentials_enc = jsonb_build_object('merchant_key', merchant_key_enc, 'merchant_salt', merchant_salt_enc)
where provider = 'paytr'
  and credentials_enc = '{}'::jsonb
  and merchant_key_enc is not null and merchant_salt_enc is not null;

-- Garanti satırında bu iki sütunun karşılığı yok.
alter table public.organization_payment_providers alter column merchant_key_enc drop not null;
alter table public.organization_payment_providers alter column merchant_salt_enc drop not null;

/*
  merchant_id yalnız rakam olamaz artık: PayTR'nin mağaza numarası rakam,
  Garanti'nin Üye İşyeri No'su da öyle, ama alan adı bankaya göre değişiyor
  ve harf içeren bir kimlik gelirse kısıt sessizce kaydı reddederdi.
  Sağlayıcıya özel sıkı denetim kodda (saglayicilar.ts).
*/
alter table public.organization_payment_providers drop constraint if exists organization_payment_providers_merchant_id_check;
alter table public.organization_payment_providers
  add constraint organization_payment_providers_merchant_id_check
    check (merchant_id ~ '^[A-Za-z0-9._-]{3,64}$');

notify pgrst, 'reload schema';
