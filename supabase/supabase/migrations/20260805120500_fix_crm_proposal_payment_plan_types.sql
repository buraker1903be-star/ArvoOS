create or replace function public.create_crm_proposal_v2(
  target_opportunity_id uuid,
  proposal_title text,
  proposal_scope text,
  proposal_amount bigint,
  proposal_tax_status text,
  proposal_payment_plan_type text,
  proposal_payment_plan text,
  proposal_payment_schedule jsonb,
  proposal_valid_until date,
  proposal_estimated_delivery_date date default null
)
returns table(proposal_id uuid, access_token text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  opp public.crm_opportunities%rowtype;
  raw_token text := encode(gen_random_bytes(24), 'hex');
  new_id uuid;
  next_no text;
  v_net bigint;
  v_tax bigint;
  v_gross bigint;
begin
  select * into opp
  from public.crm_opportunities
  where id = target_opportunity_id;

  if opp.id is null or not public.arvo_is_member(opp.organization_id) then
    raise exception 'opportunity_not_found';
  end if;

  if proposal_tax_status not in ('included', 'excluded', 'exempt') then
    raise exception 'invalid_tax_status';
  end if;

  if proposal_payment_plan_type not in (
    'cash',
    'half',
    'third',
    'custom',
    'installments_3',
    'installments_6',
    'installments_12'
  ) then
    raise exception 'invalid_payment_plan_type';
  end if;

  if proposal_amount < 0 then
    raise exception 'invalid_amount';
  end if;

  if proposal_tax_status = 'included' then
    v_gross := proposal_amount;
    v_net := round(proposal_amount / 1.20);
    v_tax := v_gross - v_net;
  elsif proposal_tax_status = 'excluded' then
    v_net := proposal_amount;
    v_tax := round(proposal_amount * 0.20);
    v_gross := v_net + v_tax;
  else
    v_net := proposal_amount;
    v_tax := 0;
    v_gross := proposal_amount;
  end if;

  next_no := public.next_document_number(
    opp.organization_id,
    'proposal',
    'TKF',
    current_date
  );

  insert into public.crm_proposals(
    organization_id,
    opportunity_id,
    proposal_no,
    title,
    scope,
    amount,
    payment_plan,
    valid_until,
    estimated_delivery_date,
    status,
    access_token_hash,
    created_by,
    tax_status,
    tax_rate,
    net_amount,
    tax_amount,
    gross_amount,
    payment_plan_type,
    payment_schedule
  ) values (
    opp.organization_id,
    opp.id,
    next_no,
    proposal_title,
    proposal_scope,
    v_gross,
    proposal_payment_plan,
    proposal_valid_until,
    proposal_estimated_delivery_date,
    'draft',
    encode(digest(raw_token, 'sha256'), 'hex'),
    auth.uid(),
    proposal_tax_status,
    case when proposal_tax_status = 'exempt' then 0 else 20 end,
    v_net,
    v_tax,
    v_gross,
    proposal_payment_plan_type,
    coalesce(proposal_payment_schedule, '[]'::jsonb)
  )
  returning id into new_id;

  update public.crm_opportunities
  set
    stage = 'proposal',
    probability = 50,
    estimated_value = v_gross,
    updated_at = now()
  where id = opp.id;

  return query select new_id, raw_token;
end
$function$;

revoke all on function public.create_crm_proposal_v2(
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  text,
  jsonb,
  date,
  date
) from public;

grant execute on function public.create_crm_proposal_v2(
  uuid,
  text,
  text,
  bigint,
  text,
  text,
  text,
  jsonb,
  date,
  date
) to authenticated;
