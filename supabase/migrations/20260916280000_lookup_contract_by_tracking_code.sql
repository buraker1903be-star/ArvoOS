-- Kuruma özel takip sorgusu: canlı fonksiyonun sürüm takibine alınması.
--
-- /durum/<kurum-slug> sayfası bu fonksiyonu çağırıyor
-- (app/durum/[slug]/actions.ts:18). Fonksiyon bugüne kadar yalnızca canlı
-- veritabanında yaşıyordu; hiçbir depoda tanımı yoktu. Veritabanı sıfırdan
-- kurulursa müşteri durum sorgulama sayfası çalışmaz.
--
-- Aynı sınıftan dördü 16 Eylül'de migration'a alınmıştı
-- (create_arvoculture_storefront_order, check_arvoculture_coupon,
-- arc_categorize_supplier_products, submit_public_lead); bu beşincisi.
--
-- Tanım canlıdaki hâliyle aynı; TEK fark aşağıda açıklanan boş slug kapısı.

create or replace function public.lookup_contract_by_tracking_code(
  p_org_slug text,
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
  progress_percentage integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  select
    c.contract_no,
    c.title,
    c.status,
    w.status as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    greatest(0, c.amount - coalesce(ledger.remaining, c.amount)) as paid_amount,
    greatest(0, coalesce(ledger.remaining, c.amount)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage
  from public.crm_contracts c
  join public.organizations o on o.id = c.organization_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral (
    select sum(case when ae.entry_type = 'debit' then ae.amount else -ae.amount end) as remaining
    from public.account_entries ae
    where ae.organization_id = c.organization_id and ae.party_id = c.party_id
  ) ledger on c.party_id is not null
  left join lateral (
    select round(100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0))::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  -- DEĞİŞİKLİK: canlıdaki tanım, slug boş gelirse kurum filtresini tamamen
  -- kaldırıyordu (… is null or o.slug = …). Bu fonksiyon anon anahtarla
  -- çağrılabildiği için boş slug göndermek sorguyu bütün kiracılara açıyordu.
  -- Sayfa slug'ı her zaman yol parametresinden geçiriyor, yani bu kapının
  -- kapanması arayüzde hiçbir şeyi değiştirmez.
  where o.slug = nullif(lower(trim(coalesce(p_org_slug, ''))), '')
    and c.tracking_code = upper(regexp_replace(coalesce(p_tracking_code, ''), '[^A-Za-z0-9]', '', 'g'))
    and length(upper(regexp_replace(coalesce(p_tracking_code, ''), '[^A-Za-z0-9]', '', 'g'))) = 6
    and c.status in ('signed', 'completed')
  limit 1;
$function$;

revoke all on function public.lookup_contract_by_tracking_code(text, text) from public;
grant execute on function public.lookup_contract_by_tracking_code(text, text) to anon, authenticated;
