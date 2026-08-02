create table if not exists public.invoice_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_type text not null check (document_type in ('e_invoice','e_archive')),
  prefix text not null check (prefix ~ '^[A-Z0-9]{3}$'),
  current_year integer not null default extract(year from current_date)::integer,
  last_number bigint not null default 0 check (last_number >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_type, prefix)
);

create table if not exists public.sales_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  billing_invoice_id uuid,
  party_id uuid,
  document_type text not null check (document_type in ('e_invoice','e_archive')),
  status text not null default 'draft' check (status in ('draft','ready','queued','sent','accepted','rejected','canceled')),
  invoice_no text,
  issue_date date not null default current_date,
  customer_name text not null check (char_length(customer_name) between 2 and 180),
  tax_number text,
  tax_office text,
  email text,
  address text,
  currency text not null default 'TRY',
  subtotal bigint not null default 0 check (subtotal >= 0),
  tax_total bigint not null default 0 check (tax_total >= 0),
  grand_total bigint not null default 0 check (grand_total >= 0),
  provider text not null default 'manual',
  provider_document_id text,
  xml_path text,
  pdf_path text,
  error_message text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_no),
  constraint sales_invoices_billing_org_fk foreign key (billing_invoice_id, organization_id)
    references public.billing_invoices(id, organization_id) on delete no action,
  constraint sales_invoices_party_org_fk foreign key (party_id, organization_id)
    references public.account_parties(id, organization_id) on delete no action
);

create table if not exists public.sales_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  sales_invoice_id uuid not null references public.sales_invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  description text not null check (char_length(description) between 2 and 500),
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  vat_rate numeric(5,2) not null default 20 check (vat_rate >= 0 and vat_rate <= 100),
  line_total bigint not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

alter table public.invoice_series enable row level security;
alter table public.sales_invoices enable row level security;
alter table public.sales_invoice_lines enable row level security;
grant select, insert, update on public.invoice_series, public.sales_invoices, public.sales_invoice_lines to authenticated;

create policy "members_read_invoice_series" on public.invoice_series for select to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id=invoice_series.organization_id and m.user_id=(select auth.uid()) and m.is_active
));
create policy "owners_manage_invoice_series" on public.invoice_series for all to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id=invoice_series.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_memberships m where m.organization_id=invoice_series.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
));
create policy "members_read_sales_invoices" on public.sales_invoices for select to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id=sales_invoices.organization_id and m.user_id=(select auth.uid()) and m.is_active
));
create policy "owners_manage_sales_invoices" on public.sales_invoices for all to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id=sales_invoices.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_memberships m where m.organization_id=sales_invoices.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
));
create policy "members_read_sales_invoice_lines" on public.sales_invoice_lines for select to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id=sales_invoice_lines.organization_id and m.user_id=(select auth.uid()) and m.is_active
));
create policy "owners_manage_sales_invoice_lines" on public.sales_invoice_lines for all to authenticated using (exists (
  select 1 from public.organization_memberships m where m.organization_id=sales_invoice_lines.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
)) with check (exists (
  select 1 from public.organization_memberships m where m.organization_id=sales_invoice_lines.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')
));

create or replace function private.next_invoice_number(p_organization_id uuid,p_document_type text,p_prefix text)
returns text language plpgsql security definer set search_path='' as $$
declare y integer:=extract(year from current_date)::integer; n bigint;
begin
  insert into public.invoice_series(organization_id,document_type,prefix,current_year,last_number)
  values(p_organization_id,p_document_type,upper(p_prefix),y,1)
  on conflict(organization_id,document_type,prefix) do update set
    last_number=case when public.invoice_series.current_year=y then public.invoice_series.last_number+1 else 1 end,
    current_year=y,updated_at=now()
  returning last_number into n;
  return upper(p_prefix)||y::text||lpad(n::text,9,'0');
end;$$;
revoke all on function private.next_invoice_number(uuid,text,text) from public,anon,authenticated;

insert into public.arvo_modules(code,name,description,sort_order,is_active)
values('e_invoice','E-Fatura ve E-Arşiv','Satış faturaları, belge serileri ve entegratör gönderim takibi',80,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,is_active=true;
insert into public.organization_modules(organization_id,module_code,is_enabled)
select id,'e_invoice',true from public.organizations
on conflict(organization_id,module_code) do update set is_enabled=true;

create index if not exists sales_invoices_org_status_idx on public.sales_invoices(organization_id,status,issue_date desc);
create index if not exists sales_invoice_lines_invoice_idx on public.sales_invoice_lines(sales_invoice_id);