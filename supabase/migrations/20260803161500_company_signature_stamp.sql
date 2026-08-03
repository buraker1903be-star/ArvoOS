alter table public.organizations
  add column if not exists signature_stamp_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-assets',
  'organization-assets',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "organization_assets_insert" on storage.objects;
create policy "organization_assets_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'organization-assets'
  and exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role::text in ('owner','admin')
      and m.organization_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "organization_assets_update" on storage.objects;
create policy "organization_assets_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'organization-assets'
  and exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role::text in ('owner','admin')
      and m.organization_id::text = (storage.foldername(name))[1]
  )
)
with check (
  bucket_id = 'organization-assets'
  and exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role::text in ('owner','admin')
      and m.organization_id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "organization_assets_delete" on storage.objects;
create policy "organization_assets_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'organization-assets'
  and exists (
    select 1
    from public.organization_memberships m
    where m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role::text in ('owner','admin')
      and m.organization_id::text = (storage.foldername(name))[1]
  )
);

drop function if exists public.get_public_crm_proposal(text);

create function public.get_public_crm_proposal(public_token text)
returns table(
  proposal_no text,
  title text,
  scope text,
  amount bigint,
  currency text,
  payment_plan text,
  valid_until date,
  status text,
  customer_name text,
  contact_email text,
  contact_phone text,
  organization_name text,
  tax_status text,
  net_amount bigint,
  tax_amount bigint,
  gross_amount bigint,
  organization_logo_url text,
  organization_primary_color text,
  organization_document_footer text,
  organization_contact_email text,
  organization_contact_phone text,
  organization_website_url text,
  organization_signature_stamp_url text
)
language sql
security definer
set search_path to 'public', 'extensions'
as $$
  select
    p.proposal_no,
    p.title,
    p.scope,
    p.amount,
    p.currency,
    p.payment_plan,
    p.valid_until,
    p.status,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    org.name,
    p.tax_status,
    p.net_amount,
    p.tax_amount,
    p.gross_amount,
    org.logo_url,
    org.primary_color,
    org.document_footer,
    org.contact_email,
    org.contact_phone,
    org.website_url,
    org.signature_stamp_url
  from public.crm_proposals p
  join public.crm_opportunities o on o.id = p.opportunity_id
  join public.organizations org on org.id = p.organization_id
  where p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
$$;