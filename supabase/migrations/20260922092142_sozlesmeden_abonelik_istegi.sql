-- ============================================================
-- Sözleşme → abonelik isteği
--
-- Bugüne kadar kopuk olan halka: satış temsilcisi app.arvo-os.com'da yeni
-- bir müşteriye teklif hazırlıyor, müşteri imzalıyor — ve konsolda hiçbir
-- şey olmuyor. Kiracı elle açılıyor, lisans elle veriliyor, iki taraf
-- birbirini bilmiyor.
--
-- KAPSAM, bu migration'ın en önemli kararı: yalnızca ARVO'NUN KENDİ
-- KURUMUNDA (organizations.kind = 'internal') imzalanan sözleşmeler
-- konsola düşer. Kiracının kendi müşterisiyle imzaladığı sözleşme onun
-- işidir ve konsolda görünmemelidir. Bu ayrımı atlamak, billing_invoices
-- hatasının aynısı olurdu: kiracının cirosunu platformun işi sanmak.
--
-- İMZA MODÜLÜ AÇMAZ. İstek kuyruğa girer, kurucu tahsilatı doğrulayıp
-- onaylar. İkisini tek adımda birleştirmek, parası gelmemiş her
-- sözleşmenin çalışan bir kiracı yaratması demekti.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Sözleşmenin hangi modülleri talep ettiği
-- ------------------------------------------------------------
alter table public.crm_contracts
  /*
    Satış tarafının doldurduğu niyet: hangi ürünler, hangi paket, hangi
    ücret. jsonb çünkü ürün sayısı ve alanları değişiyor; her ürüne sütun
    açmak beşinci üründe yine migration demek.

    Biçim:
      {"modules":[{"product":"arvolab","plan_code":"professional","monthly_fee":180000,"integrated":true}]}
    Ücret KURUŞ (AGENTS.md "Para kuruş cinsinden tamsayıdır").
  */
  add column if not exists subscription_intent jsonb;

comment on column public.crm_contracts.subscription_intent is
  'Sözleşmenin talep ettiği modüller ve ücretler. Yalnızca Arvo''nun kendi kurumundaki sözleşmelerde anlamlı.';

-- ------------------------------------------------------------
-- 2. Onay kuyruğu
-- ------------------------------------------------------------
create table if not exists public.platform_subscription_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.crm_contracts(id) on delete cascade,
  -- Sözleşmenin yazıldığı kurum (Arvo). Kapsam denetimi için saklanıyor.
  source_organization_id uuid not null references public.organizations(id) on delete cascade,
  /*
    Aboneliğin açılacağı kiracı. İmza anında BİLİNMİYOR: sözleşmedeki
    müşteri bir isim, kiracı kaydı henüz yok olabilir. Kurucu onaylarken
    seçiyor ya da yeni kiracı açıyor.
  */
  target_organization_id uuid references public.organizations(id) on delete set null,
  customer_name text,
  contract_no text,
  amount bigint,
  currency text not null default 'TRY',
  -- Sözleşmeden kopyalanır; sözleşme sonradan değişse bile istek ne
  -- talep edildiğini hatırlasın.
  requested jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_subscription_requests is
  'İmzalı sözleşme ile açılmış lisans arasındaki ara durak. İmza modülü açmaz; kurucu tahsilatı doğrulayıp onaylar.';

-- Aynı sözleşme iki kez kuyruğa girmesin: tetikleyici her durum
-- güncellemesinde çalışıyor ve imzalı bir sözleşme yeniden kaydedilebilir.
create unique index if not exists platform_subscription_requests_sozlesme_uniq
  on public.platform_subscription_requests (contract_id);

create index if not exists platform_subscription_requests_bekleyen_idx
  on public.platform_subscription_requests (created_at desc)
  where status = 'pending';

alter table public.platform_subscription_requests enable row level security;

/*
  Kuyruk yalnızca kurucuya ait. Politikasız RLS zaten kapıyı tutuyor ama
  yetkiyi de açıkça geri alıyoruz: bu tabloda başka kurumların ticari
  bilgisi duruyor ve tek savunmaya güvenmiyoruz. Konsol sunucu anahtarıyla
  okur.
*/
revoke all on table public.platform_subscription_requests from anon, authenticated;

-- ------------------------------------------------------------
-- 3. İmza tetikleyicisi
-- ------------------------------------------------------------
create or replace function private.arvo_sozlesmeden_abonelik_istegi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_kurum_turu text;
  v_musteri text;
begin
  -- Yalnızca imzaya GEÇİŞ; imzalı bir sözleşmenin her güncellemesi değil.
  if new.status is distinct from 'signed' or old.status = 'signed' then
    return new;
  end if;

  select o.kind into v_kurum_turu
  from public.organizations o
  where o.id = new.organization_id;

  /*
    Kapsam: yalnızca Arvo'nun kendi kurumundaki sözleşmeler. Kiracının
    kendi müşterisiyle imzaladığı sözleşme onun işi; konsola düşerse
    kurucu başkasının satışlarını onaylamaya çalışır.
  */
  if v_kurum_turu is distinct from 'internal' then
    return new;
  end if;

  select op.customer_name into v_musteri
  from public.crm_opportunities op
  where op.id = new.opportunity_id;

  insert into public.platform_subscription_requests (
    contract_id, source_organization_id, customer_name, contract_no,
    amount, currency, requested
  ) values (
    new.id, new.organization_id, v_musteri, new.contract_no,
    new.amount, coalesce(new.currency, 'TRY'), coalesce(new.subscription_intent, '{}'::jsonb)
  )
  -- Sözleşme yeniden imzalanamıyor (arvo_guard_contract_signature) ama
  -- tetikleyici yine de iki kez çalışabilir; kuyruk çiftlenmesin.
  on conflict (contract_id) do nothing;

  return new;
end;
$function$;

revoke all on function private.arvo_sozlesmeden_abonelik_istegi() from public, anon, authenticated;

drop trigger if exists arvo_sozlesmeden_abonelik_istegi on public.crm_contracts;
create trigger arvo_sozlesmeden_abonelik_istegi
  after update of status on public.crm_contracts
  for each row execute function private.arvo_sozlesmeden_abonelik_istegi();

notify pgrst, 'reload schema';
