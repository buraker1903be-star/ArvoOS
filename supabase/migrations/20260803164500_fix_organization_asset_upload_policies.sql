create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.can_manage_organization_assets(organization_id_text text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role::text in ('owner', 'admin')
      and m.organization_id::text = organization_id_text
  );
$$;

revoke all on function private.can_manage_organization_assets(text) from public;
grant execute on function private.can_manage_organization_assets(text) to authenticated;

drop policy if exists "organization_assets_select" on storage.objects;
create policy "organization_assets_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'organization-assets'
  and private.can_manage_organization_assets((storage.foldername(name))[1])
);

drop policy if exists "organization_assets_insert" on storage.objects;
create policy "organization_assets_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-assets'
  and private.can_manage_organization_assets((storage.foldername(name))[1])
);

drop policy if exists "organization_assets_update" on storage.objects;
create policy "organization_assets_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-assets'
  and private.can_manage_organization_assets((storage.foldername(name))[1])
)
with check (
  bucket_id = 'organization-assets'
  and private.can_manage_organization_assets((storage.foldername(name))[1])
);

drop policy if exists "organization_assets_delete" on storage.objects;
create policy "organization_assets_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-assets'
  and private.can_manage_organization_assets((storage.foldername(name))[1])
);