-- ============================================================
-- İş adımları: tarih, sorumlu, durum + kiracıya göre şablon
--
-- AkademikMerkez çalışanından gelen öneri: "görevi tarihlerle bölümlere
-- ayırırsak işler çoğaldığında yönetim daha rahat olacaktır — ilk
-- gönderilmesi gereken taslak+kaynaklar, sonra literatür bölümü ilk kısım,
-- ikinci kısım, en son varsa analiz; tez bittiğinde müşteri sunum isterse
-- son aşama sunum olabilir."
--
-- İstenenin yarısı zaten vardı ama iki yarı birbirini tanımıyordu:
--
--   * operation_steps bir kontrol listesiydi: başlık, sıra, bir onay
--     kutusu. TARİH YOK, SORUMLU YOK. "Literatür 1. kısım 12 Ekim'de"
--     bilgisi hiçbir yere yazılamıyordu.
--   * crm_contracts.work_plan tam da bu: en fazla 20 kalem, her biri
--     başlık + teslim tarihi. Sözleşmenin 4.3 maddesi olarak basılıyor,
--     müşteri takip sayfasında görünüyor. Ama iş açılırken adımlara
--     KOPYALANMIYORDU — müşteriye tarihleriyle satılan plan, işi yapan
--     kişinin ekranına hiç ulaşmıyordu. O ekranda herkese aynı gelen 8
--     genel adım vardı.
--
-- Bu migration üç şey yapıyor:
--   1. operation_steps'e due_date, assigned_employee_id ve status ekliyor.
--   2. Adım listesini kiracının tanımlayabileceği bir şablona bağlıyor
--      (organization_step_templates) — bugünkü 8 adım, şablon tanımlamamış
--      kurumlar için yedek olarak duruyor.
--   3. İş bir sözleşmeden açılıyorsa adımları o sözleşmenin work_plan'ından
--      üretiyor; müşteriye satılan takvim işin ekranına düşüyor.
-- ============================================================

-- ---------- 1. Adımın tarihi, sorumlusu ve durumu ----------

alter table public.operation_steps
  add column if not exists due_date date,
  add column if not exists assigned_employee_id uuid,
  add column if not exists status text not null default 'planned',
  -- Termin hatırlatması kime, kaç kez gitti (cron: /api/cron/adim-terminleri).
  add column if not exists reminder_state text,
  add column if not exists reminder_sent_at timestamptz;

comment on column public.operation_steps.due_date is
  'Adımın teslim tarihi. Sözleşmenin work_plan kaleminden ya da kurum şablonundaki gün ofsetinden gelir.';
comment on column public.operation_steps.status is
  'planned | in_progress | review | done. is_completed bu sütundan türer (arvo_operation_step_status_sync).';
comment on column public.operation_steps.reminder_state is
  'Termin hatırlatmasının en son hangi durum için gittiği: due_soon | overdue. Aynı uyarı iki kez gitmesin diye.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'operation_steps_assigned_employee_fkey') then
    alter table public.operation_steps
      add constraint operation_steps_assigned_employee_fkey
        foreign key (assigned_employee_id) references public.hr_employees(id) on delete set null;
  end if;
end $$;

alter table public.operation_steps drop constraint if exists operation_steps_status_check;
alter table public.operation_steps
  add constraint operation_steps_status_check
    check (status in ('planned', 'in_progress', 'review', 'done'));

alter table public.operation_steps drop constraint if exists operation_steps_reminder_state_check;
alter table public.operation_steps
  add constraint operation_steps_reminder_state_check
    check (reminder_state is null or reminder_state in ('due_soon', 'overdue'));

/*
  Var olan satırların durumu onay kutusundan türetiliyor; şema değişikliği
  hiçbir işin ilerlemesini oynatmamalı.
*/
update public.operation_steps set status = 'done' where is_completed and status <> 'done';

/*
  Tamamlanma tutarlılığı gevşetiliyor: eski kural completed_BY'ı da zorunlu
  tutuyordu. Bir adımı bundan sonra otomasyon da kapatabilir (cron, köprü,
  SQL Editor) ve orada auth.uid() boştur; kural aynen kalsaydı o yol
  CHECK ihlaliyle düşerdi. Zaman damgası kalıyor — "ne zaman bitti"
  sorusunun cevabı odur; "kim bitirdi" bir atıf alanı ve boş kalabilir.
*/
alter table public.operation_steps drop constraint if exists operation_steps_completion_consistency;
alter table public.operation_steps
  add constraint operation_steps_completion_consistency
    check (
      (is_completed = false and completed_at is null and completed_by is null)
      or (is_completed = true and completed_at is not null)
    );

create index if not exists operation_steps_due_idx
  on public.operation_steps(due_date)
  where due_date is not null and is_completed = false;

create index if not exists operation_steps_assignee_idx
  on public.operation_steps(assigned_employee_id)
  where assigned_employee_id is not null;

/*
  status ile is_completed'ı BİRBİRİNE BAĞLAYAN tetikleyici.

  Neden iki sütun birden duruyor: is_completed'ı okuyan üç ayrı yer var —
  sync_workflow_completion_from_steps (bütün adımlar bitince işi tamamlandı
  yapar) ve müşteriye yüzde gösteren üç arama fonksiyonu
  (lookup_contract_by_tracking_code*, lookup_contracts_by_phone_suffix).
  Sütunu kaldırmak ya da üretilen (generated) bir sütuna çevirmek, canlıda
  elle uygulanan bir migration'ın ortasında bu üç yolu da kırma riski
  taşıyordu.

  Bunun yerine tek YAZILABİLİR gerçek status; is_completed ondan türüyor.
  Ters yön de destekleniyor: yalnızca is_completed yazan eski kod
  (process_won_crm_opportunity, PostgREST'e doğrudan giden bir istemci)
  çalışmaya devam ediyor ve status kendiliğinden uyuyor. İkisi ayrı ayrı
  yazılırsa status kazanır — tek kaynak odur.
*/
create or replace function private.arvo_operation_step_status_sync()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
declare
  status_changed boolean;
  completed_changed boolean;
begin
  if tg_op = 'INSERT' then
    -- Ekleme: hangisi bilerek verildiyse o kazanır, diğeri ona uydurulur.
    if new.status is distinct from 'planned' then
      new.is_completed := (new.status = 'done');
    else
      new.status := case when coalesce(new.is_completed, false) then 'done' else 'planned' end;
    end if;
  else
    status_changed := new.status is distinct from old.status;
    completed_changed := new.is_completed is distinct from old.is_completed;

    if status_changed then
      new.is_completed := (new.status = 'done');
    elsif completed_changed then
      -- Onay kutusu kaldırılınca 'done' dışındaki ara durum korunur:
      -- "kontrolde" idiyse geri alma onu "planlandı"ya düşürmemeli.
      new.status := case
        when new.is_completed then 'done'
        when old.status = 'done' then 'planned'
        else old.status
      end;
    end if;
  end if;

  if new.is_completed then
    new.completed_at := coalesce(new.completed_at, now());
    new.completed_by := coalesce(new.completed_by, (select auth.uid()));
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;

  -- Tarih ya da tamamlanma değiştiyse hatırlatma işareti sıfırlanır:
  -- ertelenen bir adım için "gecikti" uyarısı bir daha gitmeli.
  if tg_op = 'UPDATE' and (new.due_date is distinct from old.due_date or new.is_completed is distinct from old.is_completed) then
    new.reminder_state := null;
    new.reminder_sent_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.arvo_operation_step_status_sync() from public, anon;
grant execute on function private.arvo_operation_step_status_sync() to authenticated, service_role;

drop trigger if exists arvo_operation_step_status_sync on public.operation_steps;
create trigger arvo_operation_step_status_sync
  before insert or update on public.operation_steps
  for each row execute function private.arvo_operation_step_status_sync();

/*
  Bütün adımlar bitince işi 'completed' yapan tetikleyici GENİŞLETİLİYOR.

  Postgres'te "after update OF is_completed", sütunun DEĞERİNE değil UPDATE
  ifadesinin SET listesinde ADININ GEÇMESİNE bakar. Adım artık status
  yazılarak kapatılıyor ve is_completed'ı BEFORE tetikleyicisi dolduruyor;
  yani SET listesinde geçmiyor. Liste genişletilmeseydi son adım
  tamamlandığında iş 'planned' kalırdı — hata da vermezdi, yalnızca
  müşteriye giden yüzde %100'ü gösterirken işin durumu açık görünürdü.
  (tests/db/is-adimlari.test.mjs bunu sabitliyor.)
*/
drop trigger if exists sync_workflow_completion_from_steps on public.operation_steps;
create trigger sync_workflow_completion_from_steps
  after insert or delete or update of is_completed, status on public.operation_steps
  for each row execute function public.sync_workflow_completion_from_steps();

-- ---------- 2. Kiracının adım şablonu ----------

/*
  Bugüne kadar 8 standart adım bir SQL fonksiyonunun gövdesinde SABİT
  yazılıydı (add_standard_operation_steps). CRM aşamaları çoktan
  kiracıya göre ayarlanabilirken (organization_crm_stages) adımlar
  değildi: ikinci bir kiracı AkademikMerkez'in akademik adım adlarını
  ("İç Kontrol Yapılıyor", "Evrak Teslimine Hazır") miras alıyordu.

  Tablo aynı kalıpta: birincil anahtar (organization_id, code).
*/
create table if not exists public.organization_step_templates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  title text not null,
  sort_order integer not null default 0,
  -- İşin başlangıç tarihine eklenecek gün; boşsa adım tarihsiz açılır.
  day_offset integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, code),
  constraint organization_step_templates_title_check check (char_length(title) between 2 and 180),
  constraint organization_step_templates_code_check check (code ~ '^[a-z0-9_]{2,40}$'),
  constraint organization_step_templates_sort_check check (sort_order >= 0),
  constraint organization_step_templates_offset_check check (day_offset is null or day_offset between 0 and 3650)
);

comment on table public.organization_step_templates is
  'Kurumun kendi iş adımı şablonu. Boşsa add_standard_operation_steps varsayılan 8 adımı kullanır.';

create index if not exists organization_step_templates_org_idx
  on public.organization_step_templates(organization_id, sort_order);

alter table public.organization_step_templates enable row level security;

drop policy if exists admins_manage_step_templates on public.organization_step_templates;
create policy admins_manage_step_templates on public.organization_step_templates
  for all to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_step_templates.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner', 'admin']::membership_role[])
  ))
  with check (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_step_templates.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
      and m.role = any (array['owner', 'admin']::membership_role[])
  ));

drop policy if exists members_read_step_templates on public.organization_step_templates;
create policy members_read_step_templates on public.organization_step_templates
  for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = organization_step_templates.organization_id
      and m.user_id = (select auth.uid()) and m.is_active
  ));

-- ---------- 3. Adımlar nereden üretiliyor ----------

/*
  Yeni açılan işin adımları, üç kaynaktan İLK DOLU OLANDAN gelir:

   1. Sözleşmenin work_plan'ı — müşteriye tarihleriyle satılan ara teslim
      takvimi. Bu varken başka bir liste üretmek, aynı iş için iki farklı
      plan demek olurdu.
   2. Kurumun şablonu (organization_step_templates).
   3. Bugünkü 8 varsayılan adım. Şablon tanımlamamış kurumlar için hiçbir
      şey değişmiyor — bu migration'ın bugün canlıda görünür bir etkisi
      yalnızca sözleşmeden açılan işlerde olacak.

  İmza fonksiyonu DEĞİŞMEDİ (tetikleyici ve yetkiler aynı kalsın diye);
  sözleşme ve başlangıç tarihi iş satırından okunuyor.
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
  insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date)
  select
    target_organization_id,
    target_workflow_id,
    t.title,
    t.sort_order,
    case when t.day_offset is null then null else wf.start_date + t.day_offset end
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
