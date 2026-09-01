alter table public.payment_installments
  add column if not exists payment_url text,
  add column if not exists notice_sent_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,
  add column if not exists notice_sent_by uuid references auth.users(id) on delete set null;

alter table public.crm_contracts
  add column if not exists service_cost bigint not null default 0 check (service_cost >= 0),
  add column if not exists service_cost_supplier text,
  add column if not exists service_cost_reference text,
  add column if not exists service_cost_status text not null default 'planned'
    check (service_cost_status in ('planned','paid')),
  add column if not exists service_cost_transaction_id uuid references public.finance_transactions(id) on delete set null;

create index if not exists payment_installments_due_status_idx
  on public.payment_installments (organization_id, status, due_date);

create index if not exists crm_contracts_service_cost_status_idx
  on public.crm_contracts (organization_id, service_cost_status)
  where service_cost > 0;
