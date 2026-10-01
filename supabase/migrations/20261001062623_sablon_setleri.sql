-- ============================================================
-- Adım şablonu SETLERİ: tez, makale, ödev ayrı listeler
--
-- organization_step_templates'in birincil anahtarı (organization_id, code)
-- idi; yani bir kurumun TEK bir görev listesi olabiliyordu. AkademikMerkez
-- tez, makale, ödev ve yalnızca analiz işleri yapıyor ve bunlar aynı yirmi
-- maddeyle yürümüyor — tezin listesi makale işine de düşüyordu. İş
-- açılırken çalışma türü seçilebilmeli ve adımlar o türün listesinden
-- gelmeli.
--
-- Bugünkü davranış KORUNUYOR: var olan satırlar 'varsayilan' setine
-- taşınıyor, o set kurumun öntanımlısı oluyor ve türü seçilmemiş iş yine
-- onu kullanıyor. Şablonu olmayan kurumlar için hiçbir şey değişmiyor.
-- ============================================================

-- ---------- 1. Set tablosu ----------

create table if not exists public.organization_step_template_sets (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  /*
    Türü seçilmeden açılan iş bu seti kullanır (CRM fırsatından otomatik
    açılan iş, köprüden gelen iş, eski kayıtlar). Kurum başına en fazla
    bir tane: aşağıdaki kısmi tekil dizin bunu zorluyor.
  */
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, code),
  constraint organization_step_template_sets_code_check check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint organization_step_template_sets_name_check check (char_length(name) between 2 and 80),
  constraint organization_step_template_sets_sort_check check (sort_order >= 0)
);

comment on table public.organization_step_template_sets is
  'Kurumun çalışma türleri (tez, makale, ödev…). Her setin kendi görev listesi var: organization_step_templates.set_code.';

create unique index if not exists organization_step_template_sets_default_idx
  on public.organization_step_template_sets(organization_id)
  where is_default;

alter table public.organization_step_template_sets enable row level security;

drop policy if exists admins_manage_step_template_sets on public.organization_step_template_sets;
create policy admins_manage_step_template_sets on public.organization_step_template_sets
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_step_template_sets.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner', 'admin']::membership_role[])
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_step_template_sets.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner', 'admin']::membership_role[])
  ));

drop policy if exists members_read_step_template_sets on public.organization_step_template_sets;
create policy members_read_step_template_sets on public.organization_step_template_sets
  for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_step_template_sets.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

/*
  Supabase public şemasındaki yeni tabloyu anon dahil herkese açıyor;
  kapıyı RLS tutsa da oturumsuz rolün bu tabloda hiçbir işi yok.
*/
revoke all on public.organization_step_template_sets from anon;

-- ---------- 2. Şablon satırı hangi sete ait ----------

alter table public.organization_step_templates
  add column if not exists set_code text not null default 'varsayilan';

comment on column public.organization_step_templates.set_code is
  'Satırın ait olduğu çalışma türü (organization_step_template_sets.code).';

/*
  Var olan satırlar için 'varsayilan' seti üretiliyor — FK'den ÖNCE olmalı,
  yoksa kısıt ilk satırda düşer. Adı kurumun göreceği ad: bugüne kadar tek
  liste vardı, "Varsayılan" onu doğru anlatıyor.
*/
insert into public.organization_step_template_sets (organization_id, code, name, sort_order, is_default)
select distinct t.organization_id, 'varsayilan', 'Varsayılan', 0, true
from public.organization_step_templates t
on conflict (organization_id, code) do nothing;

alter table public.organization_step_templates drop constraint if exists organization_step_templates_pkey;
alter table public.organization_step_templates
  add constraint organization_step_templates_pkey primary key (organization_id, set_code, code);

/*
  SET'İ OLMAYAN SATIR YAZILABİLMELİ.

  Bugüne kadar şablon satırı set kavramı olmadan ekleniyordu (panel, SQL
  Editor, köprü). Yabancı anahtar eklenince bu yolların hepsi, kurumun
  henüz seti yoksa, "foreign key violation" ile düşerdi — hem yeni kurumun
  ilk satırında hem elle yazılan her insert'te. Eksik set burada
  üretiliyor; kurumun ilk seti aynı zamanda öntanımlı oluyor.
*/
create or replace function private.arvo_step_template_set_ensure()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1 from public.organization_step_template_sets s
    where s.organization_id = new.organization_id and s.code = new.set_code
  ) then
    insert into public.organization_step_template_sets (organization_id, code, name, is_default)
    values (
      new.organization_id,
      new.set_code,
      case when new.set_code = 'varsayilan' then 'Varsayılan' else initcap(replace(new.set_code, '_', ' ')) end,
      not exists (
        select 1 from public.organization_step_template_sets s
        where s.organization_id = new.organization_id and s.is_default
      )
    )
    on conflict (organization_id, code) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.arvo_step_template_set_ensure() from public, anon, authenticated;

drop trigger if exists arvo_step_template_set_ensure on public.organization_step_templates;
create trigger arvo_step_template_set_ensure
  before insert on public.organization_step_templates
  for each row execute function private.arvo_step_template_set_ensure();

alter table public.organization_step_templates drop constraint if exists organization_step_templates_set_fkey;
alter table public.organization_step_templates
  add constraint organization_step_templates_set_fkey
    foreign key (organization_id, set_code)
    references public.organization_step_template_sets(organization_id, code)
    on delete cascade;

drop index if exists public.organization_step_templates_org_idx;
create index if not exists organization_step_templates_set_idx
  on public.organization_step_templates(organization_id, set_code, sort_order);

-- ---------- 3. İşin çalışma türü ----------

alter table public.operation_workflows
  add column if not exists step_template_set text;

comment on column public.operation_workflows.step_template_set is
  'İş açılırken seçilen çalışma türü. Boşsa kurumun öntanımlı seti kullanılır.';

/*
  Bileşik FK, sütunlardan biri NULL iken (MATCH SIMPLE) denetlenmiyor:
  türü seçilmemiş iş serbest, seçilmiş iş kurumun gerçek bir setini
  göstermek zorunda.
*/
alter table public.operation_workflows drop constraint if exists operation_workflows_step_set_fkey;
alter table public.operation_workflows
  add constraint operation_workflows_step_set_fkey
    foreign key (organization_id, step_template_set)
    references public.organization_step_template_sets(organization_id, code)
    -- Sütun listesi şart: sade "set null" organization_id'yi de boşaltır ve
    -- NOT NULL kısıtını deler (PostgreSQL 15'ten beri yazılabiliyor).
    on delete set null (step_template_set);

-- ---------- 4. Adımlar seçilen setten üretilsin ----------

create or replace function public.add_standard_operation_steps(target_workflow_id uuid, target_organization_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  wf record;
  plan jsonb;
  set_kodu text;
  eklenen integer := 0;
begin
  -- Adımı olan işe dokunulmaz: fonksiyon tekrar çağrılabilir olmalı.
  if exists (select 1 from public.operation_steps s where s.workflow_id = target_workflow_id) then
    return;
  end if;

  select w.contract_id, w.step_template_set, coalesce(w.start_date, current_date) as start_date
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

  /*
    2) Kurumun şablonu — işin ÇALIŞMA TÜRÜNE ait set. Tür seçilmemişse
    kurumun öntanımlısı; o da yoksa 'varsayilan' (bu migration'dan önceki
    tek liste oraya taşındı).
  */
  set_kodu := coalesce(
    wf.step_template_set,
    (select s.code from public.organization_step_template_sets s
      where s.organization_id = target_organization_id and s.is_default and s.is_active),
    'varsayilan');

  insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date, phase_title)
  select
    target_organization_id,
    target_workflow_id,
    t.title,
    t.sort_order,
    case when t.day_offset is null then null else wf.start_date + t.day_offset end,
    t.phase_title
  from public.organization_step_templates t
  where t.organization_id = target_organization_id and t.is_active and t.set_code = set_kodu
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
