-- Operasyon: tamamlanan işler için "Arşivlendi" durumu.
--
-- Neden: Tamamlanan işler aktif işler tablosunda birikiyordu. Eskiden
-- sayfa, ödemesi kapanan tamamlanmış işleri her açılışta canlı olarak
-- "arşiv" listesine ayırıyordu (ayrı bir alan yoktu). Artık arşiv gerçek
-- bir durum: operasyoncu tamamlanan işi "Arşivle" ile arşive gönderir,
-- gerekirse "Arşivden çıkar" ile tamamlandı'ya geri alır.
--
-- Kurallar (veritabanı da uygular, arayüz atlatılsa bile):
--  * Yalnızca "completed" iş arşivlenebilir; arşivdeki iş yalnızca
--    "completed"a geri dönebilir. Yeni iş arşivde oluşturulamaz.
--  * archived_at / archived_by arşivleme anında dolar, çıkarınca silinir.
--  * Arşivlenen iş hâlâ "tamamlanmış" sayılır: operasyon primi iptal
--    edilmez ya da yeniden yazılmaz; müşteri takip ekranları işi
--    "Tamamlandı" görür.
--  * Mevcut ödemesi kapanmış tamamlanmış işler (eski canlı arşiv kuralı)
--    bir kez arşive taşınır; böylece ekrandaki görünüm değişmez.
--
-- Tekrar çalıştırılabilir (idempotent).

-- 1) Kolonlar ------------------------------------------------------------
alter table public.operation_workflows
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

-- 2) Durum kısıtı: 'archived' eklenir -------------------------------------
-- Kısıt tablo oluşturulurken satır içi yazıldığı için adı otomatik
-- (operation_workflows_status_check). Adı farklı olsa bile status
-- listesini denetleyen eski kısıtı bulup kaldırıyoruz.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.operation_workflows'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
      and pg_get_constraintdef(con.oid) ilike '%in_progress%'
  loop
    execute format('alter table public.operation_workflows drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.operation_workflows
  add constraint operation_workflows_status_check
  check (status in ('planned','in_progress','blocked','completed','cancelled','archived'));

alter table public.operation_workflows
  drop constraint if exists operation_workflows_archive_consistency;
alter table public.operation_workflows
  add constraint operation_workflows_archive_consistency
  check ((status = 'archived') = (archived_at is not null));

create index if not exists operation_workflows_org_archived_idx
  on public.operation_workflows(organization_id, archived_at desc)
  where status = 'archived';

-- 3) Durum geçişi koruması ve arşiv damgası -------------------------------
create or replace function public.guard_operation_workflow_archive()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'archived' then
      raise exception 'Yeni iş arşivde oluşturulamaz.' using errcode = 'check_violation';
    end if;
    new.archived_at := null;
    new.archived_by := null;
    return new;
  end if;

  if new.status = 'archived' and old.status is distinct from 'archived' then
    if old.status is distinct from 'completed' then
      raise exception 'Yalnızca tamamlanan işler arşivlenebilir.' using errcode = 'check_violation';
    end if;
    new.archived_at := coalesce(new.archived_at, now());
    new.archived_by := coalesce(new.archived_by, (select auth.uid()));
  elsif old.status = 'archived' and new.status is distinct from 'archived' then
    if new.status is distinct from 'completed' then
      raise exception 'Arşivdeki iş yalnızca tamamlandı durumuna geri alınabilir.' using errcode = 'check_violation';
    end if;
    new.archived_at := null;
    new.archived_by := null;
  elsif new.status is distinct from 'archived' then
    new.archived_at := null;
    new.archived_by := null;
  end if;
  return new;
end $$;

revoke all on function public.guard_operation_workflow_archive() from public, anon, authenticated;

drop trigger if exists guard_operation_workflow_archive on public.operation_workflows;
create trigger guard_operation_workflow_archive
before insert or update of status, archived_at, archived_by on public.operation_workflows
for each row execute function public.guard_operation_workflow_archive();

-- 4) Operasyon primi: 'archived' da tamamlanmış sayılır --------------------
-- 20260912150000'deki davranış korunur; yalnızca "tamamlandı" kümesi
-- {completed, archived} olur. completed <-> archived geçişi primi ne
-- iptal eder ne de yeniden yazar.
create or replace function public.accrue_operation_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_rate numeric(5,2);
  contract_amount bigint := 0;
  was_done boolean := old.status in ('completed', 'archived');
  is_done boolean := new.status in ('completed', 'archived');
begin
  if is_done and not was_done
     and new.assigned_employee_id is not null then
    select operation_commission_rate into employee_rate from public.hr_employees
      where id = new.assigned_employee_id and organization_id = new.organization_id
        and employment_status = 'active';
    if coalesce(employee_rate, 0) > 0 then
      if new.contract_id is not null then
        select coalesce(amount, 0) into contract_amount from public.crm_contracts
          where id = new.contract_id and organization_id = new.organization_id;
      end if;
      insert into public.hr_operation_commissions(
        organization_id, employee_id, workflow_id, contract_id,
        base_amount, commission_rate, commission_amount
      ) values (
        new.organization_id, new.assigned_employee_id, new.id, new.contract_id,
        coalesce(contract_amount, 0), employee_rate,
        round(coalesce(contract_amount, 0) * employee_rate / 100.0)
      )
      on conflict (workflow_id) do update set
        employee_id = excluded.employee_id,
        contract_id = excluded.contract_id,
        base_amount = excluded.base_amount,
        commission_rate = excluded.commission_rate,
        commission_amount = excluded.commission_amount,
        status = 'accrued',
        accrued_at = now(),
        approved_at = null,
        paid_at = null
      where public.hr_operation_commissions.status = 'cancelled';
    end if;
  elsif was_done and not is_done then
    update public.hr_operation_commissions
    set status = 'cancelled'
    where workflow_id = new.id
      and status in ('accrued', 'approved');
  end if;
  return new;
end $$;

revoke all on function public.accrue_operation_commission() from public, anon, authenticated;

-- 5) Müşteri takip ekranları: arşivlenen iş "completed" görünür -----------
-- (/takip, /durum/<kurum>, /is-durumu). Arayüz kodu değişmeden
-- "Tamamlandı" yazar; iç arşiv durumu müşteriye sızmaz.
create or replace function public.lookup_contract_by_tracking_code_global(
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
  progress_percentage integer,
  organization_name text,
  organization_logo_url text,
  organization_primary_color text
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
    case when w.status = 'archived' then 'completed' else w.status end as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    coalesce(collections.net_paid, 0) as paid_amount,
    greatest(0, c.amount - coalesce(collections.net_paid, 0)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage,
    org.name,
    org.logo_url,
    org.primary_color
  from public.crm_contracts c
  join public.organizations org on org.id = c.organization_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral (
    select least(
      c.amount,
      greatest(
        0,
        coalesce(sum(ae.amount) filter (where ae.entry_type = 'credit'), 0)
        - coalesce(sum(ae.amount) filter (
            where ae.entry_type = 'debit' and ae.source_type = 'adjustment'
          ), 0)
      )
    )::bigint as net_paid
    from public.account_entries ae
    where ae.organization_id = c.organization_id
      and ae.party_id = c.party_id
  ) collections on c.party_id is not null
  left join lateral (
    select round(
      100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0)
    )::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  where c.tracking_code = upper(trim(p_tracking_code))
    and c.status in ('signed', 'completed')
  limit 1;
$$;

revoke all on function public.lookup_contract_by_tracking_code_global(text) from public;
grant execute on function public.lookup_contract_by_tracking_code_global(text) to anon, authenticated;

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
    case when w.status = 'archived' then 'completed' else w.status end as workflow_status,
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

-- 6) Eski canlı arşivi kalıcı hale getir -----------------------------------
-- Sayfanın eski kuralıyla aynı: tamamlanmış VE (sözleşmesiz YA DA
-- sözleşmesine fatura bağlanmamış YA DA faturası ödenmiş) işler.
-- updated_at'e dokunulmaz (müşterinin "son güncelleme"si değişmesin).
update public.operation_workflows w
set status = 'archived',
    archived_at = coalesce(w.updated_at, now()),
    archived_by = null
where w.status = 'completed'
  and (
    w.contract_id is null
    or exists (
      select 1 from public.crm_contracts c
      where c.id = w.contract_id
        and (
          c.invoice_id is null
          or exists (select 1 from public.billing_invoices i where i.id = c.invoice_id and i.status = 'paid')
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Doğrulama (Supabase SQL editöründe ayrı çalıştırın):
--
-- select status, count(*) as is_sayisi,
--        count(*) filter (where archived_at is not null) as arsiv_damgali
-- from public.operation_workflows group by status order by status;
--   -> 'archived' satırlarında is_sayisi = arsiv_damgali, diğerlerinde arsiv_damgali = 0
--
-- select conname, pg_get_constraintdef(oid) from pg_constraint
-- where conrelid = 'public.operation_workflows'::regclass and contype = 'c'
--   and conname in ('operation_workflows_status_check','operation_workflows_archive_consistency');
--   -> iki satır; status listesinde 'archived' var
--
-- select w.status, c.status as prim_durumu, count(*)
-- from public.hr_operation_commissions c join public.operation_workflows w on w.id = c.workflow_id
-- group by 1, 2 order by 1, 2;
--   -> 'archived' işlerin primi 'cancelled' OLMAMALI (accrued/approved/paid)
-- ---------------------------------------------------------------------------
