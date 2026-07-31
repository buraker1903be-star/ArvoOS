create type public.finance_transaction_type as enum ('income', 'expense');
create type public.finance_transaction_status as enum ('planned', 'pending', 'completed', 'cancelled');

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text not null,
  account_type text not null default 'cash' check (account_type in ('cash', 'bank', 'pos', 'other')),
  currency text not null default 'TRY',
  opening_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid not null references public.finance_accounts(id) on delete restrict,
  customer_id uuid references public.crm_customers(id) on delete set null,
  transaction_type public.finance_transaction_type not null,
  status public.finance_transaction_status not null default 'pending',
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'TRY',
  transaction_date date not null default current_date,
  due_date date,
  reference_no text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index finance_accounts_organization_idx on public.finance_accounts(organization_id);
create index finance_transactions_organization_date_idx on public.finance_transactions(organization_id, transaction_date desc);
create index finance_transactions_account_idx on public.finance_transactions(account_id);
create index finance_transactions_status_idx on public.finance_transactions(organization_id, status);

create trigger finance_accounts_set_updated_at before update on public.finance_accounts for each row execute function public.set_updated_at();
create trigger finance_transactions_set_updated_at before update on public.finance_transactions for each row execute function public.set_updated_at();

insert into public.permissions (code, name, module, description) values
  ('finance.read', 'Finans görüntüle', 'finance', 'Finans hesaplarını, tahsilatları ve giderleri görüntüler.'),
  ('finance.manage', 'Finans yönet', 'finance', 'Finans hesaplarını, tahsilatları ve giderleri oluşturur ve günceller.')
on conflict (code) do update set name = excluded.name, module = excluded.module, description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in ('finance.read', 'finance.manage')
where r.code = 'owner'
on conflict do nothing;

alter table public.finance_accounts enable row level security;
alter table public.finance_transactions enable row level security;

create policy finance_accounts_read on public.finance_accounts for select
using (public.has_permission(organization_id, 'finance.read'));

create policy finance_accounts_manage on public.finance_accounts for all
using (public.has_permission(organization_id, 'finance.manage'))
with check (public.has_permission(organization_id, 'finance.manage'));

create policy finance_transactions_read on public.finance_transactions for select
using (public.has_permission(organization_id, 'finance.read'));

create policy finance_transactions_manage on public.finance_transactions for all
using (public.has_permission(organization_id, 'finance.manage'))
with check (public.has_permission(organization_id, 'finance.manage'));

create or replace function public.save_finance_account(
  target_organization_id uuid,
  target_account_id uuid,
  target_name text,
  target_code text,
  target_account_type text,
  target_currency text,
  target_opening_balance numeric,
  target_is_active boolean
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

  if target_account_id is null then
    insert into public.finance_accounts (organization_id, name, code, account_type, currency, opening_balance, is_active)
    values (target_organization_id, trim(target_name), lower(trim(target_code)), target_account_type, upper(trim(target_currency)), coalesce(target_opening_balance, 0), target_is_active)
    returning id into saved_id;
  else
    update public.finance_accounts
    set name = trim(target_name), code = lower(trim(target_code)), account_type = target_account_type,
        currency = upper(trim(target_currency)), opening_balance = coalesce(target_opening_balance, 0), is_active = target_is_active
    where id = target_account_id and organization_id = target_organization_id
    returning id into saved_id;
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), case when target_account_id is null then 'finance.account.created' else 'finance.account.updated' end,
          'finance_account', saved_id::text, jsonb_build_object('name', target_name, 'code', target_code));
  return saved_id;
end;
$$;

create or replace function public.save_finance_transaction(
  target_organization_id uuid,
  target_transaction_id uuid,
  target_account_id uuid,
  target_customer_id uuid,
  target_transaction_type public.finance_transaction_type,
  target_status public.finance_transaction_status,
  target_category text,
  target_description text,
  target_amount numeric,
  target_currency text,
  target_transaction_date date,
  target_due_date date,
  target_reference_no text
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

  if target_transaction_id is null then
    insert into public.finance_transactions (
      organization_id, account_id, customer_id, transaction_type, status, category, description,
      amount, currency, transaction_date, due_date, reference_no, created_by
    ) values (
      target_organization_id, target_account_id, target_customer_id, target_transaction_type, target_status,
      trim(target_category), trim(target_description), target_amount, upper(trim(target_currency)),
      target_transaction_date, target_due_date, nullif(trim(target_reference_no), ''), auth.uid()
    ) returning id into saved_id;
  else
    update public.finance_transactions
    set account_id = target_account_id, customer_id = target_customer_id, transaction_type = target_transaction_type,
        status = target_status, category = trim(target_category), description = trim(target_description), amount = target_amount,
        currency = upper(trim(target_currency)), transaction_date = target_transaction_date, due_date = target_due_date,
        reference_no = nullif(trim(target_reference_no), '')
    where id = target_transaction_id and organization_id = target_organization_id
    returning id into saved_id;
  end if;

  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (target_organization_id, auth.uid(), case when target_transaction_id is null then 'finance.transaction.created' else 'finance.transaction.updated' end,
          'finance_transaction', saved_id::text, jsonb_build_object('type', target_transaction_type, 'amount', target_amount, 'status', target_status));
  return saved_id;
end;
$$;

grant select, insert, update, delete on public.finance_accounts to authenticated;
grant select, insert, update, delete on public.finance_transactions to authenticated;
grant execute on function public.save_finance_account(uuid, uuid, text, text, text, text, numeric, boolean) to authenticated;
grant execute on function public.save_finance_transaction(uuid, uuid, uuid, uuid, public.finance_transaction_type, public.finance_transaction_status, text, text, numeric, text, date, date, text) to authenticated;

notify pgrst, 'reload schema';