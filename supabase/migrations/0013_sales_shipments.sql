create type public.sales_shipment_status as enum ('draft', 'ready', 'shipped', 'cancelled');

create table public.sales_shipments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete restrict,
  shipment_no text not null,
  status public.sales_shipment_status not null default 'draft',
  shipment_date date not null default current_date,
  tracking_no text,
  carrier_name text,
  notes text,
  shipped_by uuid references public.profiles(id),
  shipped_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, shipment_no)
);

create table public.sales_shipment_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null references public.sales_shipments(id) on delete cascade,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (shipment_id, sales_order_item_id)
);

create index sales_shipments_org_date_idx on public.sales_shipments(organization_id, shipment_date desc);
create index sales_shipments_order_idx on public.sales_shipments(sales_order_id);
create index sales_shipment_items_shipment_idx on public.sales_shipment_items(shipment_id);

create trigger sales_shipments_set_updated_at before update on public.sales_shipments for each row execute function public.set_updated_at();

insert into public.permissions (code, name, module, description) values
  ('shipping.read', 'Sevkiyatları görüntüle', 'shipping', 'Satış sevkiyatlarını ve sevkiyat kalemlerini görüntüler.'),
  ('shipping.manage', 'Sevkiyatları yönet', 'shipping', 'Sevkiyat emri oluşturur, hazırlar ve depodan çıkış yapar.')
on conflict (code) do update set name = excluded.name, module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.code in ('shipping.read', 'shipping.manage')
where r.code = 'owner' on conflict do nothing;

alter table public.sales_shipments enable row level security;
alter table public.sales_shipment_items enable row level security;

create policy sales_shipments_read on public.sales_shipments for select using (public.has_permission(organization_id, 'shipping.read'));
create policy sales_shipments_manage on public.sales_shipments for all
using (public.has_permission(organization_id, 'shipping.manage'))
with check (public.has_permission(organization_id, 'shipping.manage'));
create policy sales_shipment_items_read on public.sales_shipment_items for select using (public.has_permission(organization_id, 'shipping.read'));
create policy sales_shipment_items_manage on public.sales_shipment_items for all
using (public.has_permission(organization_id, 'shipping.manage'))
with check (public.has_permission(organization_id, 'shipping.manage'));

create or replace function public.create_sales_shipment(
  target_organization_id uuid,
  target_sales_order_id uuid,
  target_warehouse_id uuid,
  target_shipment_no text,
  target_shipment_date date,
  target_tracking_no text,
  target_carrier_name text,
  target_notes text,
  target_sales_order_item_id uuid,
  target_quantity numeric
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  saved_id uuid;
  order_item public.sales_order_items%rowtype;
  order_status public.sales_order_status;
begin
  if not public.has_permission(target_organization_id, 'shipping.manage') then raise exception 'Shipping management permission required'; end if;
  if target_quantity is null or target_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  select status into order_status from public.sales_orders
  where id = target_sales_order_id and organization_id = target_organization_id;
  if not found then raise exception 'Sales order not found'; end if;
  if order_status not in ('confirmed', 'partially_fulfilled') then raise exception 'Only confirmed sales orders can be shipped'; end if;

  perform 1 from public.inventory_warehouses where id = target_warehouse_id and organization_id = target_organization_id and is_active = true;
  if not found then raise exception 'Warehouse not found'; end if;

  select * into order_item from public.sales_order_items
  where id = target_sales_order_item_id and sales_order_id = target_sales_order_id and organization_id = target_organization_id;
  if not found or order_item.item_id is null then raise exception 'Stock item not found on sales order'; end if;
  if order_item.fulfilled_quantity + target_quantity > order_item.quantity then raise exception 'Shipment quantity exceeds remaining order quantity'; end if;

  insert into public.sales_shipments (organization_id, sales_order_id, warehouse_id, shipment_no, shipment_date, tracking_no, carrier_name, notes, created_by)
  values (target_organization_id, target_sales_order_id, target_warehouse_id, trim(target_shipment_no), coalesce(target_shipment_date,current_date), nullif(trim(target_tracking_no),''), nullif(trim(target_carrier_name),''), nullif(trim(target_notes),''), auth.uid())
  returning id into saved_id;

  insert into public.sales_shipment_items (organization_id, shipment_id, sales_order_item_id, item_id, quantity)
  values (target_organization_id, saved_id, target_sales_order_item_id, order_item.item_id, target_quantity);

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), 'shipping.created', 'sales_shipment', saved_id::text, jsonb_build_object('shipment_no',target_shipment_no,'sales_order_id',target_sales_order_id));
  return saved_id;
end;
$$;

create or replace function public.set_sales_shipment_status(
  target_organization_id uuid,
  target_shipment_id uuid,
  target_status public.sales_shipment_status
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  shipment_row public.sales_shipments%rowtype;
  shipment_item record;
  current_balance numeric;
  all_fulfilled boolean;
begin
  if not public.has_permission(target_organization_id, 'shipping.manage') then raise exception 'Shipping management permission required'; end if;

  select * into shipment_row from public.sales_shipments
  where id = target_shipment_id and organization_id = target_organization_id for update;
  if not found then raise exception 'Shipment not found'; end if;
  if shipment_row.status = 'shipped' then raise exception 'Shipped records cannot be changed'; end if;
  if shipment_row.status = 'cancelled' then raise exception 'Cancelled shipment cannot be changed'; end if;
  if target_status = 'draft' then raise exception 'Status cannot return to draft'; end if;

  if target_status = 'shipped' then
    if shipment_row.status <> 'ready' then raise exception 'Shipment must be ready before shipping'; end if;

    for shipment_item in
      select ssi.*, soi.quantity as ordered_quantity, soi.fulfilled_quantity
      from public.sales_shipment_items ssi
      join public.sales_order_items soi on soi.id = ssi.sales_order_item_id
      where ssi.shipment_id = target_shipment_id
      for update of soi
    loop
      select quantity into current_balance from public.inventory_balances
      where warehouse_id = shipment_row.warehouse_id and item_id = shipment_item.item_id for update;
      if coalesce(current_balance,0) < shipment_item.quantity then raise exception 'Insufficient stock for item %', shipment_item.item_id; end if;

      insert into public.stock_movements (organization_id, warehouse_id, item_id, movement_type, quantity, reference_type, reference_id, note, movement_date, created_by)
      values (target_organization_id, shipment_row.warehouse_id, shipment_item.item_id, 'out', shipment_item.quantity, 'sales_shipment', target_shipment_id, 'Satış sevkiyatı', shipment_row.shipment_date, auth.uid());

      update public.inventory_balances set quantity = quantity - shipment_item.quantity, updated_at = now()
      where warehouse_id = shipment_row.warehouse_id and item_id = shipment_item.item_id;

      update public.sales_order_items set fulfilled_quantity = fulfilled_quantity + shipment_item.quantity
      where id = shipment_item.sales_order_item_id;
    end loop;

    select bool_and(fulfilled_quantity >= quantity) into all_fulfilled
    from public.sales_order_items where sales_order_id = shipment_row.sales_order_id;

    update public.sales_orders set status = case when coalesce(all_fulfilled,false) then 'fulfilled' else 'partially_fulfilled' end
    where id = shipment_row.sales_order_id;

    update public.sales_shipments set status = 'shipped', shipped_by = auth.uid(), shipped_at = now()
    where id = target_shipment_id;
  else
    update public.sales_shipments set status = target_status where id = target_shipment_id;
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), 'shipping.status.changed', 'sales_shipment', target_shipment_id::text, jsonb_build_object('status',target_status));
end;
$$;

grant select, insert, update, delete on public.sales_shipments to authenticated;
grant select, insert, update, delete on public.sales_shipment_items to authenticated;
grant execute on function public.create_sales_shipment(uuid,uuid,uuid,text,date,text,text,text,uuid,numeric) to authenticated;
grant execute on function public.set_sales_shipment_status(uuid,uuid,public.sales_shipment_status) to authenticated;
notify pgrst, 'reload schema';
