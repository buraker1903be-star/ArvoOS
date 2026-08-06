-- Keep account entry source values aligned with contract automation.
alter table public.account_entries
  drop constraint if exists account_entries_source_type_check;

alter table public.account_entries
  add constraint account_entries_source_type_check
  check (source_type = any (array[
    'manual'::text,
    'invoice'::text,
    'payment'::text,
    'expense'::text,
    'adjustment'::text,
    'crm_contract'::text
  ]));

-- A workflow created from a contract must retain its source contract.
alter table public.operation_workflows
  add column if not exists contract_id uuid references public.crm_contracts(id) on delete set null;

update public.operation_workflows workflow
set contract_id = contract.id
from public.crm_contracts contract
where contract.workflow_id = workflow.id
  and workflow.contract_id is null;

create unique index if not exists operation_workflows_contract_id_unique
  on public.operation_workflows(contract_id)
  where contract_id is not null;

create or replace function public.sign_crm_contract(
  public_token text,
  signer_name text,
  signer_ip text default null,
  signer_user_agent text default null
)
returns table(result_status text, workflow_id uuid)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  con public.crm_contracts%rowtype;
  opp public.crm_opportunities%rowtype;
  proposal_schedule jsonb;
  org_slug text;
  template_key text;
  template_version text := '2.0';
  schedule_item jsonb;
  new_wf uuid;
  party uuid;
  plan uuid;
  invoice uuid;
  due_on date;
  installment_count integer := 0;
begin
  select * into con
  from public.crm_contracts
  where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  for update;

  if con.id is null then
    raise exception 'invalid_token';
  end if;

  -- Idempotency: a signed contract or a contract already linked to a workflow
  -- must never create another operation workflow.
  if con.workflow_id is not null then
    return query select
      case when con.status = 'signed' then 'signed' else 'workflow_exists' end,
      con.workflow_id;
    return;
  end if;

  if con.status = 'signed' then
    return query select 'signed', con.workflow_id;
    return;
  end if;

  if length(trim(coalesce(signer_name, ''))) < 2 then
    raise exception 'invalid_signer';
  end if;

  select * into opp
  from public.crm_opportunities
  where id = con.opportunity_id;

  select slug into org_slug
  from public.organizations
  where id = con.organization_id;

  template_key := case
    when regexp_replace(lower(coalesce(org_slug, '')), '[^a-z0-9]', '', 'g') like '%akademikmerkez%'
      then 'akademikmerkez_academic'
    else 'arvoos_general'
  end;

  select coalesce(payment_schedule, '[]'::jsonb)
  into proposal_schedule
  from public.crm_proposals
  where id = con.proposal_id;

  select id into party
  from public.account_parties
  where organization_id = con.organization_id
    and lower(name) = lower(opp.customer_name)
    and is_active = true
  order by created_at
  limit 1;

  if party is null then
    insert into public.account_parties(
      organization_id, party_type, name, email, phone, is_active, created_by
    ) values (
      con.organization_id, 'customer', opp.customer_name,
      opp.contact_email, opp.contact_phone, true, con.created_by
    ) returning id into party;
  end if;

  -- The unique contract_id index is the final database-level safeguard.
  insert into public.operation_workflows(
    organization_id, contract_id, title, customer_name, description,
    status, priority, start_date, due_date, created_by
  ) values (
    con.organization_id, con.id, con.title, opp.customer_name, con.scope,
    'planned', 'normal', coalesce(con.start_date, current_date),
    con.due_date, con.created_by
  )
  on conflict (contract_id) where contract_id is not null
  do update set updated_at = now()
  returning id into new_wf;

  -- Create default steps only when this workflow has no steps yet.
  if not exists (
    select 1 from public.operation_steps where workflow_id = new_wf
  ) then
    insert into public.operation_steps(
      organization_id, workflow_id, title, sort_order
    ) values
      (con.organization_id, new_wf, 'Başlangıç ve kapsam kontrolü', 10),
      (con.organization_id, new_wf, 'Üretim / hizmet çalışması', 20),
      (con.organization_id, new_wf, 'Kalite kontrolü', 30),
      (con.organization_id, new_wf, 'Müşteri teslimi', 40);
  end if;

  due_on := coalesce(con.due_date, current_date + 30);

  insert into public.payment_plans(
    organization_id, contract_id, party_id, total_amount,
    currency, status, created_by
  ) values (
    con.organization_id, con.id, party, con.amount,
    con.currency, 'active', con.created_by
  ) returning id into plan;

  if jsonb_typeof(proposal_schedule) = 'array'
     and jsonb_array_length(proposal_schedule) > 0 then
    for schedule_item in select value from jsonb_array_elements(proposal_schedule)
    loop
      installment_count := installment_count + 1;
      insert into public.payment_installments(
        organization_id, payment_plan_id, installment_no,
        due_date, amount, status
      ) values (
        con.organization_id,
        plan,
        coalesce(nullif(schedule_item->>'sequence', '')::integer, installment_count),
        coalesce(nullif(schedule_item->>'due_date', '')::date, due_on),
        greatest(0, coalesce(nullif(schedule_item->>'amount', '')::bigint, 0)),
        'pending'
      );
    end loop;
  end if;

  if installment_count = 0 then
    insert into public.payment_installments(
      organization_id, payment_plan_id, installment_no,
      due_date, amount, status
    ) values (
      con.organization_id, plan, 1, due_on, con.amount, 'pending'
    );
  end if;

  insert into public.account_entries(
    organization_id, party_id, entry_type, source_type,
    amount, currency, description, reference_no,
    transaction_date, due_date, created_by
  ) values (
    con.organization_id, party, 'debit', 'crm_contract',
    con.amount, con.currency, con.title, con.contract_no,
    current_date, due_on, con.created_by
  );

  insert into public.finance_transactions(
    organization_id, transaction_type, status, title,
    counterparty, category, amount, currency,
    due_date, notes, created_by
  ) values (
    con.organization_id, 'income', 'planned', con.title,
    opp.customer_name, 'Sözleşme Tahsilatı', con.amount,
    con.currency, due_on,
    'Sözleşme ' || con.contract_no || ' üzerinden otomatik oluşturuldu.',
    con.created_by
  );

  insert into public.billing_invoices(
    organization_id, provider, status, currency,
    subtotal, tax, total, due_at
  ) values (
    con.organization_id, 'manual', 'draft', con.currency,
    con.amount, 0, con.amount, due_on::timestamptz
  ) returning id into invoice;

  update public.crm_contracts
  set status = 'signed',
      signed_name = trim(signer_name),
      signed_at = now(),
      signed_ip = nullif(left(trim(coalesce(signer_ip, '')), 120), ''),
      signed_user_agent = nullif(left(trim(coalesce(signer_user_agent, '')), 1000), ''),
      acceptance_recorded_at = now(),
      contract_template_key = template_key,
      contract_template_version = template_version,
      workflow_id = new_wf,
      party_id = party,
      payment_plan_id = plan,
      invoice_id = invoice,
      updated_at = now()
  where id = con.id;

  update public.crm_opportunities
  set stage = 'won', probability = 100, updated_at = now()
  where id = con.opportunity_id;

  return query select 'signed', new_wf;
end
$$;

grant execute on function public.sign_crm_contract(text,text,text,text)
  to anon, authenticated;
