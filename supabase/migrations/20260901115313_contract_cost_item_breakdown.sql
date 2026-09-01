create table if not exists public.contract_cost_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.crm_contracts(id) on delete cascade,
  category text not null default 'Dış hizmet',
  description text not null,
  supplier text,
  amount bigint not null check (amount > 0),
  cost_date date not null default current_date,
  status text not null default 'planned' check (status in ('planned','paid')),
  reference_no text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contract_cost_items_contract_date_idx on public.contract_cost_items(contract_id,cost_date desc);
create index if not exists contract_cost_items_org_status_idx on public.contract_cost_items(organization_id,status);
alter table public.contract_cost_items enable row level security;
grant select,insert,update,delete on public.contract_cost_items to authenticated;

create policy "finance_managers_read_contract_costs" on public.contract_cost_items for select to authenticated using (
  exists(select 1 from public.organization_memberships m where m.organization_id=contract_cost_items.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role::text in ('owner','admin'))
);
create policy "finance_managers_create_contract_costs" on public.contract_cost_items for insert to authenticated with check (
  created_by=(select auth.uid()) and exists(select 1 from public.organization_memberships m where m.organization_id=contract_cost_items.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role::text in ('owner','admin'))
);
create policy "finance_managers_update_contract_costs" on public.contract_cost_items for update to authenticated using (
  exists(select 1 from public.organization_memberships m where m.organization_id=contract_cost_items.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role::text in ('owner','admin'))
) with check (
  exists(select 1 from public.organization_memberships m where m.organization_id=contract_cost_items.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role::text in ('owner','admin'))
);
create policy "finance_managers_delete_contract_costs" on public.contract_cost_items for delete to authenticated using (
  exists(select 1 from public.organization_memberships m where m.organization_id=contract_cost_items.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role::text in ('owner','admin'))
);

insert into public.contract_cost_items(organization_id,contract_id,category,description,supplier,amount,status,reference_no,created_by)
select c.organization_id,c.id,'Dış hizmet','Aktarılan sözleşme hizmet maliyeti',c.service_cost_supplier,c.service_cost,c.service_cost_status,c.service_cost_reference,c.created_by
from public.crm_contracts c
where c.service_cost>0 and not exists(select 1 from public.contract_cost_items i where i.contract_id=c.id);
