/*
  KURUMUN HİZMET TÜRLERİ (12.10.2026)

  Talep formundaki "Hizmet türü" listesi kodda sabitti (akademik
  hizmetler); başka işi yapan kurum kendi hizmetlerini yazamıyor, her
  talepte "Diğer"i seçip elle yazıyordu. Kurum artık listeyi Ayarlar →
  Hizmet türleri'nde yönetiyor (lib/hizmet-turleri).

  Kurum başına TEK SATIR, sıralı ad listesi. Satır yoksa koddaki eski
  liste geçerli: migration hiçbir kurumun formunu değiştirmiyor.

  Talep kaydı hizmetin ADINI tutuyor (request_details.service_type);
  burada yabancı anahtar yok, listeden silmek geçmiş kaydı etkilemez.
*/

create table if not exists public.organization_service_types (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  turler text[] not null default '{}'::text[],
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  -- lib/hizmet-turleri HIZMET_TURU_SINIRI ile aynı; boş öğe yazılamaz.
  constraint organization_service_types_sinir check (cardinality(turler) <= 60),
  constraint organization_service_types_bos_yok check (array_position(turler, null) is null)
);

alter table public.organization_service_types enable row level security;

-- Okuma: kurumun aktif üyeleri (talep formunu açan her personel listeye ihtiyaç duyar).
drop policy if exists members_read_service_types on public.organization_service_types;
create policy members_read_service_types on public.organization_service_types
  as permissive for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_service_types.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

-- Yazma: Kurum Sahibi ve Yönetici (belge metinleriyle aynı kural).
-- Panel yeteneği (settings.hizmet_turu.yonet) bunu yalnızca daraltabilir.
drop policy if exists admins_manage_service_types on public.organization_service_types;
create policy admins_manage_service_types on public.organization_service_types
  as permissive for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_service_types.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner'::public.membership_role, 'admin'::public.membership_role])
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_service_types.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner'::public.membership_role, 'admin'::public.membership_role])
  ));

revoke all on table public.organization_service_types from anon;
grant select, insert, update, delete on table public.organization_service_types to authenticated;
