create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_request_id uuid not null references public.purchase_requests(id) on delete restrict,
  warehouse_id uuid not null references public.inventory_warehouses(id) on delete restrict,
  receipt_no text not null,
  receipt_date date not null default current_date,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (organization_id, receipt_no)
);

create table public.purchase_receipt_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_receipt_id uuid not null references public.purchase_receipts(id) on delete cascade,
  purchase_request_item_id uuid not null references public.purchase_request_items(id) on delete restrict,
  item_id uuid references public.inventory_items(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

create index purchase_receipts_org_date_idx on public.purchase_receipts(organization_id, receipt_date desc);
create index purchase_receipts_request_idx on public.purchase_receipts(purchase_request_id);
create index purchase_receipt_items_receipt_idx on public.purchase_receipt_items(purchase_receipt_id);

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

create policy purchase_receipts_read on public.purchase_receipts for select
using (public.has_permission(organization_id, 'purchasing.read'));

create policy purchase_receipts_manage on public.purchase_receipts for all
using (public.has_permission(organization_id, 'purchasing.manage'))
with check (public.has_permission(organization_id, 'purchasing.manage'));

create policy purchase_receipt_items_read on public.purchase_receipt_items for select
using (public.has_permission(organization_id, 'purchasing.read'));

create policy purchase_receipt_items_manage on public.purchase_receipt_items for all
using (public.has_permission(organization_id, 'purchasing.manage'))
with check (public.has_permission(organization_id, 'purchasing.manage'));

create or replace function public.receive_purchase_request(
  target_organization_id uuid,
  target_request_id uuid,
  target_warehouse_id uuid,
  target_receipt_no text,
  target_receipt_date date,
  target_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  saved_receipt_id uuid;
  request_row public.purchase_requests%rowtype;
  line record;
  remaining_quantity numeric;
  product_type public.inventory_item_type;
begin
  if not public.has_permission(target_organization_id, 'purchasing.manage') then
    raise exception 'Purchasing management permission required';
  end if;
  if not public.has_permission(target_organization_id, 'inventory.manage') then
    raise exception 'Inventory management permission required';
  end if;

  select * into request_row
  from public.purchase_requests
  where id = target_request_id and organization_id = target_organization_id
  for update;

  if not found then raise exception 'Purchase request not found'; end if;
  if request_row.status not in ('ordered','partially_received') then
    raise exception 'Only ordered purchase requests can be received';
  end if;

  perform 1 from public.inventory_warehouses
  where id = target_warehouse_id and organization_id = target_organization_id and is_active = true;
  if not found then raise exception 'Active warehouse not found'; end if;

  insert into public.purchase_receipts (
    organization_id, purchase_request_id, warehouse_id, receipt_no, receipt_date, note, created_by
  ) values (
    target_organization_id, target_request_id, target_warehouse_id, trim(target_receipt_no),
    coalesce(target_receipt_date, current_date), nullif(trim(target_note), ''), auth.uid()
  ) returning id into saved_receipt_id;

  for line in
    select pri.*, ii.item_type
    from public.purchase_request_items pri
    left join public.inventory_items ii on ii.id = pri.item_id
    where pri.purchase_request_id = target_request_id
    for update of pri
  loop
    remaining_quantity := line.quantity - line.received_quantity;
    if remaining_quantity <= 0 then continue; end if;

    insert into public.purchase_receipt_items (
      organization_id, purchase_receipt_id, purchase_request_item_id, item_id, quantity, unit_cost
    ) values (
      target_organization_id, saved_receipt_id, line.id, line.item_id, remaining_quantity, line.unit_price
    );

    update public.purchase_request_items
    set received_quantity = received_quantity + remaining_quantity
    where id = line.id;

    if line.item_id is not null and line.item_type = 'product' then
      perform public.record_stock_movement(
        target_organization_id,
        target_warehouse_id,
        null,
        line.item_id,
        'in'::public.stock_movement_type,
        remaining_quantity,
        line.unit_price,
        'purchase_receipt',
        saved_receipt_id,
        concat('Satın alma teslimatı: ', request_row.request_no),
        coalesce(target_receipt_date, current_date)
      );
    end if;
  end loop;

  if not exists (
    select 1 from public.purchase_request_items
    where purchase_request_id = target_request_id and received_quantity < quantity
  ) then
    update public.purchase_requests set status = 'received' where id = target_request_id;
  else
    update public.purchase_requests set status = 'partially_received' where id = target_request_id;
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_organization_id, auth.uid(), 'purchasing.receipt.created', 'purchase_receipt', saved_receipt_id::text,
    jsonb_build_object('request_id', target_request_id, 'warehouse_id', target_warehouse_id, 'receipt_no', target_receipt_no)
  );

  return saved_receipt_id;
end;
$$;

grant select, insert, update, delete on public.purchase_receipts to authenticated;
grant select, insert, update, delete on public.purchase_receipt_items to authenticated;
grant execute on function public.receive_purchase_request(uuid,uuid,uuid,text,date,text) to authenticated;

notify pgrst, 'reload schema';
