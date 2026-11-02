/*
  KONSOL: PAKET LİMİTLERİ VE KADEMELİ KURUCU YETKİSİ (02.11.2026).

  1) platform_paket_limitleri — ArvoOS paketlerinin varsayılan limitleri
     (dahil kullanıcı, depolama, AI kredisi). Değerler private.
     default_license_limits'in içine yazılıydı: değiştirmek bir migration
     ve kodda ikinci bir kopya (lib/paket-limitleri) demekti. Artık konsoldan
     (Ürünler ve Fiyatlar → Fiyatlar → Paket limitleri) düzenleniyor.
     İşlev önce bu tabloya bakıyor; satır yoksa eski sabit değer geçerli —
     tablo boşalırsa yeni kiracı limitsiz kalmasın.

     Yalnızca YENİ kiracıyı etkiler: mevcut lisansların limiti satırlarında
     yazılı ve değişmiyor (pazarlıkla değişmiş limitler var).

  2) platform_kurucu_alanlari — kademeli kurucu yetkisi. Satırı olmayan
     kurucu TAM yetkili (bugünkü durum, geriye uyumlu). Satırı olan kurucu
     konsolda yalnızca yazılı alanları görür: musteriler, finans, destek,
     urunler, sistem.

     Kısıtı yalnızca TAM yetkili kurucu yazar ve KENDİ satırını yazamaz:
     böylece en az bir tam yetkili kurucu her zaman kalır (yazanın kendisi)
     ve kısıtlı kurucu kendi kısıtını kaldıramaz.

     SINIR UYGULAMA KATMANINDA: sayfa, sunucu işlemi ve dock alanı okuyor.
     Veritabanı politikaları (private.is_arvoos_founder) kısıtlı kurucuyu
     hâlâ kurucu sayıyor; alanı veritabanına taşımak kurucu politikası olan
     her tabloyu yeniden yazmak demek. Kısıt bir güven sınırı değil, iş
     bölümü: konsola giren herkes ArvoOS kurumunun sahibi.
*/

create table if not exists public.platform_paket_limitleri (
  plan_code public.plan_code primary key,
  user_limit integer not null check (user_limit between 1 and 100000),
  storage_limit_mb bigint not null check (storage_limit_mb between 1 and 100000000),
  ai_credit_limit bigint not null check (ai_credit_limit between 0 and 100000000),
  guncelleyen uuid references auth.users(id) on delete set null,
  guncellendi timestamptz not null default now()
);

/* Bugünkü değerler: canlıda hiçbir kiracının varsayılanı değişmesin. */
insert into public.platform_paket_limitleri (plan_code, user_limit, storage_limit_mb, ai_credit_limit) values
  ('starter', 3, 5120, 500),
  ('professional', 15, 51200, 2500),
  ('enterprise', 250, 512000, 10000)
on conflict (plan_code) do nothing;

alter table public.platform_paket_limitleri enable row level security;
revoke all on public.platform_paket_limitleri from public, anon, authenticated;
/* Satırlar sabit (üç paket): ekleme ve silme yok, yalnızca güncelleme. */
grant select, update on public.platform_paket_limitleri to authenticated;

drop policy if exists "Paket limitlerini kurucu okur" on public.platform_paket_limitleri;
create policy "Paket limitlerini kurucu okur" on public.platform_paket_limitleri for select to authenticated
  using ((select private.is_arvoos_founder()));
drop policy if exists "Paket limitini kurucu günceller" on public.platform_paket_limitleri;
create policy "Paket limitini kurucu günceller" on public.platform_paket_limitleri for update to authenticated
  using ((select private.is_arvoos_founder()))
  with check ((select private.is_arvoos_founder()) and guncelleyen = (select auth.uid()));

/*
  IMMUTABLE → STABLE: işlev artık bir tablo okuyor. Çağıran tek yer
  create_default_organization_license (security definer, sahibi olarak
  çalışıyor); tablonun RLS'i ona takılmıyor.
*/
create or replace function private.default_license_limits(p_plan public.plan_code)
 returns jsonb
 language sql
 stable
 set search_path to ''
as $function$
  select coalesce(
    (select jsonb_build_object('user_limit', l.user_limit, 'storage_limit_mb', l.storage_limit_mb, 'ai_credit_limit', l.ai_credit_limit)
       from public.platform_paket_limitleri l where l.plan_code = p_plan),
    case p_plan
      when 'starter'::public.plan_code then jsonb_build_object('user_limit', 3, 'storage_limit_mb', 5120, 'ai_credit_limit', 500)
      when 'professional'::public.plan_code then jsonb_build_object('user_limit', 15, 'storage_limit_mb', 51200, 'ai_credit_limit', 2500)
      else jsonb_build_object('user_limit', 250, 'storage_limit_mb', 512000, 'ai_credit_limit', 10000)
    end);
$function$;
revoke all on function private.default_license_limits(public.plan_code) from public, anon, authenticated;

create table if not exists public.platform_kurucu_alanlari (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alanlar text[] not null check (
    cardinality(alanlar) between 1 and 5
    and alanlar <@ array['musteriler', 'finans', 'destek', 'urunler', 'sistem']::text[]
  ),
  guncelleyen uuid references auth.users(id) on delete set null,
  guncellendi timestamptz not null default now()
);

/*
  Politikanın kendi tablosuna bakması RLS'te sonsuz döngü yapar; soruyu
  security definer bir yardımcı soruyor. RLS politikasında kullanıldığı
  için authenticated'a açık (AGENTS.md: politika yardımcıları açık kalır).
*/
create or replace function private.kurucu_tam_yetkili()
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select private.is_arvoos_founder()
     and not exists (select 1 from public.platform_kurucu_alanlari k where k.user_id = (select auth.uid()));
$function$;
revoke all on function private.kurucu_tam_yetkili() from public, anon, authenticated;
grant execute on function private.kurucu_tam_yetkili() to authenticated;

alter table public.platform_kurucu_alanlari enable row level security;
revoke all on public.platform_kurucu_alanlari from public, anon, authenticated;
grant select, insert, update, delete on public.platform_kurucu_alanlari to authenticated;

/* Kısıtlı kurucu kendi satırını okumalı: konsol alanlarını oradan öğreniyor. */
drop policy if exists "Kurucu alanlarını kurucu okur" on public.platform_kurucu_alanlari;
create policy "Kurucu alanlarını kurucu okur" on public.platform_kurucu_alanlari for select to authenticated
  using ((select private.is_arvoos_founder()));
drop policy if exists "Kurucu alanını tam yetkili yazar" on public.platform_kurucu_alanlari;
create policy "Kurucu alanını tam yetkili yazar" on public.platform_kurucu_alanlari for insert to authenticated
  with check ((select private.kurucu_tam_yetkili()) and user_id <> (select auth.uid()) and guncelleyen = (select auth.uid()));
drop policy if exists "Kurucu alanını tam yetkili günceller" on public.platform_kurucu_alanlari;
create policy "Kurucu alanını tam yetkili günceller" on public.platform_kurucu_alanlari for update to authenticated
  using ((select private.kurucu_tam_yetkili()) and user_id <> (select auth.uid()))
  with check ((select private.kurucu_tam_yetkili()) and user_id <> (select auth.uid()) and guncelleyen = (select auth.uid()));
drop policy if exists "Kurucu alanını tam yetkili kaldırır" on public.platform_kurucu_alanlari;
create policy "Kurucu alanını tam yetkili kaldırır" on public.platform_kurucu_alanlari for delete to authenticated
  using ((select private.kurucu_tam_yetkili()) and user_id <> (select auth.uid()));
