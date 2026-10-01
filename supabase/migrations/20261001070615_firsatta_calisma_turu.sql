-- ============================================================
-- Çalışma türü FIRSATTA seçiliyor
--
-- Tür (tez / makale / ödev) bugüne kadar yalnızca iş açılırken
-- seçilebiliyordu. İki şeyi kırıyordu:
--
--   * Brifingin türe bağlı soruları ("veri ne zaman gelecek", yalnızca
--     tez ve analizde) satışçıya hiç görünmüyordu — oysa tezle makaleyi
--     bilen kişi odur.
--   * Fırsat kazanılınca açılan iş türsüz doğuyor, görev listesini
--     kurumun öntanımlı setinden alıyordu. Makale işi tezin yirmi
--     maddesiyle açılıyordu.
--
-- Tür artık fırsatta seçiliyor ve işe taşınıyor. Seçilmezse davranış
-- aynı: öntanımlı set.
-- ============================================================

alter table public.crm_opportunities
  add column if not exists step_template_set text;

comment on column public.crm_opportunities.step_template_set is
  'Çalışma türü (organization_step_template_sets.code). İş açılırken işe taşınır; boşsa kurumun öntanımlısı.';

/*
  Bileşik FK, sütunlardan biri NULL iken (MATCH SIMPLE) denetlenmiyor:
  türü seçilmemiş fırsat serbest, seçilmiş fırsat kurumun gerçek bir
  setini göstermek zorunda. Set silinince yalnızca bu sütun boşalıyor —
  sütun listesi olmadan organization_id de boşalır ve NOT NULL kısıtı
  düşerdi.
*/
alter table public.crm_opportunities drop constraint if exists crm_opportunities_step_set_fkey;
alter table public.crm_opportunities
  add constraint crm_opportunities_step_set_fkey
    foreign key (organization_id, step_template_set)
    references public.organization_step_template_sets(organization_id, code)
    on delete set null (step_template_set);

/*
  Sözleşmeden açılan iş (sign_crm_contract) türü DOLAYLI biliyor:
  crm_contracts.opportunity_id. İmza fonksiyonu uzun ve donmuş bir gövde;
  brifingde olduğu gibi burada da tetikleyici kullanıyoruz.

  BEFORE INSERT olmak zorunda: adımları üreten tetikleyici
  (operation_workflows_seed_standard_steps) AFTER INSERT'te çalışıyor ve
  satırdaki step_template_set'i okuyor. Sonradan yazsaydık görev listesi
  çoktan yanlış setten üretilmiş olurdu.
*/
create or replace function private.arvo_workflow_turu_devral()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_tur text;
begin
  if new.step_template_set is not null or new.contract_id is null then
    return new;
  end if;
  select o.step_template_set into v_tur
  from public.crm_contracts c
  join public.crm_opportunities o
    on o.id = c.opportunity_id and o.organization_id = c.organization_id
  where c.id = new.contract_id and c.organization_id = new.organization_id;
  new.step_template_set := v_tur;
  return new;
end;
$$;

revoke all on function private.arvo_workflow_turu_devral() from public, anon, authenticated;

drop trigger if exists arvo_workflow_turu_devral on public.operation_workflows;
create trigger arvo_workflow_turu_devral
  before insert on public.operation_workflows
  for each row execute function private.arvo_workflow_turu_devral();

/*
  Fırsat "kazanıldı" yolunda iş sözleşmesiz açılıyor; tür doğrudan
  fırsattan geçiyor. (Gövdenin kalanı 20261001064709'daki hâliyle aynı.)
*/
create or replace function private.process_won_crm_opportunity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_workflow_id uuid;
  new_invoice_id uuid;
  workflow_due_date date;
begin
  if new.stage <> 'won' or old.stage = 'won' then
    return new;
  end if;

  if exists (
    select 1 from public.crm_contracts contract
    where contract.opportunity_id = new.id
      and contract.workflow_id is not null
  ) then
    return new;
  end if;

  if exists (
    select 1 from public.crm_automation_runs automation
    where automation.opportunity_id = new.id
  ) then
    return new;
  end if;

  workflow_due_date := coalesce(new.expected_close_date, current_date + 30);

  insert into public.operation_workflows (
    organization_id, title, customer_name, description,
    status, priority, start_date, due_date, created_by, step_template_set
  ) values (
    new.organization_id,
    new.title,
    new.customer_name,
    concat('CRM fırsatından otomatik oluşturuldu. Fırsat: ', new.title),
    'planned', 'normal', current_date, workflow_due_date, new.created_by,
    new.step_template_set
  ) returning id into new_workflow_id;

  -- Adımlar operation_workflows_seed_standard_steps tetikleyicisinden gelir.
  perform private.arvo_brief_kopyala(new.organization_id, new.id, new_workflow_id);

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
    new.organization_id,
    'organization',
    'crm_won_automation',
    'Satış operasyona aktarıldı',
    'Kazanılan fırsat için operasyon iş akışı ve açık ödeme kaydı otomatik oluşturuldu.',
    '/panel/operations',
    jsonb_build_object('opportunity_id', new.id, 'workflow_id', new_workflow_id, 'invoice_id', new_invoice_id)
  );

  return new;
end;
$function$;

revoke all on function private.process_won_crm_opportunity() from public, anon, authenticated;

notify pgrst, 'reload schema';
