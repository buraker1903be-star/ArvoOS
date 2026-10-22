/*
  SÖZLEŞMELİ İŞ ÇALIŞMA TÜRÜNÜN GÖREVLERİYLE AÇILIR (22.10.2026).

  Eskiden add_standard_operation_steps sözleşmenin ara teslim takvimini
  (work_plan) ÖNCE deniyordu: takvim doluysa iş yalnızca o kalemlerle
  açılıyor, çalışma türünün görev listesi hiç eklenmiyordu.
  AkademikMerkez'de Tez türünün 20 görevi var; Tuğçe Drama'nın işi
  sözleşmesindeki 5 ara teslimle açıldı ve 20 görevin hiçbiri gelmedi.
  "Çalışma türünü değiştir" de çare değildi: iş zaten Tez türündeydi ve
  aynı türe çevirmek reddediliyor.

  Kurum sahibinin kararı: ara teslimler görev listesine GİRMEZ. Onlar
  sözleşmede ve müşteri takip sayfasında duruyor; operasyonun listesi
  türün listesidir. Yeni öncelik:
    1) Çalışma türünün görevleri (tür → kurumun öntanımlısı → 'varsayilan').
    2) Tür listesi boşsa sözleşmenin takvimi (şablon tanımlamamış kurum
       için eski davranış).
    3) İkisi de yoksa eski 8 varsayılan adım.

  Bu migration'ın ilk hâli (aynı gün) ara teslimleri "Sözleşme ara
  teslimleri" aşamasında türün görevlerinin ardına ekliyor ve tür
  değiştirmede onları koruyordu. O hâl uygulanmış olabileceği için
  arvo_is_turunu_degistir anlık görüntüdeki gövdesine geri yazılıyor ve
  geriye dönük düzeltme iki durumu da temizliyor.
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
  if eklenen > 0 then return; end if;

  -- 2) Tür listesi boşsa sözleşmenin ara teslim takvimi.
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

-- Anlık görüntüdeki gövde: bu migration'ın ilk hâli uygulandıysa onu geri alır.
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

  -- Değişecek görevler EKLEMEDEN ÖNCE kimlikleriyle alınır.
  select coalesce(array_agg(s.id), '{}') into v_eski from public.operation_steps s
  where s.workflow_id = p_workflow and not s.is_completed;

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
  GERİYE DÖNÜK DÜZELTME — yalnızca KAPANMAMIŞ sözleşmeli işler
  (tamamlanan/iptal/arşiv işe görev eklemek onu yeniden "açık"
  gösterirdi) ve yalnızca türünün listesi dolu olanlar (yoksa iş
  görevsiz kalırdı).
    a) Türün görevlerinden hiçbiri işte yoksa eklenir.
    b) Sözleşmenin ara teslimlerinden gelen görevler silinir: adı
       takvimdeki bir kalemle aynı olan (eski davranış) ya da ilk hâlin
       açtığı "Sözleşme ara teslimleri" aşamasındaki. Adı türün bir
       göreviyle aynı olan satır silinmez — o türün görevidir. Elle
       eklenmiş, adı takvimde olmayan görevlere dokunulmaz.
*/
do $$
declare
  r record;
  v_set text;
begin
  for r in
    select w.id, w.organization_id, w.step_template_set, c.work_plan,
      coalesce(w.start_date, current_date) as baslangic
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

    -- a) Önce ekle: sync_workflow_completion_from_steps kalan görevler bitmişse işi kapatıyor.
    if not exists (
      select 1 from public.operation_steps s
      join public.organization_step_templates t
        on t.organization_id = r.organization_id and t.set_code = v_set and t.is_active
       and lower(trim(t.title)) = lower(trim(s.title))
      where s.workflow_id = r.id
    ) then
      insert into public.operation_steps (organization_id, workflow_id, title, sort_order, due_date, phase_title)
      select r.organization_id, r.id, t.title, t.sort_order,
        case when t.day_offset is null then null else r.baslangic + t.day_offset end,
        t.phase_title
      from public.organization_step_templates t
      where t.organization_id = r.organization_id and t.set_code = v_set and t.is_active
      order by t.sort_order, t.code;
    end if;

    -- b) Sonra ara teslimleri sil.
    delete from public.operation_steps s
    where s.workflow_id = r.id
      and (
        s.phase_title = 'Sözleşme ara teslimleri'
        or exists (
          select 1 from jsonb_array_elements(r.work_plan) as item(value)
          where lower(trim(item.value ->> 'title')) = lower(trim(s.title)))
      )
      and not exists (
        select 1 from public.organization_step_templates t
        where t.organization_id = r.organization_id and t.set_code = v_set and t.is_active
          and lower(trim(t.title)) = lower(trim(s.title)));
  end loop;
end $$;
