alter table public.crm_proposals
  add column if not exists share_token text;

alter table public.crm_contracts
  add column if not exists share_token text;

create unique index if not exists crm_proposals_share_token_key
  on public.crm_proposals (share_token)
  where share_token is not null;

create unique index if not exists crm_contracts_share_token_key
  on public.crm_contracts (share_token)
  where share_token is not null;

create or replace function public.issue_crm_proposal_link(target_proposal_id uuid)
returns text
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $function$
declare
  p public.crm_proposals%rowtype;
  raw_token text;
begin
  select * into p
  from public.crm_proposals
  where id = target_proposal_id
  for update;

  if p.id is null or not public.arvo_is_member(p.organization_id) then
    raise exception 'proposal_not_found';
  end if;

  raw_token := coalesce(p.share_token, encode(extensions.gen_random_bytes(24), 'hex'));

  update public.crm_proposals
  set share_token = raw_token,
      access_token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
      status = case when status = 'draft' then 'sent' else status end,
      sent_at = coalesce(sent_at, now()),
      updated_at = now()
  where id = p.id;

  return raw_token;
end
$function$;

create or replace function public.issue_crm_contract_link(target_contract_id uuid)
returns text
language plpgsql
security invoker
set search_path to 'public', 'extensions'
as $function$
declare
  c public.crm_contracts%rowtype;
  raw_token text;
begin
  select * into c
  from public.crm_contracts
  where id = target_contract_id
  for update;

  if c.id is null or not public.arvo_is_member(c.organization_id) then
    raise exception 'contract_not_found';
  end if;

  raw_token := coalesce(c.share_token, encode(extensions.gen_random_bytes(24), 'hex'));

  update public.crm_contracts
  set share_token = raw_token,
      access_token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex'),
      status = case when status = 'draft' then 'sent' else status end,
      sent_at = coalesce(sent_at, now()),
      updated_at = now()
  where id = c.id;

  return raw_token;
end
$function$;
