-- Bug: signing a contract (sign_crm_contract) sets crm_opportunities.stage = 'won'
-- at the end of its own flow, which already creates the workflow, payment plan,
-- finance transaction, account entry and invoice correctly. But that stage change
-- also fires the older process_won_crm_opportunity trigger, which independently
-- creates a SECOND workflow and a SECOND billing_invoices row for the same deal,
-- double-counting expected income in the Finance dashboard.
--
-- Fix: the blanket "won" automation must skip opportunities that were already
-- won through a formally signed contract (i.e. a crm_contracts row for this
-- opportunity already has a workflow_id set by sign_crm_contract).

create or replace function private.process_won_crm_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_workflow_id uuid;
  new_invoice_id uuid;
  workflow_due_date date;
begin
  if new.stage <> 'won' or old.stage = 'won' then
    return new;
  end if;

  -- Already handled by the formal contract-signing flow: do nothing.
  if exists (
    select 1 from public.crm_contracts contract
    where contract.opportunity_id = new.id
      and contract.workflow_id is not null
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.crm_automation_runs automation
    where automation.opportunity_id = new.id
  ) then
    return new;
  end if;

  workflow_due_date := coalesce(new.expected_close_date, current_date + 30);

  insert into public.operation_workflows (
    organization_id,
    title,
    customer_name,
    description,
    status,
    priority,
    start_date,
    due_date,
    created_by
  ) values (
    new.organization_id,
    new.title,
    new.customer_name,
    concat('CRM fırsatından otomatik oluşturuldu. Fırsat: ', new.title),
    'planned',
    'normal',
    current_date,
    workflow_due_date,
    new.created_by
  ) returning id into new_workflow_id;

  insert into public.operation_steps (
    organization_id,
    workflow_id,
    title,
    sort_order
  ) values
    (new.organization_id, new_workflow_id, 'Müşteri ihtiyaçlarını ve kapsamı doğrula', 0),
    (new.organization_id, new_workflow_id, 'Teslimat planını oluştur', 1),
    (new.organization_id, new_workflow_id, 'Sorumluları ve terminleri ata', 2),
    (new.organization_id, new_workflow_id, 'Teslimatı tamamla ve müşteri onayı al', 3);

  insert into public.billing_invoices (
    organization_id,
    provider,
    status,
    currency,
    subtotal,
    tax,
    total,
    due_at
  ) values (
    new.organization_id,
    'manual',
    'open',
    'TRY',
    new.estimated_value,
    0,
    new.estimated_value,
    (workflow_due_date::timestamp at time zone 'Europe/Istanbul')
  ) returning id into new_invoice_id;

  insert into public.crm_automation_runs (
    opportunity_id,
    organization_id,
    workflow_id,
    invoice_id
  ) values (
    new.id,
    new.organization_id,
    new_workflow_id,
    new_invoice_id
  );

  insert into public.notifications (
    organization_id,
    audience,
    category,
    title,
    message,
    action_url,
    metadata
  ) values (
    new.organization_id,
    'organization',
    'crm_won_automation',
    'Satış operasyona aktarıldı',
    'Kazanılan fırsat için operasyon iş akışı ve açık ödeme kaydı otomatik oluşturuldu.',
    '/panel/operations',
    jsonb_build_object(
      'opportunity_id', new.id,
      'workflow_id', new_workflow_id,
      'invoice_id', new_invoice_id
    )
  );

  return new;
end;
$$;

revoke all on function private.process_won_crm_opportunity() from public, anon, authenticated;
