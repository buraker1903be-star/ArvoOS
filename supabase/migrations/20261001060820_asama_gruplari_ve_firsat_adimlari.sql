-- ============================================================
-- İş adımları: aşama grupları + fırsattan açılan işin listesi
--
-- AkademikMerkez'in operasyon ekibinden gelen tablo iki seviyeli: sekiz
-- AŞAMA, içlerinde toplam yirmi GÖREV; tarih, sorumlu ve durum görevin.
-- Bizdeki liste düzdü. İki değişiklik bunu kapatıyor, biri de bugün
-- canlıda duran bir hatayı.
--
-- 1) Fırsat "kazanıldı" yapılınca açılan işe DÖRT GENEL ADIM ekleniyordu
--    ("Müşteri ihtiyaçlarını ve kapsamı doğrula", …). Oysa işi açan
--    tetikleyici (operation_workflows_seed_standard_steps) kurumun kendi
--    şablonunu zaten kuruyor. Sonuç, PGlite'ta ölçüldüğü hâliyle, iki
--    listenin karışımıydı — üstelik sabit adımların sort_order'ı 0-3
--    olduğu için şablonun ÜSTÜNDE duruyorlardı:
--
--        0  Müşteri ihtiyaçlarını ve kapsamı doğrula   [tarihsiz]
--        1  Teslimat planını oluştur                   [tarihsiz]
--        2  Sorumluları ve terminleri ata              [tarihsiz]
--        3  Teslimatı tamamla ve müşteri onayı al      [tarihsiz]
--       10  Tez Öneri Formunun Hazırlanması            [08.10]
--       20  Literatür Bölümünün Tamamının Gönderilmesi [31.10]
--
--    Satışçı fırsatı kazandı işaretlediğinde operasyoncunun gördüğü liste
--    buydu. Adım listesinin kaynağı tek olmalı: add_standard_operation_steps.
--
-- 2) Adımlara ve şablona aşama başlığı ekleniyor (phase_title). Grup
--    NUMARASI saklanmıyor; ekran ardışık aynı başlıkları toplayıp sırayla
--    numaralandırıyor. İkinci bir sütun tutulsaydı sıra ile numara
--    birbirinden ayrı düşebilir, "3. aşama"nın altında 2 numaralı görev
--    görünebilirdi.
--
-- Bu migration var olan hiçbir işin adımlarına dokunmaz: şablon yalnızca
-- YENİ işi etkiler (yarısı bitmiş bir tezin listesi altından değişmemeli).
-- ============================================================

-- ---------- 1. Fırsattan açılan iş şablonu kullansın ----------

/*
  Gövdenin tamamı canlı şemadan alındı; TEK değişiklik, operation_steps'e
  yapılan dört satırlık insert'in kaldırılması. Fatura, otomasyon kaydı ve
  bildirim aynen duruyor.
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

  -- Already handled by the formal contract-signing flow: do nothing.
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
    organization_id,
    title,
    customer_name,
    description,
    status,
    priority,
    start_date,
    due_date,
    created_by
  ) values (
    new.organization_id,
    new.title,
    new.customer_name,
    concat('CRM fırsatından otomatik oluşturuldu. Fırsat: ', new.title),
    'planned',
    'normal',
    current_date,
    workflow_due_date,
    new.created_by
  ) returning id into new_workflow_id;

  /*
    Adımlar BURADA ÜRETİLMEZ. İşin eklenmesi
    operation_workflows_seed_standard_steps tetikleyicisini çalıştırır; o da
    add_standard_operation_steps ile sırasıyla sözleşmenin ara teslim
    takvimine, kurumun şablonuna, en son varsayılan sekiz adıma bakar.
  */

  insert into public.billing_invoices (
    organization_id,
    provider,
    status,
    currency,
    subtotal,
    tax,
    total,
    due_at
  ) values (
    new.organization_id,
    'manual',
    'open',
    'TRY',
    new.estimated_value,
    0,
    new.estimated_value,
    (workflow_due_date::timestamp at time zone 'Europe/Istanbul')
  ) returning id into new_invoice_id;

  insert into public.crm_automation_runs (
    opportunity_id,
    organization_id,
    workflow_id,
    invoice_id
  ) values (
    new.id,
    new.organization_id,
    new_workflow_id,
    new_invoice_id
  );

  insert into public.notifications (
    organization_id,
    audience,
    category,
    title,
    message,
    action_url,
    metadata
  ) values (
    new.organization_id,
    'organization',
    'crm_won_automation',
    'Satış operasyona aktarıldı',
    'Kazanılan fırsat için operasyon iş akışı ve açık ödeme kaydı otomatik oluşturuldu.',
    '/panel/operations',
    jsonb_build_object(
      'opportunity_id', new.id,
      'workflow_id', new_workflow_id,
      'invoice_id', new_invoice_id
    )
  );

  return new;
end;
$function$;

-- Tetikleyici fonksiyonu; doğrudan çağrılamaz, EXECUTE yetkisi de gerekmez.
revoke all on function private.process_won_crm_opportunity() from public, anon, authenticated;

-- ---------- 2. Aşama başlığı ----------

alter table public.operation_steps
  add column if not exists phase_title text;

alter table public.organization_step_templates
  add column if not exists phase_title text;

comment on column public.operation_steps.phase_title is
  'Görevin ait olduğu aşama ("4 · Veri ve Analiz"in başlığı). Boşsa görev gruplanmadan listelenir.';
comment on column public.organization_step_templates.phase_title is
  'Şablon satırının aşaması. Ardışık aynı başlıklı satırlar ekranda tek grup olur.';

alter table public.operation_steps drop constraint if exists operation_steps_phase_title_check;
alter table public.operation_steps
  add constraint operation_steps_phase_title_check
    check (phase_title is null or char_length(phase_title) between 2 and 80);

alter table public.organization_step_templates drop constraint if exists organization_step_templates_phase_check;
alter table public.organization_step_templates
  add constraint organization_step_templates_phase_check
    check (phase_title is null or char_length(phase_title) between 2 and 80);

-- ---------- 3. Şablondaki aşama işe taşınsın ----------

/*
  İmza ve üç kaynaklı öncelik aynı kaldı; yalnızca şablon dalı phase_title'ı
  da kopyalıyor. Sözleşmenin ara teslim takvimi (work_plan) aşama taşımaz:
  o liste müşteriye satılan taahhüttür, en fazla 20 kalemdir ve her
  kaleminde tarih zorunludur — operasyonun iki seviyeli görev listesi
  değildir. Sözleşmesi olan iş bu yüzden gruplanmadan açılır.
*/
create or replace function public.add_standard_operation_steps(target_workflow_id uuid, target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  wf record;
  plan jsonb;
  eklenen integer := 0;
begin
  -- Adımı olan işe dokunulmaz: fonksiyon tekrar çağrılabilir olmalı.
  if exists (select 1 from public.operation_steps s where s.workflow_id = target_workflow_id) then
    return;
  end if;

  select w.contract_id, coalesce(w.start_date, current_date) as start_date
  into wf
  from public.operation_workflows w
  where w.id = target_workflow_id and w.organization_id = target_organization_id;

  -- 1) Sözleşmenin ara teslim takvimi
  if wf.contract_id is not null then
    select c.work_plan into plan
    from public.crm_contracts c
    where c.id = wf.contract_id and c.organization_id = target_organization_id;
  end if;

  if jsonb_typeof(plan) = 'array' and jsonb_array_length(plan) > 0 then
    insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date)
    select
      target_organization_id,
      target_workflow_id,
      left(trim(item.value ->> 'title'), 180),
      (row_number() over (order by item.value ->> 'due_date', (item.value ->> 'sequence')::int))::int * 10,
      nullif(item.value ->> 'due_date', '')::date
    from jsonb_array_elements(plan) as item(value)
    where char_length(trim(coalesce(item.value ->> 'title', ''))) >= 2;
    get diagnostics eklenen = row_count;
    if eklenen > 0 then return; end if;
  end if;

  -- 2) Kurumun kendi şablonu
  insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date, phase_title)
  select
    target_organization_id,
    target_workflow_id,
    t.title,
    t.sort_order,
    case when t.day_offset is null then null else wf.start_date + t.day_offset end,
    t.phase_title
  from public.organization_step_templates t
  where t.organization_id = target_organization_id and t.is_active
  order by t.sort_order, t.code;
  get diagnostics eklenen = row_count;
  if eklenen > 0 then return; end if;

  -- 3) Varsayılan (bugünkü davranış)
  insert into public.operation_steps (organization_id, workflow_id, title, sort_order)
  select target_organization_id, target_workflow_id, item.title, item.sort_order
  from (values
    ('İş Kabul Edildi'::text, 10),
    ('Hazırlık Yapılıyor'::text, 20),
    ('Hazırlanıyor'::text, 30),
    ('İç Kontrol Yapılıyor'::text, 40),
    ('Hazırlandı'::text, 50),
    ('Müşteri İlişkileri Talimatı Bekleniyor'::text, 60),
    ('Revizyonlar Yapılıyor'::text, 70),
    ('Evrak Teslimine Hazır'::text, 80)
  ) as item(title, sort_order);
end;
$$;

revoke all on function public.add_standard_operation_steps(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_standard_operation_steps(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
