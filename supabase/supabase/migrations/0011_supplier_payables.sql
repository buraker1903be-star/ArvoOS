create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  purchase_request_id uuid references public.purchase_requests(id) on delete set null,
  invoice_no text not null,
  invoice_date date not null default current_date,
  due_date date,
  currency text not null default 'TRY',
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(14,2) not null default 0 check (tax_amount >= 0),
  total_amount numeric(14,2) generated always as (subtotal + tax_amount) stored,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'open' check (status in ('open','partially_paid','paid','cancelled')),
  notes text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_no)
);

create table public.supplier_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_invoice_id uuid not null references public.supplier_invoices(id) on delete restrict,
  finance_transaction_id uuid not null references public.finance_transactions(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  reference_no text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index supplier_invoices_org_due_idx on public.supplier_invoices(organization_id, due_date, status);
create index supplier_invoices_supplier_idx on public.supplier_invoices(supplier_id);
create index supplier_invoice_payments_invoice_idx on public.supplier_invoice_payments(supplier_invoice_id);

create trigger supplier_invoices_set_updated_at before update on public.supplier_invoices
for each row execute function public.set_updated_at();

alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_payments enable row level security;

create policy supplier_invoices_read on public.supplier_invoices for select
using (public.has_permission(organization_id, 'finance.read'));

create policy supplier_invoices_manage on public.supplier_invoices for all
using (public.has_permission(organization_id, 'finance.manage'))
with check (public.has_permission(organization_id, 'finance.manage'));

create policy supplier_invoice_payments_read on public.supplier_invoice_payments for select
using (public.has_permission(organization_id, 'finance.read'));

create policy supplier_invoice_payments_manage on public.supplier_invoice_payments for all
using (public.has_permission(organization_id, 'finance.manage'))
with check (public.has_permission(organization_id, 'finance.manage'));

create or replace function public.create_supplier_invoice(
  target_organization_id uuid,
  target_supplier_id uuid,
  target_purchase_request_id uuid,
  target_invoice_no text,
  target_invoice_date date,
  target_due_date date,
  target_currency text,
  target_subtotal numeric,
  target_tax_amount numeric,
  target_notes text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare saved_id uuid;
begin
  if not public.has_permission(target_organization_id, 'finance.manage') then
    raise exception 'Finance management permission required';
  end if;

  perform 1 from public.suppliers
  where id = target_supplier_id and organization_id = target_organization_id;
  if not found then raise exception 'Supplier not found'; end if;

  if target_purchase_request_id is not null then
    perform 1 from public.purchase_requests
    where id = target_purchase_request_id and organization_id = target_organization_id;
    if not found then raise exception 'Purchase request not found'; end if;
  end if;

  insert into public.supplier_invoices (
    organization_id, supplier_id, purchase_request_id, invoice_no, invoice_date,
    due_date, currency, subtotal, tax_amount, notes, created_by
  ) values (
    target_organization_id, target_supplier_id, target_purchase_request_id,
    trim(target_invoice_no), coalesce(target_invoice_date, current_date), target_due_date,
    upper(trim(target_currency)), target_subtotal, coalesce(target_tax_amount, 0),
    nullif(trim(target_notes), ''), auth.uid()
  ) returning id into saved_id;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_organization_id, auth.uid(), 'finance.supplier_invoice.created', 'supplier_invoice', saved_id::text,
    jsonb_build_object('supplier_id', target_supplier_id, 'invoice_no', target_invoice_no, 'total', target_subtotal + coalesce(target_tax_amount, 0))
  );

  return saved_id;
end;
$$;

create or replace function public.pay_supplier_invoice(
  target_organization_id uuid,
  target_invoice_id uuid,
  target_account_id uuid,
  target_amount numeric,
  target_payment_date date,
  target_reference_no text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.supplier_invoices%rowtype;
  supplier_name text;
  transaction_id uuid;
  remaining numeric;
  next_paid numeric;
begin
  if not public.has_permission(target_organization_id, 'finance.manage') then
    raise exception 'Finance management permission required';
  end if;

  select * into invoice_row from public.supplier_invoices
  where id = target_invoice_id and organization_id = target_organization_id
  for update;
  if not found then raise exception 'Supplier invoice not found'; end if;
  if invoice_row.status in ('paid','cancelled') then raise exception 'Invoice is not payable'; end if;

  perform 1 from public.finance_accounts
  where id = target_account_id and organization_id = target_organization_id and is_active = true;
  if not found then raise exception 'Active finance account not found'; end if;

  remaining := invoice_row.total_amount - invoice_row.paid_amount;
  if target_amount <= 0 or target_amount > remaining then raise exception 'Invalid payment amount'; end if;

  select name into supplier_name from public.suppliers where id = invoice_row.supplier_id;

  insert into public.finance_transactions (
    organization_id, account_id, customer_id, transaction_type, status, category,
    description, amount, currency, transaction_date, due_date, reference_no, created_by
  ) values (
    target_organization_id, target_account_id, null, 'expense', 'completed', 'Tedarikçi ödemesi',
    concat(coalesce(supplier_name, 'Tedarikçi'), ' - ', invoice_row.invoice_no), target_amount,
    invoice_row.currency, coalesce(target_payment_date, current_date), invoice_row.due_date,
    nullif(trim(target_reference_no), ''), auth.uid()
  ) returning id into transaction_id;

  insert into public.supplier_invoice_payments (
    organization_id, supplier_invoice_id, finance_transaction_id, amount, payment_date, reference_no, created_by
  ) values (
    target_organization_id, target_invoice_id, transaction_id, target_amount,
    coalesce(target_payment_date, current_date), nullif(trim(target_reference_no), ''), auth.uid()
  );

  next_paid := invoice_row.paid_amount + target_amount;
  update public.supplier_invoices
  set paid_amount = next_paid,
      status = case when next_paid >= total_amount then 'paid' else 'partially_paid' end
  where id = target_invoice_id;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    target_organization_id, auth.uid(), 'finance.supplier_invoice.paid', 'supplier_invoice', target_invoice_id::text,
    jsonb_build_object('amount', target_amount, 'finance_transaction_id', transaction_id)
  );

  return transaction_id;
end;
$$;

grant select, insert, update, delete on public.supplier_invoices to authenticated;
grant select, insert, update, delete on public.supplier_invoice_payments to authenticated;
grant execute on function public.create_supplier_invoice(uuid,uuid,uuid,text,date,date,text,numeric,numeric,text) to authenticated;
grant execute on function public.pay_supplier_invoice(uuid,uuid,uuid,numeric,date,text) to authenticated;

notify pgrst, 'reload schema';
