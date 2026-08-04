-- Müşterilerin kendi alan adlarını bağlayabilmesi için: doğrulama
-- durumu ve gereken DNS kayıtlarını tutan alanlar, ve gelen isteğin
-- alan adına göre hangi kuruma ait olduğunu bulan (RLS'i atlayan,
-- sadece organization_id döndüren) güvenli bir arama fonksiyonu.

alter table public.organizations
  add column if not exists custom_domain_status text check (custom_domain_status in ('pending','verified','failed')),
  add column if not exists custom_domain_verification jsonb,
  add column if not exists custom_domain_updated_at timestamptz;

create unique index if not exists organizations_custom_domain_unique_idx
  on public.organizations (lower(custom_domain))
  where custom_domain is not null;

create or replace function public.resolve_organization_by_domain(p_domain text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.organizations
  where lower(custom_domain) = lower(trim(p_domain))
    and custom_domain_status = 'verified'
  limit 1;
$$;

revoke all on function public.resolve_organization_by_domain(text) from public;
grant execute on function public.resolve_organization_by_domain(text) to anon, authenticated;
