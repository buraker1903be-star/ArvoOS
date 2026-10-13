/*
  İŞİN EKİP İÇİ DOSYALARI (13.10.2026) — sahadan fotoğraf/belge.

  İşe dosya eklemenin tek yolu "Müşteri portalı dosyaları"ydı
  (20260912203000): eklenen her dosya müşteriye açılıyordu (hemen ya da
  ödeme tamamlanınca). Sahadaki personel çektiği fotoğrafı ya da belgeyi
  yalnızca ekiple paylaşamıyordu. Kurum sahibinin tarifi: "fotoğrafı ya
  da belgeyi doğrudan işe VEYA müşteriye eklemek". Bu tablo "işe": müşteri
  görmez, takip ekranında yoktur.

  Güvenlik kurgusu müşteri dosyalarıyla birebir aynı:
  - Özel kova; yolun ilk iki klasörü kurum ve iş, ikisi de gerçek ve
    aynı kurumda (kova politikası).
  - Erişim private.arvo_can_access_workflow: yönetici/müdür ya da işin
    sorumlusu — işi göremeyen dosyasını da göremez.
  - Yükleyen ve tarih sunucuda damgalanır; dosyanın kendisi
    değiştirilemez, yalnızca notu. Silme geri alınamaz işarettir
    (deleted_at); nesne kovada kalır, kayıt listeden düşer.

  Sınırlar müşteri dosyalarıyla aynı (50 MB, aynı türler): istemcideki
  kurallar (portal-files-shared.ts) iki yükleme yolu için ortak.
*/

-- 1) Kova --------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'operation-team-files',
  'operation-team-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip-compressed',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "operation_team_files_select" on storage.objects;
create policy "operation_team_files_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'operation-team-files'
  and exists (
    select 1 from public.operation_workflows w
    where w.organization_id::text = (storage.foldername(name))[1]
      and w.id::text = (storage.foldername(name))[2]
      and private.arvo_can_access_workflow(w.id)
  )
);

drop policy if exists "operation_team_files_insert" on storage.objects;
create policy "operation_team_files_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'operation-team-files'
  and exists (
    select 1 from public.operation_workflows w
    where w.organization_id::text = (storage.foldername(name))[1]
      and w.id::text = (storage.foldername(name))[2]
      and private.arvo_can_access_workflow(w.id)
  )
);

-- Yalnızca kaydı oluşturulamayan yarım yüklemelerin temizliği için.
drop policy if exists "operation_team_files_delete" on storage.objects;
create policy "operation_team_files_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'operation-team-files'
  and exists (
    select 1 from public.operation_workflows w
    where w.organization_id::text = (storage.foldername(name))[1]
      and w.id::text = (storage.foldername(name))[2]
      and private.arvo_can_access_workflow(w.id)
  )
);

-- 2) Dosya kayıtları -----------------------------------------------------------
create table if not exists public.operation_team_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.operation_workflows(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (char_length(mime_type) between 3 and 120),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  note text check (note is null or char_length(note) <= 500),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint operation_team_files_path_scope
    check (storage_path like organization_id::text || '/' || workflow_id::text || '/%')
);

create index if not exists operation_team_files_workflow_idx
  on public.operation_team_files(organization_id, workflow_id, created_at desc)
  where deleted_at is null;

create or replace function public.guard_operation_team_file()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := (select auth.uid());
    new.created_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'Kaldırılan dosya değiştirilemez.' using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.workflow_id is distinct from old.workflow_id
     or new.storage_path is distinct from old.storage_path
     or new.file_name is distinct from old.file_name
     or new.mime_type is distinct from old.mime_type
     or new.size_bytes is distinct from old.size_bytes
     or new.uploaded_by is distinct from old.uploaded_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Dosyanın yalnızca notu değiştirilebilir.' using errcode = 'check_violation';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := (select auth.uid());
  else
    new.deleted_by := null;
  end if;
  return new;
end $$;

revoke all on function public.guard_operation_team_file() from public, anon, authenticated;

drop trigger if exists guard_operation_team_file on public.operation_team_files;
create trigger guard_operation_team_file
before insert or update on public.operation_team_files
for each row execute function public.guard_operation_team_file();

alter table public.operation_team_files enable row level security;
revoke all on table public.operation_team_files from public, anon, authenticated;
grant select, insert on table public.operation_team_files to authenticated;
grant update (note, deleted_at) on table public.operation_team_files to authenticated;
grant all on table public.operation_team_files to service_role;

drop policy if exists "workflow_members_read_team_files" on public.operation_team_files;
create policy "workflow_members_read_team_files"
on public.operation_team_files for select to authenticated
using (private.arvo_can_access_workflow(workflow_id));

drop policy if exists "workflow_members_add_team_files" on public.operation_team_files;
create policy "workflow_members_add_team_files"
on public.operation_team_files for insert to authenticated
with check (
  private.arvo_can_access_workflow(workflow_id)
  and exists (
    select 1 from public.operation_workflows w
    where w.id = operation_team_files.workflow_id
      and w.organization_id = operation_team_files.organization_id
  )
);

drop policy if exists "workflow_members_update_team_files" on public.operation_team_files;
create policy "workflow_members_update_team_files"
on public.operation_team_files for update to authenticated
using (private.arvo_can_access_workflow(workflow_id) and deleted_at is null)
with check (private.arvo_can_access_workflow(workflow_id));
