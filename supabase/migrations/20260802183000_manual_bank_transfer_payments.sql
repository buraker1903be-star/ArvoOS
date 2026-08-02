create table if not exists public.platform_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_holder text,
  iban text not null unique,
  currency text not null default 'TRY',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_payment_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  bank_account_id uuid not null references public.platform_bank_accounts(id),
  plan_code public.plan_code not null,
  amount bigint not null check (amount > 0),
  currency text not null default 'TRY',
  payment_method text not null default 'bank_transfer' check (payment_method in ('bank_transfer','paytr')),
  status text not null default 'pending' check (status in ('pending','approved','rejected','canceled')),
  receipt_path text not null,
  reference_no text,
  customer_note text,
  review_note text,
  submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_bank_accounts enable row level security;
alter table public.organization_payment_requests enable row level security;

grant select on public.platform_bank_accounts to authenticated;
grant select, insert on public.organization_payment_requests to authenticated;
grant update on public.organization_payment_requests to authenticated;

create policy "authenticated_read_active_bank_accounts"
on public.platform_bank_accounts for select to authenticated
using (is_active = true or (select private.is_arvoos_founder()));

create policy "founder_manage_bank_accounts"
on public.platform_bank_accounts for all to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

create policy "members_read_own_payment_requests"
on public.organization_payment_requests for select to authenticated
using (exists (
  select 1 from public.organization_memberships membership
  where membership.organization_id = organization_payment_requests.organization_id
    and membership.user_id = (select auth.uid())
    and membership.is_active = true
));

create policy "owners_create_payment_requests"
on public.organization_payment_requests for insert to authenticated
with check (
  submitted_by = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = organization_payment_requests.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role in ('owner','admin')
  )
);

create policy "founder_manage_payment_requests"
on public.organization_payment_requests for all to authenticated
using ((select private.is_arvoos_founder()))
with check ((select private.is_arvoos_founder()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-receipts', 'payment-receipts', false, 10485760, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "organization_owners_upload_payment_receipts"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'payment-receipts'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
      and membership.role in ('owner','admin')
  )
);

create policy "organization_members_read_payment_receipts"
on storage.objects for select to authenticated
using (
  bucket_id = 'payment-receipts'
  and (
    exists (
      select 1 from public.organization_memberships membership
      where membership.organization_id::text = (storage.foldername(name))[1]
        and membership.user_id = (select auth.uid())
        and membership.is_active = true
    )
    or (select private.is_arvoos_founder())
  )
);

create or replace function public.review_bank_transfer_payment(
  p_payment_id uuid,
  p_decision text,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment public.organization_payment_requests%rowtype;
  period_end timestamptz;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Founder authorization required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;

  select * into payment
  from public.organization_payment_requests
  where id = p_payment_id and status = 'pending'
  for update;
  if not found then raise exception 'Pending payment not found'; end if;

  update public.organization_payment_requests
  set status = p_decision,
      review_note = nullif(trim(p_review_note), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = payment.id;

  if p_decision = 'approved' then
    period_end := now() + interval '1 month';

    update public.organization_licenses
    set plan_code = payment.plan_code,
        license_status = 'active',
        current_period_start = now(),
        current_period_end = period_end,
        trial_ends_at = null,
        suspended_at = null,
        suspension_reason = null,
        updated_by = (select auth.uid()),
        updated_at = now()
    where organization_id = payment.organization_id;

    update public.organizations
    set plan_code = payment.plan_code,
        status = 'active',
        provisioning_state = 'active',
        updated_at = now()
    where id = payment.organization_id;

    insert into public.billing_subscriptions (
      organization_id, provider, plan_code, status, currency, unit_amount,
      interval, current_period_start, current_period_end, updated_at
    ) values (
      payment.organization_id, 'manual', payment.plan_code, 'active', payment.currency,
      payment.amount, 'month', now(), period_end, now()
    );

    insert into public.billing_invoices (
      organization_id, provider, status, currency, subtotal, tax, total, due_at, paid_at
    ) values (
      payment.organization_id, 'manual', 'paid', payment.currency,
      payment.amount, 0, payment.amount, now(), now()
    );
  end if;
end;
$$;

revoke all on function public.review_bank_transfer_payment(uuid,text,text) from public;
revoke all on function public.review_bank_transfer_payment(uuid,text,text) from anon;
grant execute on function public.review_bank_transfer_payment(uuid,text,text) to authenticated;

insert into public.platform_bank_accounts (bank_name, iban, currency, is_active, sort_order)
values ('T. Garanti Bankası', 'TR480006200115100006290081', 'TRY', true, 10)
on conflict (iban) do update set bank_name = excluded.bank_name, is_active = true, updated_at = now();

create index if not exists organization_payment_requests_org_status_idx
  on public.organization_payment_requests(organization_id, status, created_at desc);
create index if not exists organization_payment_requests_pending_idx
  on public.organization_payment_requests(status, created_at desc)
  where status = 'pending';
