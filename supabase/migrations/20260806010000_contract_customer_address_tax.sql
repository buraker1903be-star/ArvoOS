-- Kurumsal müşteriler için sözleşmede adres ve vergi numarası/dairesi
-- bilgisi gösterilebilmesi için sözleşme üzerine alan ekliyoruz.
-- (Talep/teklif aşamasında zorunlu değil, kurumsal müşterilerde
-- sözleşme düzenlenirken doldurulur.)

alter table public.crm_contracts
  add column if not exists customer_address text,
  add column if not exists customer_tax_number text,
  add column if not exists customer_tax_office text;

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
  signed_name text, signed_at timestamptz, signed_signature_data text
)
language sql
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
    coalesce(p.payment_schedule, '[]'::jsonb),
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
    c.signed_signature_data
  from public.crm_contracts c
  join public.crm_opportunities o on o.id = c.opportunity_id
  join public.organizations org on org.id = c.organization_id
  left join public.crm_proposals p on p.id = c.proposal_id
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
$function$;

revoke all on function public.get_public_crm_contract(text) from public;
grant execute on function public.get_public_crm_contract(text) to anon, authenticated;
