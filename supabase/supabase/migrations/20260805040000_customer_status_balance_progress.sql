-- Müşteri durum sorgulama ekranına kalan bakiye ve iş ilerleme yüzdesi
-- de eklensin diye arama fonksiyonunu genişletiyoruz. Yine bilerek
-- minimum bilgi: toplam tutar, ödenen tutar, kalan bakiye ve ilerleme
-- yüzdesi — kalem detayı, diğer işlemler, iletişim bilgisi gibi hiçbir
-- ek hassas veri dönmez.

create or replace function public.lookup_contracts_by_phone_suffix(
  p_org_slug text,
  p_phone_suffix text
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
  progress_percentage integer
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
    coalesce(paid.paid_amount, 0) as paid_amount,
    greatest(0, c.amount - coalesce(paid.paid_amount, 0)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage
  from public.crm_contracts c
  join public.organizations o on o.id = c.organization_id
  left join public.crm_opportunities op on op.id = c.opportunity_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral (
    select sum(pi.amount) as paid_amount
    from public.payment_plans pp
    join public.payment_installments pi on pi.payment_plan_id = pp.id
    where pp.contract_id = c.id and pi.status = 'paid'
  ) paid on true
  left join lateral (
    select round(
      100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0)
    )::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
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
