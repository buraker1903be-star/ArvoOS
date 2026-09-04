-- CRM kayıt geçmişi.
--
-- Not: bu migration hiçbir şeyin var olduğunu varsaymıyor.
-- activity_logs tablosu repodaki 20260731_000001_arvoos_core.sql içinde
-- tanımlı olmasına rağmen canlı veritabanında yoktu — yani şema ile
-- migration dosyaları bir noktada ayrışmış. Bu yüzden tablo, indeks,
-- yetkiler ve politikalar tek tek kontrol edilerek oluşturuluyor.
-- Migration tekrar tekrar çalıştırılabilir (idempotent).

-- ---------------------------------------------------------------
-- 1) Tablo
-- ---------------------------------------------------------------
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_organization_created_idx
  on public.activity_logs (organization_id, created_at desc);

create index if not exists activity_logs_entity_idx
  on public.activity_logs (organization_id, entity_type, entity_id, created_at desc);

-- Geçmiş sorgusu metadata @> '{"opportunity_id": "..."}' ile filtreliyor.
create index if not exists activity_logs_metadata_idx
  on public.activity_logs using gin (metadata jsonb_path_ops);

alter table public.activity_logs enable row level security;
revoke all on public.activity_logs from public, anon;
grant select, insert on public.activity_logs to authenticated;

-- ---------------------------------------------------------------
-- 2) Ekleme politikası
--    Kullanıcı yalnızca kendi adına ve üyesi olduğu kurumda kayıt açabilir.
-- ---------------------------------------------------------------
drop policy if exists activity_logs_insert on public.activity_logs;
create policy activity_logs_insert
on public.activity_logs for insert to authenticated
with check (
  actor_user_id = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = activity_logs.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
  )
);

-- ---------------------------------------------------------------
-- 3) Okuma politikası — CRM zinciri
--
--    arvo_can_access_opportunity varsa onu kullanıyoruz (atanmış kayıt
--    kısıtını korumak için). Yoksa kurum üyeliğine düşüyoruz; böylece
--    fonksiyonun bulunmadığı bir şemada migration patlamıyor.
-- ---------------------------------------------------------------
do $do$
declare
  has_helper boolean;
begin
  select exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'arvo_can_access_opportunity'
  ) into has_helper;

  execute 'drop policy if exists activity_logs_select_crm_chain on public.activity_logs';

  execute format($f$
    create policy activity_logs_select_crm_chain
    on public.activity_logs for select to authenticated
    using (
      entity_type in ('crm_opportunity', 'crm_proposal', 'crm_contract')
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = activity_logs.organization_id
          and m.user_id = (select auth.uid())
          and m.is_active = true
      )
      and exists (
        select 1 from public.crm_opportunities o
        where o.organization_id = activity_logs.organization_id
          and o.id::text = coalesce(
            activity_logs.metadata ->> 'opportunity_id',
            activity_logs.entity_id
          )
          %s
      )
    )
  $f$, case when has_helper
            then 'and private.arvo_can_access_opportunity(o.id)'
            else '' end);
end
$do$;

comment on table public.activity_logs is
  'Kurum genelinde kim neyi ne zaman değiştirdi kaydı. CRM detay sayfalarındaki "Kayıt Geçmişi" bölümü buradan okur.';
