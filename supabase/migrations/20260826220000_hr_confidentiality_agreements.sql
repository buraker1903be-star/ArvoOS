create table if not exists public.hr_confidentiality_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  agreement_no text not null unique,
  agreement_version text not null,
  content_snapshot text not null,
  status text not null default 'pending' check (status in ('pending','signed','revoked')),
  signer_name text,
  signature_path text,
  signer_ip inet,
  signer_user_agent text,
  signed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, agreement_version)
);

create index if not exists hr_confidentiality_org_status_idx on public.hr_confidentiality_agreements (organization_id,status,created_at desc);
alter table public.hr_confidentiality_agreements enable row level security;

grant select,insert on public.hr_confidentiality_agreements to authenticated;
grant update (status,signer_name,signature_path,signer_ip,signer_user_agent,signed_at,updated_at) on public.hr_confidentiality_agreements to authenticated;
revoke all on public.hr_confidentiality_agreements from anon;

drop policy if exists "confidentiality_select_manager_or_self" on public.hr_confidentiality_agreements;
drop policy if exists "confidentiality_insert_manager" on public.hr_confidentiality_agreements;
drop policy if exists "confidentiality_sign_self" on public.hr_confidentiality_agreements;

create policy "confidentiality_select_manager_or_self" on public.hr_confidentiality_agreements
for select to authenticated using (
  exists (select 1 from public.organization_memberships m where m.organization_id=hr_confidentiality_agreements.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin','manager'))
  or exists (select 1 from public.hr_employees e where e.id=hr_confidentiality_agreements.employee_id and e.user_id=(select auth.uid()))
);

create policy "confidentiality_insert_manager" on public.hr_confidentiality_agreements
for insert to authenticated with check (
  exists (select 1 from public.organization_memberships m where m.organization_id=hr_confidentiality_agreements.organization_id and m.user_id=(select auth.uid()) and m.is_active=true and m.role::text in ('owner','admin'))
);

create policy "confidentiality_sign_self" on public.hr_confidentiality_agreements
for update to authenticated using (
  status='pending' and exists (select 1 from public.hr_employees e where e.id=hr_confidentiality_agreements.employee_id and e.user_id=(select auth.uid()))
) with check (
  status='signed' and signature_path is not null and signed_at is not null
  and exists (select 1 from public.hr_employees e where e.id=hr_confidentiality_agreements.employee_id and e.user_id=(select auth.uid()))
);

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('hr-confidentiality-signatures','hr-confidentiality-signatures',false,524288,array['image/png'])
on conflict (id) do update set public=false,file_size_limit=524288,allowed_mime_types=array['image/png'];

drop policy if exists "confidentiality_signature_upload_self" on storage.objects;
drop policy if exists "confidentiality_signature_read_managers" on storage.objects;

create policy "confidentiality_signature_upload_self" on storage.objects
for insert to authenticated with check (
  bucket_id='hr-confidentiality-signatures'
  and exists (
    select 1 from public.hr_employees e
    where e.id::text=(storage.foldername(name))[2]
      and e.organization_id::text=(storage.foldername(name))[1]
      and e.user_id=(select auth.uid())
  )
);

create policy "confidentiality_signature_read_managers" on storage.objects
for select to authenticated using (
  bucket_id='hr-confidentiality-signatures'
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id::text=(storage.foldername(name))[1]
      and m.user_id=(select auth.uid()) and m.is_active=true
      and m.role::text in ('owner','admin','manager')
  )
);
