create table if not exists public.paytr_payment_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null,
  merchant_oid text not null unique check (merchant_oid ~ '^[A-Za-z0-9]+$' and char_length(merchant_oid) <= 64),
  amount bigint not null check (amount > 0),
  currency text not null default 'TL',
  status text not null default 'pending' check (status in ('pending','success','failed','canceled')),
  customer_email text not null,
  customer_name text not null,
  customer_phone text not null,
  customer_address text not null,
  payment_type text,
  total_amount bigint,
  failed_reason_code text,
  failed_reason_msg text,
  callback_hash text,
  callback_received_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paytr_orders_invoice_org_fk
    foreign key (invoice_id, organization_id)
    references public.billing_invoices(id, organization_id)
    on delete no action
);

alter table public.paytr_payment_orders enable row level security;
grant select, insert on public.paytr_payment_orders to authenticated;

create policy "members_read_own_paytr_orders"
on public.paytr_payment_orders for select to authenticated
using (exists (
  select 1 from public.organization_memberships m
  where m.organization_id = paytr_payment_orders.organization_id
    and m.user_id = (select auth.uid())
    and m.is_active
));

create policy "owners_create_paytr_orders"
on public.paytr_payment_orders for insert to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = paytr_payment_orders.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  )
  and exists (
    select 1 from public.billing_invoices i
    where i.id = paytr_payment_orders.invoice_id
      and i.organization_id = paytr_payment_orders.organization_id
      and i.status = 'open'
      and i.total = paytr_payment_orders.amount
  )
);

create index if not exists paytr_orders_org_created_idx
  on public.paytr_payment_orders(organization_id, created_at desc);
create index if not exists paytr_orders_status_idx
  on public.paytr_payment_orders(status, created_at desc);
