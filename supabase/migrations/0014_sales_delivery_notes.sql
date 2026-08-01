create type public.sales_delivery_note_status as enum ('draft', 'issued', 'cancelled');

create table public.sales_delivery_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  shipment_id uuid not null references public.sales_shipments(id) on delete restrict,
  sales_order_id uuid not null references public.sales_orders(id) on delete restrict,
  customer_id uuid not null references public.crm_customers(id) on delete restrict,
  delivery_note_no text not null,
  status public.sales_delivery_note_status not null default 'draft',
  issue_date date not null default current_date,
  delivery_date date,
  delivery_address text,
  carrier_name text,
  tracking_no text,
  notes text,
  issued_by uuid references public.profiles(id),
  issued_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  cancelled_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, delivery_note_no),
  unique (shipment_id)
);

create table public.sales_delivery_note_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  delivery_note_id uuid not null references public.sales_delivery_notes(id) on delete cascade,
  shipment_item_id uuid not null references public.sales_shipment_items(id) on delete restrict,
  sales_order_item_id uuid not null references public.sales_order_items(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'adet',
  created_at timestamptz not null default now()
);

create index sales_delivery_notes_org_date_idx on public.sales_delivery_notes(organization_id, issue_date desc);
create index sales_delivery_notes_customer_idx on public.sales_delivery_notes(customer_id);
create index sales_delivery_note_items_note_idx on public.sales_delivery_note_items(delivery_note_id);

create trigger sales_delivery_notes_set_updated_at
before update on public.sales_delivery_notes
for each row execute function public.set_updated_at();

insert into public.permissions (code, name, module, description) values
  ('delivery_notes.read', 'İrsaliyeleri görüntüle', 'delivery_notes', 'Satış irsaliyelerini ve irsaliye kalemlerini görüntüler.'),
  ('delivery_notes.manage', 'İrsaliyeleri yönet', 'delivery_notes', 'Sevkiyattan irsaliye oluşturur, düzenler, kesinleştirir ve iptal eder.')
on conflict (code) do update
set name = excluded.name, module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('delivery_notes.read', 'delivery_notes.manage')
where r.code = 'owner'
on conflict do nothing;

alter table public.sales_delivery_notes enable row level security;
alter table public.sales_delivery_note_items enable row level security;

create policy sales_delivery_notes_read on public.sales_delivery_notes
for select using (public.has_permission(organization_id, 'delivery_notes.read'));

create policy sales_delivery_notes_manage on public.sales_delivery_notes
for all using (public.has_permission(organization_id, 'delivery_notes.manage'))
with check (public.has_permission(organization_id, 'delivery_notes.manage'));

create policy sales_delivery_note_items_read on public.sales_delivery_note_items
for select using (public.has_permission(organization_id, 'delivery_notes.read'));

create policy sales_delivery_note_items_manage on public.sales_delivery_note_items
for all using (public.has_permission(organization_id, 'delivery_notes.manage'))
with check (public.has_permission(organization_id, 'delivery_notes.manage'));

create or replace function public.create_sales_delivery_note(
  target_organization_id uuid,
  target_shipment_id uuid,
  target_delivery_note_no text,
  target_issue_date date,
  target_delivery_date date,
  target_delivery_address text,
  target_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  shipment_row public.sales_shipments%rowtype;
  order_row public.sales_orders%rowtype;
  saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'delivery_notes.manage') then
    raise exception 'Delivery note management permission required';
  end if;

  select * into shipment_row
  from public.sales_shipments
  where id = target_shipment_id
    and organization_id = target_organization_id;

  if not found then raise exception 'Shipment not found'; end if;
  if shipment_row.status <> 'shipped' then raise exception 'Only shipped records can create delivery notes'; end if;

  select * into order_row
  from public.sales_orders
  where id = shipment_row.sales_order_id
    and organization_id = target_organization_id;

  if not found then raise exception 'Sales order not found'; end if;

  insert into public.sales_delivery_notes (
    organization_id, shipment_id, sales_order_id, customer_id, delivery_note_no,
    issue_date, delivery_date, delivery_address, carrier_name, tracking_no,
    notes, created_by
  ) values (
    target_organization_id, shipment_row.id, order_row.id, order_row.customer_id,
    trim(target_delivery_note_no), coalesce(target_issue_date, current_date),
    target_delivery_date, nullif(trim(target_delivery_address), ''),
    shipment_row.carrier_name, shipment_row.tracking_no,
    nullif(trim(target_notes), ''), auth.uid()
  ) returning id into saved_id;

  insert into public.sales_delivery_note_items (
    organization_id, delivery_note_id, shipment_item_id, sales_order_item_id,
    item_id, description, quantity, unit
  )
  select
    target_organization_id,
    saved_id,
    shipment_item.id,
    shipment_item.sales_order_item_id,
    shipment_item.item_id,
    order_item.description,
    shipment_item.quantity,
    order_item.unit
  from public.sales_shipment_items shipment_item
  join public.sales_order_items order_item on order_item.id = shipment_item.sales_order_item_id
  where shipment_item.shipment_id = target_shipment_id;

  if not found then raise exception 'Shipment has no items'; end if;

  insert into public.activity_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id, auth.uid(), 'delivery_note.created', 'sales_delivery_note', saved_id::text,
    jsonb_build_object('delivery_note_no', target_delivery_note_no, 'shipment_id', target_shipment_id)
  );

  return saved_id;
end;
$$;

create or replace function public.set_sales_delivery_note_status(
  target_organization_id uuid,
  target_delivery_note_id uuid,
  target_status public.sales_delivery_note_status
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status public.sales_delivery_note_status;
begin
  if not public.has_permission(target_organization_id, 'delivery_notes.manage') then
    raise exception 'Delivery note management permission required';
  end if;

  select status into current_status
  from public.sales_delivery_notes
  where id = target_delivery_note_id
    and organization_id = target_organization_id
  for update;

  if not found then raise exception 'Delivery note not found'; end if;
  if current_status = 'cancelled' then raise exception 'Cancelled delivery note cannot be changed'; end if;
  if current_status = 'issued' and target_status = 'draft' then raise exception 'Issued delivery note cannot return to draft'; end if;

  if target_status = 'issued' then
    update public.sales_delivery_notes
    set status = 'issued', issued_by = auth.uid(), issued_at = now()
    where id = target_delivery_note_id;
  elsif target_status = 'cancelled' then
    update public.sales_delivery_notes
    set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
    where id = target_delivery_note_id;
  else
    update public.sales_delivery_notes
    set status = target_status
    where id = target_delivery_note_id;
  end if;

  insert into public.activity_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    target_organization_id, auth.uid(), 'delivery_note.status.changed', 'sales_delivery_note', target_delivery_note_id::text,
    jsonb_build_object('status', target_status)
  );
end;
$$;

grant select, insert, update, delete on public.sales_delivery_notes to authenticated;
grant select, insert, update, delete on public.sales_delivery_note_items to authenticated;
grant execute on function public.create_sales_delivery_note(uuid,uuid,text,date,date,text,text) to authenticated;
grant execute on function public.set_sales_delivery_note_status(uuid,uuid,public.sales_delivery_note_status) to authenticated;

notify pgrst, 'reload schema';
