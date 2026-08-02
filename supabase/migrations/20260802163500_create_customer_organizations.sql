create or replace function public.create_customer_organization(
  p_name text,
  p_slug text,
  p_sector text,
  p_plan_code text,
  p_custom_domain text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Founder authorization required';
  end if;

  if length(trim(p_name)) < 2 or length(trim(p_name)) > 160 then
    raise exception 'Invalid organization name';
  end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception 'Invalid organization slug';
  end if;
  if p_plan_code not in ('trial', 'starter', 'professional', 'enterprise') then
    raise exception 'Invalid plan';
  end if;

  insert into public.organizations (name, slug, sector, status, plan_code, custom_domain)
  values (trim(p_name), p_slug, trim(p_sector), 'trial'::public.organization_status, p_plan_code::public.plan_code, nullif(trim(p_custom_domain), ''))
  returning id into new_organization_id;

  insert into public.organization_modules (organization_id, module_code, is_enabled)
  select
    new_organization_id,
    module.code,
    case
      when p_plan_code = 'enterprise' then true
      when p_plan_code = 'professional' then module.code in ('crm', 'operations', 'finance', 'reporting')
      when p_plan_code = 'starter' then module.code in ('crm', 'operations')
      else module.code = 'crm'
    end
  from public.arvo_modules module
  where module.is_active = true;

  return new_organization_id;
end;
$$;

revoke all on function public.create_customer_organization(text, text, text, text, text) from public;
revoke all on function public.create_customer_organization(text, text, text, text, text) from anon;
grant execute on function public.create_customer_organization(text, text, text, text, text) to authenticated;
