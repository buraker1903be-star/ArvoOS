/*
  SÖZLEŞMELİ İŞ DE ÇALIŞMA TÜRÜNÜN GÖREVLERİYLE AÇILIR (22.10.2026).

  Eskiden add_standard_operation_steps üç kaynaktan YALNIZCA birini
  kullanıyordu: sözleşmenin ara teslim takvimi (work_plan) doluysa iş
  yalnızca o kalemlerle açılıyor, çalışma türünün görev listesi hiç
  eklenmiyordu. AkademikMerkez'de Tez türünün 20 görevi var; Tuğçe
  Drama'nın işi sözleşmesindeki 5 ara teslimle açıldı ve 20 görevin
  hiçbiri gelmedi. "Çalışma türünü değiştir" de çare değildi: iş zaten
  Tez türündeydi ve aynı türe çevirmek reddediliyor.

  Yeni kural:
    - Çalışma türünün görevleri HER ZAMAN eklenir (tür → kurumun
      öntanımlısı → 'varsayilan'; öncekiyle aynı seçim).
    - Sözleşmenin ara teslimleri ATILMAZ: müşteriye tarihleriyle satılan
      taahhüt, termin hatırlatması da onların tarihinden çalışıyor. Ayrı
      bir aşamada, türün görevlerinin ARDINA eklenir
      ("Sözleşme ara teslimleri").
    - İkisi de yoksa eski 8 varsayılan adım (davranış değişmedi).

  arvo_is_turunu_degistir de ara teslimleri artık silmiyor: tür
  değişince değişen operasyonun listesi, müşteriye verilen tarihler
  değil. Gövde anlık görüntüden (canli-sema.sql) alındı.

  Sonda geriye dönük düzeltme: sözleşme takviminden açılıp türün hiçbir
  görevini almamış, kapanmamış işlere türün görevleri eklenir.
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
  set_kodu text;
  eklenen integer := 0;
  plan_eklenen integer := 0;
  taban integer := 0;
begin
  -- Adımı olan işe dokunulmaz: fonksiyon tekrar çağrılabilir olmalı.
  if exists (select 1 from public.operation_steps s where s.workflow_id = target_workflow_id) then
    return;
  end if;

  select w.contract_id, w.step_template_set, coalesce(w.start_date, current_date) as start_date
  into wf
  from public.operation_workflows w
  where w.id = target_workflow_id and w.organization_id = target_organization_id;

  -- 1) Çalışma türünün görevleri. Tür seçilmemişse kurumun öntanımlısı; o da yoksa 'varsayilan'.
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

  -- 2) Sözleşmenin ara teslim takvimi: türün görevlerinin ardına, kendi aşamasında.
  if wf.contract_id is not null then
    select c.work_plan into plan
    from public.crm_contracts c
    where c.id = wf.contract_id and c.organization_id = target_organization_id;
  end if;

  if jsonb_typeof(plan) = 'array' and jsonb_array_length(plan) > 0 then
    select coalesce(max(s.sort_order), 0) into taban
    from public.operation_steps s where s.workflow_id = target_workflow_id;

    insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date, phase_title)
    select
      target_organization_id,
      target_workflow_id,
      left(trim(item.value ->> 'title'), 180),
      taban + (row_number() over (order by item.value ->> 'due_date', (item.value ->> 'sequence')::int))::int * 10,
      nullif(item.value ->> 'due_date', '')::date,
      'Sözleşme ara teslimleri'
    from jsonb_array_elements(plan) as item(value)
    where char_length(trim(coalesce(item.value ->> 'title', ''))) >= 2;
    get diagnostics plan_eklenen = row_count;
  end if;

  if eklenen + plan_eklenen > 0 then return; end if;

  -- 3) Ne tür listesi ne takvim: eski 8 varsayılan adım.
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

create or replace function public.arvo_is_turunu_degistir(p_workflow uuid, p_set text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_is record;
  v_eklenen integer;
  v_silinen integer;
  v_korunan integer;
  v_taban integer;
  v_eski uuid[];
begin
  if (select auth.uid()) is null or not private.arvo_can_access_workflow(p_workflow) then
    raise exception 'Bu işin çalışma türünü değiştirme yetkiniz yok.' using errcode = '42501';
  end if;

  select w.id, w.organization_id, w.archived_at, w.status, coalesce(w.start_date, current_date) as baslangic
  into v_is from public.operation_workflows w where w.id = p_workflow;
  if v_is.id is null then
    raise exception 'İş bulunamadı.' using errcode = 'P0002';
  end if;
  if v_is.status = 'archived' or v_is.archived_at is not null then
    raise exception 'Arşivdeki işin türü değiştirilemez; önce arşivden çıkarın.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.organization_step_template_sets s
    where s.organization_id = v_is.organization_id and s.code = p_set and s.is_active
  ) then
    raise exception 'Seçilen çalışma türü bulunamadı.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.organization_step_templates t
    where t.organization_id = v_is.organization_id and t.set_code = p_set and t.is_active
  ) then
    raise exception 'Bu çalışma türünün görev listesi boş; önce Adım şablonu sayfasından görevlerini yazın.' using errcode = 'check_violation';
  end if;

  select count(*) into v_korunan from public.operation_steps s
  where s.workflow_id = p_workflow and s.is_completed;
  -- Yeni görevler korunan görevlerin ardına sıralanır.
  select coalesce(max(s.sort_order), 0) into v_taban from public.operation_steps s
  where s.workflow_id = p_workflow and s.is_completed;

  /*
    Değişecek görevler EKLEMEDEN ÖNCE kimlikleriyle alınır. Sözleşmenin
    ara teslimleri değişmez (20261022083708): eskiden onlar da silinip
    müşteriye verilen tarihler işten kayboluyordu.
  */
  select coalesce(array_agg(s.id), '{}') into v_eski from public.operation_steps s
  where s.workflow_id = p_workflow and not s.is_completed
    and s.phase_title is distinct from 'Sözleşme ara teslimleri';

  -- 1) Önce ekle (işi bir anlığına bile görevsiz/bitmiş bırakma).
  insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date, phase_title)
  select v_is.organization_id, p_workflow, t.title, v_taban + t.sort_order,
    case when t.day_offset is null then null else v_is.baslangic + t.day_offset end,
    t.phase_title
  from public.organization_step_templates t
  where t.organization_id = v_is.organization_id and t.set_code = p_set and t.is_active
    and not exists (
      select 1 from public.operation_steps k
      where k.workflow_id = p_workflow and k.is_completed and lower(trim(k.title)) = lower(trim(t.title))
    )
  order by t.sort_order, t.code;
  get diagnostics v_eklenen = row_count;

  -- 2) Sonra eskileri sil.
  delete from public.operation_steps s where s.id = any(v_eski);
  get diagnostics v_silinen = row_count;

  update public.operation_workflows
  set step_template_set = p_set, updated_at = now()
  where id = p_workflow;

  return jsonb_build_object('eklenen', v_eklenen, 'silinen', v_silinen, 'korunan', v_korunan);
end $$;

revoke all on function public.add_standard_operation_steps(uuid, uuid) from public, anon;
grant execute on function public.add_standard_operation_steps(uuid, uuid) to service_role;
revoke all on function public.arvo_is_turunu_degistir(uuid, text) from public, anon;
grant execute on function public.arvo_is_turunu_degistir(uuid, text) to authenticated, service_role;

/*
  GERİYE DÖNÜK DÜZELTME. Etkilenen iş: sözleşmesinin takvimi dolu,
  türünün listesinde görev var ama işte o listeden TEK BİR görev yok,
  iş kapanmamış (tamamlanan/iptal/arşiv işe görev eklemek onu yeniden
  "açık" gösterirdi). Mevcut görevlere dokunulmaz — tamamlanmışlar,
  atamalar ve tarihler yerinde kalır; yalnızca ara teslim aşamasına
  alınıp türün görevlerinin ardına sıralanırlar.
*/
do $$
declare
  r record;
  v_set text;
  v_tavan integer;
begin
  for r in
    select w.id, w.organization_id, w.step_template_set, coalesce(w.start_date, current_date) as baslangic
    from public.operation_workflows w
    join public.crm_contracts c on c.id = w.contract_id and c.organization_id = w.organization_id
    where w.status in ('planned', 'in_progress', 'blocked')
      and w.archived_at is null
      and jsonb_typeof(c.work_plan) = 'array' and jsonb_array_length(c.work_plan) > 0
  loop
    v_set := coalesce(
      r.step_template_set,
      (select s.code from public.organization_step_template_sets s
        where s.organization_id = r.organization_id and s.is_default and s.is_active),
      'varsayilan');

    continue when not exists (
      select 1 from public.organization_step_templates t
      where t.organization_id = r.organization_id and t.set_code = v_set and t.is_active);
    continue when exists (
      select 1 from public.operation_steps s
      join public.organization_step_templates t
        on t.organization_id = r.organization_id and t.set_code = v_set and t.is_active
       and lower(trim(t.title)) = lower(trim(s.title))
      where s.workflow_id = r.id);

    select coalesce(max(t.sort_order), 0) into v_tavan
    from public.organization_step_templates t
    where t.organization_id = r.organization_id and t.set_code = v_set and t.is_active;

    update public.operation_steps s
    set phase_title = 'Sözleşme ara teslimleri', sort_order = v_tavan + s.sort_order
    where s.workflow_id = r.id and s.phase_title is null;

    insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date, phase_title)
    select r.organization_id, r.id, t.title, t.sort_order,
      case when t.day_offset is null then null else r.baslangic + t.day_offset end,
      t.phase_title
    from public.organization_step_templates t
    where t.organization_id = r.organization_id and t.set_code = v_set and t.is_active
    order by t.sort_order, t.code;
  end loop;
end $$;
