-- /takip sayfası artık tek, kurum bağımsız bir adres — hangi kuruma ait
-- olduğu doğrudan takip kodundan (globalde benzersiz) çözülüyor. Bu
-- sayede hem app.arvo-os.com/takip hem de özel alan adı üzerinde
-- (örn. akademikmerkez.com/takip) aynı sayfa çalışabiliyor.

create or replace function public.lookup_contract_by_tracking_code_global(
  p_tracking_code text
)
returns table (
  contract_no text,
  contract_title text,
  contract_status text,
  workflow_status text,
  last_update timestamptz,
  total_amount bigint,
  paid_amount bigint,
  remaining_amount bigint,
  progress_percentage integer,
  organization_name text,
  organization_logo_url text,
  organization_primary_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.contract_no,
    c.title,
    c.status,
    w.status as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    greatest(0, c.amount - coalesce(ledger.remaining, c.amount)) as paid_amount,
    greatest(0, coalesce(ledger.remaining, c.amount)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage,
    org.name,
    org.logo_url,
    org.primary_color
  from public.crm_contracts c
  join public.organizations org on org.id = c.organization_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral (
    select
      sum(case when ae.entry_type = 'debit' then ae.amount else -ae.amount end) as remaining
    from public.account_entries ae
    where ae.organization_id = c.organization_id
      and ae.party_id = c.party_id
  ) ledger on c.party_id is not null
  left join lateral (
    select round(
      100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0)
    )::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  where c.tracking_code = upper(trim(p_tracking_code))
    and c.status in ('signed', 'completed')
  limit 1;
$$;

revoke all on function public.lookup_contract_by_tracking_code_global(text) from public;
grant execute on function public.lookup_contract_by_tracking_code_global(text) to anon, authenticated;
