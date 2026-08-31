create table public.crm_internal_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  context_type text not null check (context_type in ('request','proposal','contract')),
  context_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index crm_internal_comments_chain_idx
  on public.crm_internal_comments (organization_id, opportunity_id, created_at desc);

alter table public.crm_internal_comments enable row level security;
revoke all on public.crm_internal_comments from public, anon;
grant select, insert on public.crm_internal_comments to authenticated;

create policy "assigned members read crm internal comments"
on public.crm_internal_comments for select to authenticated
using (
  organization_id = (
    select o.organization_id from public.crm_opportunities o
    where o.id = opportunity_id
  )
  and private.arvo_can_access_opportunity(opportunity_id)
);

create policy "assigned members add crm internal comments"
on public.crm_internal_comments for insert to authenticated
with check (
  created_by = (select auth.uid())
  and organization_id = (
    select o.organization_id from public.crm_opportunities o
    where o.id = opportunity_id
  )
  and private.arvo_can_access_opportunity(opportunity_id)
);

comment on table public.crm_internal_comments is
  'Talep, teklif ve sözleşme zincirinde yalnızca kurum içi kullanıcıların görebildiği görüşme notları.';
