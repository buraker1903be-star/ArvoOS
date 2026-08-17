-- Sözleşme imzalanırken IP adresi zaten yakalanıp crm_contracts.signed_ip
-- alanına kaydediliyordu, ama hiçbir yerde (ne panelde ne müşteri
-- belgesinde) gösterilmiyordu. Hukuki geçerlilik için bu bilgi artık
-- herkese açık sözleşme görüntüleme fonksiyonundan da dönüyor.

drop function if exists public.get_public_crm_contract(text);

create or replace function public.get_public_crm_contract(public_token text)
returns table(
  id uuid, contract_no text, title text, scope text, amount bigint, currency text,
  payment_plan text, payment_schedule jsonb, start_date date, due_date date,
  created_at timestamptz, status text, customer_name text, contact_email text,
  contact_phone text, customer_address text, customer_tax_number text, customer_tax_office text,
  organization_name text, organization_slug text, organization_logo_url text,
  organization_primary_color text, organization_document_footer text,
  organization_contact_email text, organization_contact_phone text,
  organization_website_url text, organization_signature_stamp_url text,
  signed_name text, signed_at timestamptz, signed_signature_data text, signed_ip text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select
    c.id,
    c.contract_no,
    c.title,
    c.scope,
    c.amount,
    c.currency,
    c.payment_plan,
    coalesce(c.payment_schedule, p.payment_schedule, '[]'::jsonb),
    c.start_date,
    c.due_date,
    c.created_at,
    c.status,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    c.customer_address,
    c.customer_tax_number,
    c.customer_tax_office,
    org.name,
    org.slug,
    org.logo_url,
    org.primary_color,
    org.document_footer,
    org.contact_email,
    org.contact_phone,
    org.website_url,
    org.signature_stamp_url,
    c.signed_name,
    c.signed_at,
    c.signed_signature_data,
    c.signed_ip
  from public.crm_contracts c
  join public.crm_opportunities o on o.id = c.opportunity_id
  join public.organizations org on org.id = c.organization_id
  left join public.crm_proposals p on p.id = c.proposal_id
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
$function$;

revoke all on function public.get_public_crm_contract(text) from public;
grant execute on function public.get_public_crm_contract(text) to anon, authenticated;

-- Panelde sözleşme yaşam döngüsü / önizleme sayfasında da IP görünsün diye
-- aynı bilgiyi kurum-içi RLS'e tabi normal SELECT'ler zaten okuyabiliyor
-- (crm_contracts.signed_ip herkese açık değil, sadece panel context'inde).

-- Teklif kabul/red kararında da IP adresi yakalanıp saklansın diye alan
-- ekleniyor. Hukuki geçerlilik açısından sözleşmedekiyle aynı mantık.
alter table public.crm_proposals
  add column if not exists response_ip text;

drop function if exists public.respond_to_crm_proposal(text, text);

create or replace function public.respond_to_crm_proposal(public_token text, decision text, p_ip text default null)
 returns table(result_status text, contract_id uuid, contract_token text)
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
    set status = 'rejected', responded_at = now(), updated_at = now(), response_ip = p_ip
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
  set status = 'accepted', responded_at = now(), updated_at = now(), response_ip = p_ip
  where id = prop.id;
  update public.crm_opportunities
  set stage = 'contract', probability = 70, updated_at = now()
  where id = prop.opportunity_id;
  return query select 'accepted', new_id, raw_token;
end
$function$;

revoke all on function public.respond_to_crm_proposal(text, text, text) from public;
grant execute on function public.respond_to_crm_proposal(text, text, text) to anon, authenticated;
