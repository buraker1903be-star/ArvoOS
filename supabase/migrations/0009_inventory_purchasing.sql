create type public.inventory_item_type as enum ('product', 'service');
create type public.stock_movement_type as enum ('in', 'out', 'transfer', 'adjustment');
create type public.purchase_request_status as enum ('draft', 'submitted', 'approved', 'rejected', 'ordered', 'partially_received', 'received', 'cancelled');

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  tax_number text,
  tax_office text,
  email text,
  phone text,
  city text,
  address text,
  contact_name text,
  payment_terms text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inventory_warehouses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  location text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_type public.inventory_item_type not null default 'product',
  name text not null,
  sku text not null,
  barcode text,
  unit text not null default 'adet',
  category text,
  purchase_price numeric(14,2) not null default 0 check (purchase_price >= 0),
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  currency text not null default 'TRY',
  minimum_stock numeric(14,3) not null default 0 check (minimum_stock >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, sku)
);

create table public.inventory_balances (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete cascade,
  quantity numeric(14,3) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (warehouse_id, item_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete restrict,
  destination_warehouse_id uuid references public.inventory_warehouses(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  movement_type public.stock_movement_type not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) check (unit_cost >= 0),
  reference_type text,
  reference_id uuid,
  note text,
  movement_date date not null default current_date,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (movement_type <> 'transfer' or destination_warehouse_id is not null),
  check (destination_warehouse_id is null or destination_warehouse_id <> warehouse_id)
);

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_no text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status public.purchase_request_status not null default 'draft',
  requested_by uuid not null references public.profiles(id),
  approved_by uuid references public.profiles(id),
  requested_date date not null default current_date,
  needed_date date,
  currency text not null default 'TRY',
  notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, request_no)
);

create table public.purchase_request_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'adet',
  unit_price numeric(14,2) not null default 0 check (unit_price >= 0),
  received_quantity numeric(14,3) not null default 0 check (received_quantity >= 0),
  created_at timestamptz not null default now()
);

create index suppliers_org_idx on public.suppliers(organization_id);
create index inventory_items_org_idx on public.inventory_items(organization_id);
create index inventory_warehouses_org_idx on public.inventory_warehouses(organization_id);
create index stock_movements_org_date_idx on public.stock_movements(organization_id, movement_date desc);
create index purchase_requests_org_status_idx on public.purchase_requests(organization_id, status);
create index purchase_request_items_request_idx on public.purchase_request_items(purchase_request_id);

create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger inventory_warehouses_set_updated_at before update on public.inventory_warehouses for each row execute function public.set_updated_at();
create trigger inventory_items_set_updated_at before update on public.inventory_items for each row execute function public.set_updated_at();
create trigger purchase_requests_set_updated_at before update on public.purchase_requests for each row execute function public.set_updated_at();

insert into public.permissions (code, name, module, description) values
  ('inventory.read', 'Stok görüntüle', 'inventory', 'Ürünleri, depoları, stok seviyelerini ve hareketleri görüntüler.'),
  ('inventory.manage', 'Stok yönet', 'inventory', 'Ürün, depo ve stok hareketlerini oluşturur ve günceller.'),
  ('purchasing.read', 'Satın alma görüntüle', 'purchasing', 'Tedarikçileri ve satın alma taleplerini görüntüler.'),
  ('purchasing.manage', 'Satın alma yönet', 'purchasing', 'Tedarikçi ve satın alma taleplerini oluşturur ve günceller.'),
  ('purchasing.approve', 'Satın alma onayla', 'purchasing', 'Satın alma taleplerini onaylar veya reddeder.')
on conflict (code) do update set name = excluded.name, module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.code in ('inventory.read','inventory.manage','purchasing.read','purchasing.manage','purchasing.approve')
where r.code = 'owner'
on conflict do nothing;

alter table public.suppliers enable row level security;
alter table public.inventory_warehouses enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.purchase_request_items enable row level security;

create policy suppliers_read on public.suppliers for select using (public.has_permission(organization_id, 'purchasing.read'));
create policy suppliers_manage on public.suppliers for all using (public.has_permission(organization_id, 'purchasing.manage')) with check (public.has_permission(organization_id, 'purchasing.manage'));
create policy inventory_warehouses_read on public.inventory_warehouses for select using (public.has_permission(organization_id, 'inventory.read'));
create policy inventory_warehouses_manage on public.inventory_warehouses for all using (public.has_permission(organization_id, 'inventory.manage')) with check (public.has_permission(organization_id, 'inventory.manage'));
create policy inventory_items_read on public.inventory_items for select using (public.has_permission(organization_id, 'inventory.read'));
create policy inventory_items_manage on public.inventory_items for all using (public.has_permission(organization_id, 'inventory.manage')) with check (public.has_permission(organization_id, 'inventory.manage'));
create policy inventory_balances_read on public.inventory_balances for select using (public.has_permission(organization_id, 'inventory.read'));
create policy inventory_balances_manage on public.inventory_balances for all using (public.has_permission(organization_id, 'inventory.manage')) with check (public.has_permission(organization_id, 'inventory.manage'));
create policy stock_movements_read on public.stock_movements for select using (public.has_permission(organization_id, 'inventory.read'));
create policy stock_movements_manage on public.stock_movements for insert with check (public.has_permission(organization_id, 'inventory.manage'));
create policy purchase_requests_read on public.purchase_requests for select using (public.has_permission(organization_id, 'purchasing.read'));
create policy purchase_requests_manage on public.purchase_requests for all using (public.has_permission(organization_id, 'purchasing.manage')) with check (public.has_permission(organization_id, 'purchasing.manage'));
create policy purchase_request_items_read on public.purchase_request_items for select using (public.has_permission(organization_id, 'purchasing.read'));
create policy purchase_request_items_manage on public.purchase_request_items for all using (public.has_permission(organization_id, 'purchasing.manage')) with check (public.has_permission(organization_id, 'purchasing.manage'));

create or replace function public.record_stock_movement(
  target_organization_id uuid,
  target_warehouse_id uuid,
  target_destination_warehouse_id uuid,
  target_item_id uuid,
  target_movement_type public.stock_movement_type,
  target_quantity numeric,
  target_unit_cost numeric,
  target_reference_type text,
  target_reference_id uuid,
  target_note text,
  target_movement_date date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'inventory.manage') then
    raise exception 'Inventory management permission required';
  end if;
  if target_quantity is null or target_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;

  insert into public.stock_movements (organization_id, warehouse_id, destination_warehouse_id, item_id, movement_type, quantity, unit_cost, reference_type, reference_id, note, movement_date, created_by)
  values (target_organization_id, target_warehouse_id, target_destination_warehouse_id, target_item_id, target_movement_type, target_quantity, target_unit_cost, nullif(trim(target_reference_type),''), target_reference_id, nullif(trim(target_note),''), coalesce(target_movement_date,current_date), auth.uid())
  returning id into saved_id;

  insert into public.inventory_balances (organization_id, warehouse_id, item_id, quantity)
  values (target_organization_id, target_warehouse_id, target_item_id,
    case when target_movement_type = 'in' then target_quantity
         when target_movement_type = 'out' then -target_quantity
         when target_movement_type = 'transfer' then -target_quantity
         else target_quantity end)
  on conflict (warehouse_id, item_id) do update
  set quantity = public.inventory_balances.quantity + excluded.quantity, updated_at = now();

  if target_movement_type = 'transfer' then
    insert into public.inventory_balances (organization_id, warehouse_id, item_id, quantity)
    values (target_organization_id, target_destination_warehouse_id, target_item_id, target_quantity)
    on conflict (warehouse_id, item_id) do update
    set quantity = public.inventory_balances.quantity + excluded.quantity, updated_at = now();
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), 'inventory.movement.created', 'stock_movement', saved_id::text,
    jsonb_build_object('type', target_movement_type, 'quantity', target_quantity, 'item_id', target_item_id));
  return saved_id;
end;
$$;

create or replace function public.set_purchase_request_status(
  target_organization_id uuid,
  target_request_id uuid,
  target_status public.purchase_request_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_status in ('approved','rejected') then
    if not public.has_permission(target_organization_id, 'purchasing.approve') then raise exception 'Purchasing approval permission required'; end if;
    update public.purchase_requests set status = target_status, approved_by = auth.uid(), approved_at = now()
    where id = target_request_id and organization_id = target_organization_id;
  else
    if not public.has_permission(target_organization_id, 'purchasing.manage') then raise exception 'Purchasing management permission required'; end if;
    update public.purchase_requests set status = target_status where id = target_request_id and organization_id = target_organization_id;
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), 'purchasing.request.status_changed', 'purchase_request', target_request_id::text, jsonb_build_object('status', target_status));
end;
$$;

grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.inventory_warehouses to authenticated;
grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.inventory_balances to authenticated;
grant select, insert on public.stock_movements to authenticated;
grant select, insert, update, delete on public.purchase_requests to authenticated;
grant select, insert, update, delete on public.purchase_request_items to authenticated;
grant execute on function public.record_stock_movement(uuid,uuid,uuid,uuid,public.stock_movement_type,numeric,numeric,text,uuid,text,date) to authenticated;
grant execute on function public.set_purchase_request_status(uuid,uuid,public.purchase_request_status) to authenticated;

notify pgrst, 'reload schema';
