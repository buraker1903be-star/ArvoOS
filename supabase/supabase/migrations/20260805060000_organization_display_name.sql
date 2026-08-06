-- Kurumun yasal unvanı (name) ile müşteriye/panele görünecek marka adı
-- (tabela unvanı) her zaman aynı olmayabilir — özellikle ArvoOS'u
-- kendi markasıyla kullanan (özel alan adına sahip) müşteriler için.
-- display_name boşsa, her yerde otomatik olarak name'e düşülür.

alter table public.organizations
  add column if not exists display_name text;

comment on column public.organizations.display_name is 'Panelde/giriş ekranında/müşteri sayfalarında gösterilecek tabela unvanı. Boşsa "name" kullanılır.';

-- Herkese açık marka bilgisi fonksiyonları artık tabela unvanını
-- (varsa) yasal unvana tercih eder.
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
  select id, slug, coalesce(display_name, name) as name, logo_url, primary_color
  from public.organizations
  where slug = lower(trim(p_slug))
  limit 1;
$$;

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
  select id, slug, coalesce(display_name, name) as name, logo_url, primary_color
  from public.organizations
  where id = p_org_id
  limit 1;
$$;
