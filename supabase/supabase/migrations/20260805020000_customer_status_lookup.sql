-- Müşterilerin giriş yapmadan, sadece telefon numaralarının son 4
-- hanesiyle kendi sözleşme(ler)inin güncel durumunu görebilmesi için.
-- Bilerek çok az bilgi döndürür: sadece sözleşme no + durum + son
-- güncelleme tarihi. Tutar, iletişim bilgisi, kapsam gibi hassas
-- bilgiler asla dönmez.

create or replace function public.lookup_contracts_by_phone_suffix(
  p_org_slug text,
  p_phone_suffix text
)
returns table (
  contract_no text,
  contract_title text,
  contract_status text,
  workflow_status text,
  last_update timestamptz
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
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update
  from public.crm_contracts c
  join public.organizations o on o.id = c.organization_id
  left join public.crm_opportunities op on op.id = c.opportunity_id
  left join public.operation_workflows w on w.contract_id = c.id
  where o.slug = lower(trim(p_org_slug))
    and length(regexp_replace(coalesce(p_phone_suffix, ''), '[^0-9]', '', 'g')) = 4
    and regexp_replace(coalesce(op.contact_phone, ''), '[^0-9]', '', 'g')
        like '%' || regexp_replace(p_phone_suffix, '[^0-9]', '', 'g')
    and c.status in ('signed', 'completed')
  order by coalesce(w.updated_at, c.created_at) desc
  limit 20;
$$;

revoke all on function public.lookup_contracts_by_phone_suffix(text, text) from public;
grant execute on function public.lookup_contracts_by_phone_suffix(text, text) to anon, authenticated;
