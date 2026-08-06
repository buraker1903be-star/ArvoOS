-- Herkese açık sayfalar (durum sorgulama, özel alan adı üzerinden erişim)
-- organizations tablosuna doğrudan anonim erişmeye çalışıyordu; bu tablo
-- RLS ile üye olmayanlara kapalıysa sayfa hiç açılmaz. Diğer herkese açık
-- sayfalarda (teklif/sözleşme) olduğu gibi, sadece marka bilgisini
-- döndüren güvenli bir fonksiyon üzerinden erişiyoruz.

create or replace function public.get_public_organization_branding(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  primary_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, slug, name, logo_url, primary_color
  from public.organizations
  where slug = lower(trim(p_slug))
  limit 1;
$$;

revoke all on function public.get_public_organization_branding(text) from public;
grant execute on function public.get_public_organization_branding(text) to anon, authenticated;

create or replace function public.get_public_organization_branding_by_id(p_org_id uuid)
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text,
  primary_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select id, slug, name, logo_url, primary_color
  from public.organizations
  where id = p_org_id
  limit 1;
$$;

revoke all on function public.get_public_organization_branding_by_id(uuid) from public;
grant execute on function public.get_public_organization_branding_by_id(uuid) to anon, authenticated;
