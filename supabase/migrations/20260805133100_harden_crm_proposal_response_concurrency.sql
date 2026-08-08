create or replace function public.respond_to_crm_proposal(
  public_token text,
  decision text
)
returns table(
  result_status text,
  contract_id uuid,
  contract_token text
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  prop public.crm_proposals%rowtype;
  raw_token text;
  new_id uuid;
  next_no text;
begin
  if decision not in ('accept', 'reject') then
    raise exception 'invalid_decision';
  end if;

  select * into prop
  from public.crm_proposals
  where access_token_hash = encode(digest(public_token, 'sha256'), 'hex')
  for update;

  if prop.id is null then
    raise exception 'invalid_token';
  end if;

  if prop.superseded_by is not null then
    return query select 'superseded', null::uuid, null::text;
    return;
  end if;

  if prop.status in ('accepted', 'rejected', 'archived') then
    return query
    select
      prop.status,
      (select id from public.crm_contracts where proposal_id = prop.id),
      null::text;
    return;
  end if;

  if prop.valid_until is not null and prop.valid_until < current_date then
    update public.crm_proposals
    set status = 'expired', updated_at = now()
    where id = prop.id;

    return query select 'expired', null::uuid, null::text;
    return;
  end if;

  if decision = 'reject' then
    update public.crm_proposals
    set status = 'rejected', responded_at = now(), updated_at = now()
    where id = prop.id;

    update public.crm_opportunities
    set
      stage = 'lost',
      probability = 0,
      lost_reason = 'Teklif müşteri tarafından reddedildi',
      updated_at = now()
    where id = prop.opportunity_id;

    return query select 'rejected', null::uuid, null::text;
    return;
  end if;

  raw_token := encode(gen_random_bytes(24), 'hex');
  next_no := public.next_document_number(
    prop.organization_id,
    'contract',
    'SOZ',
    current_date
  );

  insert into public.crm_contracts(
    organization_id,
    opportunity_id,
    proposal_id,
    contract_no,
    title,
    scope,
    amount,
    currency,
    payment_plan,
    status,
    access_token_hash,
    created_by
  ) values (
    prop.organization_id,
    prop.opportunity_id,
    prop.id,
    next_no,
    prop.title,
    prop.scope,
    prop.amount,
    prop.currency,
    prop.payment_plan,
    'draft',
    encode(digest(raw_token, 'sha256'), 'hex'),
    prop.created_by
  )
  returning id into new_id;

  update public.crm_proposals
  set status = 'accepted', responded_at = now(), updated_at = now()
  where id = prop.id;

  update public.crm_opportunities
  set stage = 'contract', probability = 70, updated_at = now()
  where id = prop.opportunity_id;

  return query select 'accepted', new_id, raw_token;
end
$function$;

revoke all on function public.respond_to_crm_proposal(text, text) from public;
grant execute on function public.respond_to_crm_proposal(text, text) to anon, authenticated;
