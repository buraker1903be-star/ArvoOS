-- ============================================================
-- BRİFİNG KALDIRILDI
--
-- 01.10.2026 sabahı eklendi, aynı gün kaldırıldı: kurumun kararı. Satış
-- tarafının topladığı bilgi fırsatın kendi alanlarında (konu, kapsam,
-- notlar) zaten duruyor; ayrı bir form ekranı, iki ayrı doldurma yeri ve
-- iki ekranda bölüm getiriyordu.
--
-- SIRA ÖNEMLİ: process_won_crm_opportunity, private.arvo_brief_kopyala'yı
-- çağırıyor. plpgsql gövdesi çağrılan fonksiyonu ÇALIŞMA ANINDA çözüyor;
-- önce gövdeyi temizlemeden fonksiyonu düşürürsek "fırsat kazanıldı"
-- akışı sessizce değil, ilk kullanımda patlardı.
--
-- Veri kaybı bilerek: brifing alanları ve doldurulmuş brifingler gidiyor.
-- Çalışma türü (step_template_set) ve iş adımları bu kaldırmadan
-- ETKİLENMİYOR — aynı günün komşu migration'larıydılar.
-- ============================================================

-- ---------- 1. Fırsat kazanıldığında brifing kopyalanmasın ----------

create or replace function private.process_won_crm_opportunity()
returns trigger language plpgsql security definer set search_path to ''
as $fn$
declare
  new_workflow_id uuid;
  new_invoice_id uuid;
  workflow_due_date date;
begin
  if new.stage <> 'won' or old.stage = 'won' then return new; end if;

  if exists (select 1 from public.crm_contracts c
             where c.opportunity_id = new.id and c.workflow_id is not null) then
    return new;
  end if;

  if exists (select 1 from public.crm_automation_runs a
             where a.opportunity_id = new.id) then
    return new;
  end if;

  workflow_due_date := coalesce(new.expected_close_date, current_date + 30);

  insert into public.operation_workflows (
    organization_id, title, customer_name, description,
    status, priority, start_date, due_date, created_by, step_template_set
  ) values (
    new.organization_id, new.title, new.customer_name,
    concat('CRM fırsatından otomatik oluşturuldu. Fırsat: ', new.title),
    'planned', 'normal', current_date, workflow_due_date, new.created_by,
    new.step_template_set
  ) returning id into new_workflow_id;

  -- Adımlar operation_workflows_seed_standard_steps tetikleyicisinden gelir.

  insert into public.billing_invoices (
    organization_id, provider, status, currency, subtotal, tax, total, due_at
  ) values (
    new.organization_id, 'manual', 'open', 'TRY',
    new.estimated_value, 0, new.estimated_value,
    (workflow_due_date::timestamp at time zone 'Europe/Istanbul')
  ) returning id into new_invoice_id;

  insert into public.crm_automation_runs (opportunity_id, organization_id, workflow_id, invoice_id)
  values (new.id, new.organization_id, new_workflow_id, new_invoice_id);

  insert into public.notifications (
    organization_id, audience, category, title, message, action_url, metadata
  ) values (
    new.organization_id, 'organization', 'crm_won_automation',
    'Satış operasyona aktarıldı',
    'Kazanılan fırsat için operasyon iş akışı ve açık ödeme kaydı otomatik oluşturuldu.',
    '/panel/operations',
    jsonb_build_object('opportunity_id', new.id, 'workflow_id', new_workflow_id, 'invoice_id', new_invoice_id)
  );

  return new;
end;
$fn$;

revoke all on function private.process_won_crm_opportunity() from public, anon, authenticated;

-- ---------- 2. Brifingin kendisi ----------

drop trigger if exists arvo_workflow_brief_devral on public.operation_workflows;
drop function if exists private.arvo_workflow_brief_devral();
drop function if exists private.arvo_brief_kopyala(uuid, uuid, uuid);

drop table if exists public.operation_workflow_briefs;
drop table if exists public.crm_opportunity_briefs;
drop table if exists public.organization_brief_fields;

notify pgrst, 'reload schema';
