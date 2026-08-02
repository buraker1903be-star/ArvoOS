create table if not exists public.organization_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 180),
  category text not null default 'general' check (category in ('general','contract','invoice','proposal','hr','operation','finance')),
  status text not null default 'active' check (status in ('draft','active','archived')),
  external_url text,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_documents enable row level security;
grant select,insert,update on public.organization_documents to authenticated;

create policy "members_read_own_documents" on public.organization_documents for select to authenticated using (exists (
  select 1 from public.organization_memberships m
  where m.organization_id=organization_documents.organization_id
    and m.user_id=(select auth.uid()) and m.is_active
));
create policy "admins_manage_documents" on public.organization_documents for all to authenticated using (exists (
  select 1 from public.organization_memberships m
  where m.organization_id=organization_documents.organization_id
    and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_memberships m
  where m.organization_id=organization_documents.organization_id
    and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
));

insert into public.arvo_modules(code,name,description,sort_order,is_active)
values('documents','Dokümanlar','Kurum belgeleri, sözleşmeler ve arşiv yönetimi',65,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,is_active=true;
insert into public.organization_modules(organization_id,module_code,is_enabled)
select id,'documents',true from public.organizations
on conflict(organization_id,module_code) do update set is_enabled=true;

create index if not exists organization_documents_org_status_idx
  on public.organization_documents(organization_id,status,category,created_at desc);