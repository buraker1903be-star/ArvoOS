/*
  İŞİN ÇALIŞMA TÜRÜNÜ DEĞİŞTİRME (13.10.2026).

  İş yanlış çalışma türüyle açılabiliyor (makale işi tez listesiyle;
  20261013104639'dan önce açılan işlerin çoğu böyle). Kurum sahibinin
  tarifi: "personellerin onu düzeltebilmesi gerekir". Bugün bunun yolu
  yoktu: tür iş açılırken bir kez seçiliyor, görev silme RLS'te yalnızca
  owner/admin'e açık — işin sorumlusu yanlış listeyi düzeltemiyordu.

  arvo_is_turunu_degistir(iş, tür): işi görebilen (yönetici, müdür ya da
  işin sorumlusu — private.arvo_can_access_workflow; RLS'le aynı kural)
  çağırır. Kurallar:
    - TAMAMLANMIŞ görevler KORUNUR (kim tikledi, ne zaman — iş geçmişi);
      yeni listede aynı adlı görev varsa tekrar eklenmez.
    - Tamamlanmamış görevler yeni türün listesiyle değişir.
    - Yeni türün listesi boşsa hiçbir şey değişmez (iş görevsiz kalmasın).
    - Arşivdeki iş değiştirilmez.
    - SIRA: önce yeni görevler eklenir, SONRA eskiler silinir.
      sync_workflow_completion_from_steps kalan bütün görevler bitmişse
      işi "Tamamlandı" yapıyor; önce silmek, tamamlanmış görevi olan
      işi bir anlığına "bitmiş" gösterip kapatırdı.
  Dönüş: { eklenen, silinen, korunan }.
*/

create or replace function public.arvo_is_turunu_degistir(p_workflow uuid, p_set text)
returns jsonb
language plpgsql
security definer
set search_path = ''
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

revoke all on function public.arvo_is_turunu_degistir(uuid, text) from public, anon;
grant execute on function public.arvo_is_turunu_degistir(uuid, text) to authenticated, service_role;
