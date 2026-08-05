-- İK + Ekip Yönetimi birleştirmesi için:
-- 1) Personel dosyaları (özlük) için özel (private) depolama alanı ve tablo
-- 2) Bir personel kaydından davet gönderildiğinde, davet kabul edilince
--    hr_employees.user_id otomatik bağlansın diye davet metadata'sına
--    employee_id ekleniyor; kabul tetikleyicisi de bunu okuyup bağlıyor.

insert into storage.buckets (id, name, public)
values ('hr-documents', 'hr-documents', false)
on conflict (id) do nothing;

drop policy if exists "hr_documents_select" on storage.objects;
create policy "hr_documents_select" on storage.objects for select to authenticated
using (
  bucket_id = 'hr-documents'
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = (storage.foldername(name))[1]::uuid
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
);

drop policy if exists "hr_documents_insert" on storage.objects;
create policy "hr_documents_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'hr-documents'
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = (storage.foldername(name))[1]::uuid
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
);

drop policy if exists "hr_documents_delete" on storage.objects;
create policy "hr_documents_delete" on storage.objects for delete to authenticated
using (
  bucket_id = 'hr-documents'
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = (storage.foldername(name))[1]::uuid
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
);

create table if not exists public.hr_employee_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  file_name text not null check (char_length(file_name) between 1 and 255),
  storage_path text not null,
  file_size bigint,
  content_type text,
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists hr_employee_documents_employee_idx on public.hr_employee_documents (employee_id, created_at desc);

alter table public.hr_employee_documents enable row level security;
grant select, insert, delete on public.hr_employee_documents to authenticated;

drop policy if exists "hr_employee_documents_select" on public.hr_employee_documents;
create policy "hr_employee_documents_select" on public.hr_employee_documents for select to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = hr_employee_documents.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
);

drop policy if exists "hr_employee_documents_insert" on public.hr_employee_documents;
create policy "hr_employee_documents_insert" on public.hr_employee_documents for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = hr_employee_documents.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
);

drop policy if exists "hr_employee_documents_delete" on public.hr_employee_documents;
create policy "hr_employee_documents_delete" on public.hr_employee_documents for delete to authenticated
using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = hr_employee_documents.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
);

-- Davet kabul edildiğinde, davetin bağlı olduğu personel kaydına
-- (varsa) kullanıcı hesabını otomatik bağla.
create or replace function private.activate_organization_owner_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
  invitation public.organization_invitations%rowtype;
  employee_id uuid;
begin
  if new.email_confirmed_at is null or old.email_confirmed_at is not null then return new; end if;
  invitation_id := nullif(new.raw_user_meta_data ->> 'arvoos_invitation_id', '')::uuid;
  if invitation_id is null then return new; end if;

  select * into invitation from public.organization_invitations
  where id = invitation_id and lower(email) = lower(new.email) and status in ('pending','sent') and expires_at > now()
  for update;
  if not found then return new; end if;

  insert into public.profiles (id, full_name, updated_at)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), now())
  on conflict (id) do update set updated_at = excluded.updated_at;

  insert into public.organization_memberships (organization_id, user_id, role, is_active)
  values (invitation.organization_id, new.id, invitation.role, true)
  on conflict (organization_id, user_id) do update set role = excluded.role, is_active = true;

  employee_id := nullif(new.raw_user_meta_data ->> 'arvoos_employee_id', '')::uuid;
  if employee_id is not null then
    update public.hr_employees
    set user_id = new.id
    where id = employee_id and organization_id = invitation.organization_id;
  end if;

  update public.organization_invitations
  set status = 'accepted', auth_user_id = new.id, accepted_at = now(), updated_at = now(), error_message = null
  where id = invitation.id;
  return new;
end;
$$;
