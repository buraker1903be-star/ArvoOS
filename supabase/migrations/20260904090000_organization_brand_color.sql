-- Çok kiracılı beyaz etiket: her kurum kendi marka rengini seçebilsin.
--
-- Panel zaten kurumun logosunu ve tabela unvanını gösteriyordu
-- (20260808000000_workspace_branding_fields), ama vurgu rengi sabit
-- ArvoOS yeşiliydi. Bu, panelin "bizim ürünümüz" hissi vermesini
-- engelliyordu. Renk NULL kalırsa panel eski davranışa döner.

alter table public.organizations
  add column if not exists brand_color text;

-- Yalnızca #RRGGBB kabul et. Panel bu değeri doğrudan CSS değişkenine
-- bastığı için serbest metin bırakmak stil enjeksiyonuna açık kapı olurdu.
alter table public.organizations
  drop constraint if exists organizations_brand_color_format;

alter table public.organizations
  add constraint organizations_brand_color_format
  check (brand_color is null or brand_color ~* '^#[0-9a-f]{6}$');

comment on column public.organizations.brand_color is
  'Kurumun panel vurgu rengi (#RRGGBB). NULL ise ArvoOS varsayılan yeşili kullanılır.';

-- RPC'yi yeni sütunu da döndürecek şekilde yeniden oluştur.
drop function if exists public.get_my_workspaces();

create or replace function public.get_my_workspaces()
returns table(
  organization_id uuid, role text, id uuid, name text, slug text,
  status text, plan_code text, sector text, custom_domain text,
  logo_url text, display_name text, brand_color text
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
    o.display_name,
    o.brand_color
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
