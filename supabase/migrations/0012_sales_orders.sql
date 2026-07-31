create type public.sales_order_status as enum ('draft', 'confirmed', 'partially_fulfilled', 'fulfilled', 'cancelled');

create table public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.crm_customers(id) on delete restrict,
  order_no text not null,
  status public.sales_order_status not null default 'draft',
  order_date date not null default current_date,
  expected_delivery_date date,
  currency text not null default 'TRY',
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_no)
);

create table public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  fulfilled_quantity numeric(14,3) not null default 0 check (fulfilled_quantity >= 0),
  unit text not null default 'adet',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate >= 0),
  created_at timestamptz not null default now()
);

create index sales_orders_org_date_idx on public.sales_orders(organization_id, order_date desc);
create index sales_orders_customer_idx on public.sales_orders(customer_id);
create index sales_order_items_order_idx on public.sales_order_items(sales_order_id);

create trigger sales_orders_set_updated_at before update on public.sales_orders for each row execute function public.set_updated_at();

insert into public.permissions (code, name, module, description) values
  ('sales.read', 'Satış siparişlerini görüntüle', 'sales', 'Satış siparişlerini ve kalemlerini görüntüler.'),
  ('sales.manage', 'Satış siparişlerini yönet', 'sales', 'Satış siparişi oluşturur ve durumunu yönetir.')
on conflict (code) do update set name = excluded.name, module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in ('sales.read', 'sales.manage')
where r.code = 'owner' on conflict do nothing;

alter table public.sales_orders enable row level security;
alter table public.sales_order_items enable row level security;

create policy sales_orders_read on public.sales_orders for select using (public.has_permission(organization_id, 'sales.read'));
create policy sales_orders_manage on public.sales_orders for all
using (public.has_permission(organization_id, 'sales.manage'))
with check (public.has_permission(organization_id, 'sales.manage'));
create policy sales_order_items_read on public.sales_order_items for select using (public.has_permission(organization_id, 'sales.read'));
create policy sales_order_items_manage on public.sales_order_items for all
using (public.has_permission(organization_id, 'sales.manage'))
with check (public.has_permission(organization_id, 'sales.manage'));

create or replace function public.create_sales_order(
  target_organization_id uuid,
  target_customer_id uuid,
  target_order_no text,
  target_order_date date,
  target_expected_delivery_date date,
  target_currency text,
  target_notes text,
  target_item_id uuid,
  target_description text,
  target_quantity numeric,
  target_unit text,
  target_unit_price numeric,
  target_tax_rate numeric
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'sales.manage') then raise exception 'Sales management permission required'; end if;
  perform 1 from public.crm_customers where id = target_customer_id and organization_id = target_organization_id;
  if not found then raise exception 'Customer not found'; end if;
  if target_item_id is not null then
    perform 1 from public.inventory_items where id = target_item_id and organization_id = target_organization_id and is_active = true;
    if not found then raise exception 'Inventory item not found'; end if;
  end if;
  insert into public.sales_orders (organization_id, customer_id, order_no, order_date, expected_delivery_date, currency, notes, created_by)
  values (target_organization_id, target_customer_id, trim(target_order_no), coalesce(target_order_date,current_date), target_expected_delivery_date, upper(trim(target_currency)), nullif(trim(target_notes),''), auth.uid())
  returning id into saved_id;
  insert into public.sales_order_items (organization_id, sales_order_id, item_id, description, quantity, unit, unit_price, tax_rate)
  values (target_organization_id, saved_id, target_item_id, trim(target_description), target_quantity, trim(target_unit), target_unit_price, coalesce(target_tax_rate,20));
  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), 'sales.order.created', 'sales_order', saved_id::text, jsonb_build_object('order_no',target_order_no,'customer_id',target_customer_id));
  return saved_id;
end;
$$;

create or replace function public.set_sales_order_status(target_organization_id uuid, target_order_id uuid, target_status public.sales_order_status)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_permission(target_organization_id, 'sales.manage') then raise exception 'Sales management permission required'; end if;
  update public.sales_orders set status = target_status where id = target_order_id and organization_id = target_organization_id;
  if not found then raise exception 'Sales order not found'; end if;
  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), 'sales.order.status.changed', 'sales_order', target_order_id::text, jsonb_build_object('status',target_status));
end;
$$;

grant select, insert, update, delete on public.sales_orders to authenticated;
grant select, insert, update, delete on public.sales_order_items to authenticated;
grant execute on function public.create_sales_order(uuid,uuid,text,date,date,text,text,uuid,text,numeric,text,numeric,numeric) to authenticated;
grant execute on function public.set_sales_order_status(uuid,uuid,public.sales_order_status) to authenticated;
notify pgrst, 'reload schema';
