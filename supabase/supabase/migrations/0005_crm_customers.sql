create type public.customer_type as enum ('company', 'person');
create type public.customer_status as enum ('lead', 'active', 'passive');

create table public.crm_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_type public.customer_type not null default 'company',
  status public.customer_status not null default 'lead',
  name text not null,
  tax_number text,
  tax_office text,
  email text,
  phone text,
  website text,
  city text,
  address text,
  notes text,
  assigned_user_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index crm_customers_organization_idx on public.crm_customers(organization_id, created_at desc);
create index crm_customers_name_idx on public.crm_customers(organization_id, name);
create index crm_customers_assigned_idx on public.crm_customers(organization_id, assigned_user_id);

create trigger crm_customers_set_updated_at
before update on public.crm_customers
for each row execute function public.set_updated_at();

alter table public.crm_customers enable row level security;

create policy crm_customers_select
on public.crm_customers for select
using (public.has_permission(organization_id, 'crm.read'));

create policy crm_customers_insert
on public.crm_customers for insert
with check (
  public.has_permission(organization_id, 'crm.manage')
  and created_by = auth.uid()
);

create policy crm_customers_update
on public.crm_customers for update
using (public.has_permission(organization_id, 'crm.manage'))
with check (public.has_permission(organization_id, 'crm.manage'));

create or replace function public.save_crm_customer(
  target_organization_id uuid,
  target_customer_id uuid,
  target_customer_type public.customer_type,
  target_status public.customer_status,
  target_name text,
  target_tax_number text,
  target_tax_office text,
  target_email text,
  target_phone text,
  target_website text,
  target_city text,
  target_address text,
  target_notes text,
  target_assigned_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'crm.manage') then
    raise exception 'CRM yönetme yetkisi gerekiyor';
  end if;

  if trim(coalesce(target_name, '')) = '' then
    raise exception 'Müşteri adı zorunludur';
  end if;

  if target_assigned_user_id is not null and not exists (
    select 1 from public.organization_members om
    where om.organization_id = target_organization_id
      and om.user_id = target_assigned_user_id
      and om.status = 'active'
  ) then
    raise exception 'Sorumlu kullanıcı bu organizasyonda aktif değil';
  end if;

  if target_customer_id is null then
    insert into public.crm_customers (
      organization_id, customer_type, status, name, tax_number, tax_office,
      email, phone, website, city, address, notes, assigned_user_id, created_by
    ) values (
      target_organization_id, target_customer_type, target_status, trim(target_name),
      nullif(trim(target_tax_number), ''), nullif(trim(target_tax_office), ''),
      nullif(trim(target_email), ''), nullif(trim(target_phone), ''),
      nullif(trim(target_website), ''), nullif(trim(target_city), ''),
      nullif(trim(target_address), ''), nullif(trim(target_notes), ''),
      target_assigned_user_id, auth.uid()
    ) returning id into saved_id;

    insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (target_organization_id, auth.uid(), 'crm.customer.created', 'crm_customer', saved_id::text, jsonb_build_object('name', trim(target_name)));
  else
    update public.crm_customers
    set customer_type = target_customer_type,
        status = target_status,
        name = trim(target_name),
        tax_number = nullif(trim(target_tax_number), ''),
        tax_office = nullif(trim(target_tax_office), ''),
        email = nullif(trim(target_email), ''),
        phone = nullif(trim(target_phone), ''),
        website = nullif(trim(target_website), ''),
        city = nullif(trim(target_city), ''),
        address = nullif(trim(target_address), ''),
        notes = nullif(trim(target_notes), ''),
        assigned_user_id = target_assigned_user_id
    where id = target_customer_id
      and organization_id = target_organization_id
    returning id into saved_id;

    if saved_id is null then
      raise exception 'Müşteri bulunamadı';
    end if;

    insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
    values (target_organization_id, auth.uid(), 'crm.customer.updated', 'crm_customer', saved_id::text, jsonb_build_object('name', trim(target_name)));
  end if;

  return saved_id;
end;
$$;

grant execute on function public.save_crm_customer(uuid, uuid, public.customer_type, public.customer_status, text, text, text, text, text, text, text, text, text, uuid) to authenticated;
