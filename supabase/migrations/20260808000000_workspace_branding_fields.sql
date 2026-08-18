-- Panel navigasyonunda (mobil menü ve masaüstü kenar çubuğu) artık
-- sabit "ArvoOS" markası yerine, kurumun kendi logosu ve tabela unvanı
-- gösterilebilsin diye bu bilgileri de döndürüyoruz. Bu, beyaz etiket
-- (white-label) deneyiminin panel içinde de tutarlı olmasını sağlar —
-- login ekranı ve müşteri sözleşme sayfaları zaten aynı mantığı kullanıyor.

drop function if exists public.get_my_workspaces();

create or replace function public.get_my_workspaces()
returns table(
  organization_id uuid, role text, id uuid, name text, slug text,
  status text, plan_code text, sector text, custom_domain text,
  logo_url text, display_name text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select
    m.organization_id,
    m.role::text,
    o.id,
    o.name,
    o.slug,
    o.status,
    o.plan_code,
    o.sector,
    o.custom_domain,
    o.logo_url,
    o.display_name
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
    and m.is_active = true
    and o.status = 'active'
  order by case when o.slug = 'akademikmerkez' then 0 when o.slug = 'arvo-os' then 1 else 2 end,
           o.name;
$function$;

revoke all on function public.get_my_workspaces() from public;
grant execute on function public.get_my_workspaces() to authenticated;
