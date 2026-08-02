create table if not exists public.billing_customers (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual','stripe','iyzico')),
  provider_customer_id text,
  billing_email text,
  tax_number text,
  billing_address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_customer_id)
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null default 'manual' check (provider in ('manual','stripe','iyzico')),
  provider_subscription_id text,
  plan_code public.plan_code not null,
  status text not null default 'trialing' check (status in ('trialing','active','past_due','paused','canceled','incomplete')),
  currency text not null default 'TRY',
  unit_amount bigint not null default 0 check (unit_amount >= 0),
  interval text not null default 'month' check (interval in ('month','year')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.billing_subscriptions(id) on delete set null,
  provider text not null default 'manual' check (provider in ('manual','stripe','iyzico')),
  provider_invoice_id text,
  status text not null default 'draft' check (status in ('draft','open','paid','void','uncollectible')),
  currency text not null default 'TRY',
  subtotal bigint not null default 0,
  tax bigint not null default 0,
  total bigint not null default 0,
  due_at timestamptz,
  paid_at timestamptz,
  invoice_url text,
  created_at timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_events enable row level security;

grant select on public.billing_customers, public.billing_subscriptions, public.billing_invoices to authenticated;
grant select on public.billing_events to authenticated;

create policy "members_read_own_billing_customer" on public.billing_customers for select to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = billing_customers.organization_id and m.user_id = (select auth.uid()) and m.is_active));
create policy "members_read_own_subscriptions" on public.billing_subscriptions for select to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = billing_subscriptions.organization_id and m.user_id = (select auth.uid()) and m.is_active));
create policy "members_read_own_invoices" on public.billing_invoices for select to authenticated using (exists (select 1 from public.organization_memberships m where m.organization_id = billing_invoices.organization_id and m.user_id = (select auth.uid()) and m.is_active));
create policy "founder_read_billing_events" on public.billing_events for select to authenticated using ((select private.is_arvoos_founder()));

create policy "founder_manage_billing_customers" on public.billing_customers for all to authenticated using ((select private.is_arvoos_founder())) with check ((select private.is_arvoos_founder()));
create policy "founder_manage_subscriptions" on public.billing_subscriptions for all to authenticated using ((select private.is_arvoos_founder())) with check ((select private.is_arvoos_founder()));
create policy "founder_manage_invoices" on public.billing_invoices for all to authenticated using ((select private.is_arvoos_founder())) with check ((select private.is_arvoos_founder()));
create policy "founder_manage_billing_events" on public.billing_events for all to authenticated using ((select private.is_arvoos_founder())) with check ((select private.is_arvoos_founder()));

create index if not exists billing_subscriptions_org_idx on public.billing_subscriptions(organization_id, status);
create index if not exists billing_invoices_org_idx on public.billing_invoices(organization_id, created_at desc);
create index if not exists billing_events_created_idx on public.billing_events(created_at desc);