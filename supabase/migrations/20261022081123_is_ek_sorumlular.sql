-- is_ek_sorumlular
--
-- BİR İŞE BİRDEN FAZLA OPERASYONCU (22.10.2026, AkademikMerkez'in talebi:
-- "bir işi iki operasyoncu da görebilsin, takip edebilsin").
--
-- Eskiden işin tek sorumlusu vardı (operation_workflows.assigned_employee_id)
-- ve yönetici olmayan bir operasyoncu YALNIZCA sorumlusu olduğu işi
-- görebiliyordu (private.arvo_can_access_workflow). İkinci kişi işi hiç
-- görmüyordu: ne görevleri, ne dosyaları, ne müşteri yazışmasını.
--
-- TASARIM: asıl sorumlu yerinde kalıyor, yanına EK SORUMLULAR geliyor.
-- Asıl sorumluyu bir listeye çevirmek yerine ayrı tablo, çünkü tek
-- kişiye bağlı iki kural var ve ikisi de doğru:
--   * Operasyon primi iş başına TEK kayıt (hr_operation_commissions,
--     unique (workflow_id)) ve asıl sorumluya yazılıyor.
--   * "Sorumluya göre aktif iş" istatistiği ve ekip yükü işi bir kişiye
--     sayıyor; iki kişiye saymak toplamı şişirirdi.
--
-- Ek sorumlu ne kazanıyor: işi GÖRÜR ve sorumluya açık işlemleri YAPAR
-- (durum, termin, görev, dosya, yorum, müşteri mesajı). Hepsi tek
-- yetki fonksiyonundan geçiyor (arvo_can_access_workflow), onu
-- genişletmek hepsini birden açıyor. Eklendiğinde ve işe müşteri
-- mesajı / iç yorum geldiğinde bildirim alır.
--
-- Ek sorumlu ne YAPAMAZ: asıl sorumluyu değiştiremez, ek sorumlu
-- listesini değiştiremez. Güncelleme politikası artık ek sorumluyu da
-- içeri alıyor, yani bu kısıt POLİTİKADA değil tetikleyicide
-- (arvo_guard_workflow_assignee): RLS "kim yazabilir"i söyler, "neyi"yi
-- söylemez (AGENTS.md).

create table if not exists public.operation_workflow_assignees (
  workflow_id uuid not null references public.operation_workflows(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (workflow_id, employee_id)
);

-- "Bu kişinin ek sorumlu olduğu işler": yetki fonksiyonu ve liste süzgeci.
create index if not exists operation_workflow_assignees_employee_idx
  on public.operation_workflow_assignees (organization_id, employee_id);

alter table public.operation_workflow_assignees enable row level security;

-- Görme: işi görebilen ek sorumluları da görür.
drop policy if exists ek_sorumlu_oku on public.operation_workflow_assignees;
create policy ek_sorumlu_oku on public.operation_workflow_assignees
  for select to authenticated
  using (private.arvo_can_access_workflow(workflow_id));

-- Ekleme ve çıkarma: yalnızca yönetim (owner/admin/manager). Panel
-- tarafında ayrıca operations.gorev.ata yetkisi aranıyor.
drop policy if exists ek_sorumlu_ekle on public.operation_workflow_assignees;
create policy ek_sorumlu_ekle on public.operation_workflow_assignees
  for insert to authenticated
  with check (
    private.arvo_is_privileged_member(organization_id)
    and exists (
      select 1 from public.operation_workflows w
      where w.id = operation_workflow_assignees.workflow_id
        and w.organization_id = operation_workflow_assignees.organization_id
    )
    and exists (
      select 1 from public.hr_employees e
      where e.id = operation_workflow_assignees.employee_id
        and e.organization_id = operation_workflow_assignees.organization_id
    )
  );

drop policy if exists ek_sorumlu_cikar on public.operation_workflow_assignees;
create policy ek_sorumlu_cikar on public.operation_workflow_assignees
  for delete to authenticated
  using (private.arvo_is_privileged_member(organization_id));

grant select, insert, delete on public.operation_workflow_assignees to authenticated;
revoke all on public.operation_workflow_assignees from anon;

-- ---------------------------------------------------------------
-- YETKİ: ek sorumlu da işe erişir. Gövde canlı şemadan; tek fark ek
-- sorumlu satırı.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.arvo_can_access_workflow(target_workflow uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (
 select 1 from public.operation_workflows w
 join public.organization_memberships m on m.organization_id=w.organization_id and m.user_id=(select auth.uid()) and m.is_active=true
 left join public.hr_employees e on e.id=w.assigned_employee_id and e.organization_id=w.organization_id and e.employment_status='active'
 where w.id=target_workflow and (
   m.role::text in ('owner','admin','manager')
   or e.user_id=(select auth.uid())
   or exists (
     select 1 from public.operation_workflow_assignees a
     join public.hr_employees ek on ek.id=a.employee_id and ek.organization_id=w.organization_id and ek.employment_status='active'
     where a.workflow_id=w.id and ek.user_id=(select auth.uid())
   )
 )
) $function$
;

/*
  CRM zinciri: işin sorumlusu müşteri künyesini, sözleşme durumunu ve
  yorumları görüyor (tutarları DEĞİL — o arvo_firsat_tutar_gorebilir'de
  ve ek sorumluya da kapalı kalıyor). Ek sorumlu aynı işi takip ettiği
  için aynı şeyi görmeli.
*/
CREATE OR REPLACE FUNCTION private.arvo_can_access_opportunity(target_opportunity uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select exists (
  select 1
  from public.crm_opportunities o
  join public.organization_memberships m on m.organization_id=o.organization_id
    and m.user_id=(select auth.uid()) and m.is_active=true
  left join public.hr_employees sales_employee on sales_employee.id=o.assigned_employee_id
    and sales_employee.organization_id=o.organization_id and sales_employee.employment_status='active'
  where o.id=target_opportunity
    and (
      m.role::text in ('owner','admin','manager')
      or sales_employee.user_id=(select auth.uid())
      or exists (
        select 1
        from public.crm_contracts contract
        join public.operation_workflows workflow on workflow.id=contract.workflow_id
        join public.hr_employees operation_employee on operation_employee.id=workflow.assigned_employee_id
          and operation_employee.organization_id=workflow.organization_id
          and operation_employee.employment_status='active'
        where contract.opportunity_id=o.id
          and contract.organization_id=o.organization_id
          and operation_employee.user_id=(select auth.uid())
      )
      or exists (
        select 1
        from public.crm_contracts contract
        join public.operation_workflow_assignees ek on ek.workflow_id=contract.workflow_id
        join public.hr_employees ek_employee on ek_employee.id=ek.employee_id
          and ek_employee.organization_id=contract.organization_id
          and ek_employee.employment_status='active'
        where contract.opportunity_id=o.id
          and contract.organization_id=o.organization_id
          and ek_employee.user_id=(select auth.uid())
      )
    )
) $function$
;

-- ---------------------------------------------------------------
-- GÜNCELLEME: ek sorumlu da işi güncelleyebilir (durum, termin…).
-- Eski WITH CHECK yalnızca asıl sorumluyu tanıyordu; ek sorumlunun her
-- güncellemesi "new row violates row-level security" ile düşerdi.
-- ---------------------------------------------------------------
drop policy if exists members_update_assigned_operation_workflows on public.operation_workflows;
create policy members_update_assigned_operation_workflows on public.operation_workflows as PERMISSIVE for UPDATE to authenticated
  using (private.arvo_can_access_workflow(id))
  with check ((private.arvo_is_privileged_member(organization_id) OR (EXISTS ( SELECT 1
   FROM hr_employees e
  WHERE ((e.id = operation_workflows.assigned_employee_id) AND (e.organization_id = operation_workflows.organization_id) AND (e.user_id = ( SELECT auth.uid() AS uid)) AND (e.employment_status = 'active'::text))))
   OR (EXISTS ( SELECT 1
   FROM operation_workflow_assignees a
   JOIN hr_employees ek ON ek.id = a.employee_id
  WHERE ((a.workflow_id = operation_workflows.id) AND (ek.organization_id = operation_workflows.organization_id) AND (ek.user_id = ( SELECT auth.uid() AS uid)) AND (ek.employment_status = 'active'::text))))));

/*
  ASIL SORUMLUYU YALNIZCA YÖNETİM DEĞİŞTİRİR. Güncelleme politikası ek
  sorumluyu içeri aldığı için, kısıt olmasa ek sorumlu API'den
  assigned_employee_id'yi kendine (ya da başkasına) çevirebilirdi.
  Eskiden bu kısıt dolaylıydı: tek kişi güncelleyebiliyordu ve WITH CHECK
  yeni sorumlunun KENDİSİ olmasını istiyordu. Çağıranın rolüne baktığı
  için security INVOKER (sözleşme imza korumasıyla aynı gerekçe); servis
  rolü ve veritabanı sahibi (tetikleyiciler, köprüler) serbest.
*/
create or replace function private.arvo_guard_workflow_assignee()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  if new.assigned_employee_id is distinct from old.assigned_employee_id
     and current_user = 'authenticated'
     and not private.arvo_is_privileged_member(new.organization_id) then
    raise exception 'İşin sorumlusunu yalnızca yönetici değiştirebilir'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$function$;

revoke all on function private.arvo_guard_workflow_assignee() from public, anon, authenticated;

drop trigger if exists arvo_guard_workflow_assignee on public.operation_workflows;
create trigger arvo_guard_workflow_assignee
  before update of assigned_employee_id on public.operation_workflows
  for each row execute function private.arvo_guard_workflow_assignee();

-- ---------------------------------------------------------------
-- LİSTE SÜZGECİ: "?sorumlu=<kişi>" ek sorumlu olduğu işleri de getirir
-- (İşlerim, ekip sayfası ve personel profili bu bağlantıyı kullanıyor).
-- "atanmamis": ne asıl ne ek sorumlusu olan.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.operasyon_is_suz(p_org uuid, p_desen text, p_sorumlu text)
 RETURNS SETOF operasyon_is_liste
 LANGUAGE sql
 STABLE
AS $function$
  select w.*
  from public.operasyon_is_liste w
  where w.organization_id = p_org
    -- Arşiv listede yok (kendi sayfasında), iptal hiçbir yerde.
    and w.status <> 'cancelled' and w.status <> 'archived'
    and (
      p_desen is null
      or w.title ilike '%' || p_desen || '%'
      or w.customer_name ilike '%' || p_desen || '%'
    )
    and (
      p_sorumlu is null
      or (p_sorumlu = 'atanmamis' and w.assigned_employee_id is null
          and not exists (select 1 from public.operation_workflow_assignees a where a.workflow_id = w.id))
      or w.assigned_employee_id::text = p_sorumlu
      or exists (
        select 1 from public.operation_workflow_assignees a
        where a.workflow_id = w.id and a.employee_id::text = p_sorumlu
      )
    )
$function$
;

-- ---------------------------------------------------------------
-- BİLDİRİMLER
-- ---------------------------------------------------------------
-- Ek sorumlu olarak eklenen kişiye: asıl atamadaki bildirimin aynısı.
create or replace function private.notify_operation_assistant()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  target_user_id uuid;
  assigner_name text;
  wf record;
begin
  select employee.user_id into target_user_id
  from public.hr_employees employee
  where employee.id = new.employee_id
    and employee.organization_id = new.organization_id
    and employee.employment_status = 'active';

  if target_user_id is null or target_user_id = (select auth.uid()) then return new; end if;

  select w.id, w.title, w.customer_name into wf
  from public.operation_workflows w where w.id = new.workflow_id;

  select employee.full_name into assigner_name
  from public.hr_employees employee
  where employee.organization_id = new.organization_id
    and employee.user_id = (select auth.uid())
  limit 1;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  ) values (
    new.organization_id,
    target_user_id,
    'organization',
    'operation_assignment',
    'Yeni operasyon işi atandı',
    coalesce(assigner_name, 'Yönetim') || ' tarafından ' || coalesce(wf.customer_name, 'kurum içi') ||
      ' kaydına ait “' || coalesce(wf.title, 'Yeni İş') || '” operasyonuna ek sorumlu olarak eklendiniz.',
    '/panel/operations/' || new.workflow_id::text,
    jsonb_build_object('workflow_id', new.workflow_id, 'assigned_employee_id', new.employee_id,
      'assigned_by', (select auth.uid()), 'ek_sorumlu', true)
  );
  return new;
end
$function$;

revoke all on function private.notify_operation_assistant() from public, anon, authenticated;

drop trigger if exists notify_operation_assistant on public.operation_workflow_assignees;
create trigger notify_operation_assistant
  after insert on public.operation_workflow_assignees
  for each row execute function private.notify_operation_assistant();

-- İç yorum: ek sorumlu da alıcı. Gövde canlı şemadan; tek fark son union.
CREATE OR REPLACE FUNCTION private.notify_crm_internal_comment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  customer_name text;
  target_url text;
begin
  select opportunity.customer_name into customer_name
  from public.crm_opportunities opportunity where opportunity.id = new.opportunity_id;

  target_url := case new.context_type
    when 'proposal' then '/panel/crm/proposals/' || new.context_id::text
    when 'contract' then '/panel/crm/contracts/' || new.context_id::text
    when 'operation' then '/panel/operations/' || new.context_id::text
    else '/panel/crm/requests/' || new.opportunity_id::text
  end;

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select distinct
    new.organization_id,
    recipient.user_id,
    'organization',
    'internal_comment',
    'Yeni kurum içi yorum',
    coalesce(customer_name, 'Bir müşteri') || ' kaydına yeni bir yorum eklendi.',
    target_url,
    jsonb_build_object(
      'comment_id', new.id, 'opportunity_id', new.opportunity_id,
      'context_type', new.context_type, 'context_id', new.context_id
    )
  from (
    select membership.user_id
    from public.organization_memberships membership
    where membership.organization_id = new.organization_id
      and membership.is_active and membership.role::text in ('owner', 'admin', 'manager')
    union
    select sales_employee.user_id
    from public.crm_opportunities opportunity
    join public.hr_employees sales_employee on sales_employee.id = opportunity.assigned_employee_id
    where opportunity.id = new.opportunity_id and sales_employee.user_id is not null
    union
    select operation_employee.user_id
    from public.crm_contracts contract
    join public.operation_workflows workflow on workflow.id = contract.workflow_id
    join public.hr_employees operation_employee on operation_employee.id = workflow.assigned_employee_id
    where contract.opportunity_id = new.opportunity_id and operation_employee.user_id is not null
    union
    select ek_employee.user_id
    from public.crm_contracts contract
    join public.operation_workflow_assignees ek on ek.workflow_id = contract.workflow_id
    join public.hr_employees ek_employee on ek_employee.id = ek.employee_id
    where contract.opportunity_id = new.opportunity_id and ek_employee.user_id is not null
      and ek_employee.employment_status = 'active'
  ) recipient
  where recipient.user_id is not null and recipient.user_id <> new.created_by;

  return new;
end;
$function$
;

-- Müşteri mesajı: ek sorumlu da alıcı. Gövde canlı şemadan; tek fark ilk union'a eklenen satır.
CREATE OR REPLACE FUNCTION public.send_customer_file_message(p_tracking_code text, p_body text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_contract public.crm_contracts%rowtype;
  clean_body text := trim(p_body);
begin
  if char_length(clean_body) < 2 or char_length(clean_body) > 2000 then
    raise exception 'Mesaj 2 ile 2000 karakter arasında olmalıdır.';
  end if;

  select contract.* into target_contract
  from public.crm_contracts contract
  where contract.tracking_code = upper(regexp_replace(trim(p_tracking_code), '[^A-Za-z0-9]', '', 'g'))
    and private.arvo_contract_tracking_open(contract.status, contract.tracking_open_before_signature)
  limit 1;

  if target_contract.id is null then
    raise exception 'Dosya bulunamadı.';
  end if;

  if exists (
    select 1 from public.customer_file_messages recent
    where recent.contract_id = target_contract.id
      and recent.sender_type = 'customer'
      and recent.created_at > now() - interval '20 seconds'
  ) then
    raise exception 'Yeni bir mesaj göndermeden önce kısa bir süre bekleyin.';
  end if;

  insert into public.customer_file_messages (
    organization_id, contract_id, workflow_id, sender_type, sender_name, body
  ) values (
    target_contract.organization_id, target_contract.id, target_contract.workflow_id,
    'customer', 'Müşteri', clean_body
  );

  insert into public.notifications (
    organization_id, user_id, audience, category, title, message, action_url, metadata
  )
  select distinct
    target_contract.organization_id,
    recipient.user_id,
    'organization',
    'customer_message',
    'Müşteriden yeni mesaj',
    target_contract.contract_no || ' numaralı dosya için müşteri mesaj gönderdi.',
    case when target_contract.workflow_id is not null
      then '/panel/operations/' || target_contract.workflow_id::text
      else '/panel/crm/contracts/' || target_contract.id::text || '#musteri-mesajlari' end,
    jsonb_build_object('contract_id', target_contract.id, 'workflow_id', target_contract.workflow_id)
  from (
    select employee.user_id
    from public.operation_workflows workflow
    join public.hr_employees employee on employee.id = workflow.assigned_employee_id
    where workflow.id = target_contract.workflow_id
      and employee.user_id is not null
      and employee.employment_status = 'active'
    union
    select employee.user_id
    from public.operation_workflow_assignees ek
    join public.hr_employees employee on employee.id = ek.employee_id
    where ek.workflow_id = target_contract.workflow_id
      and employee.user_id is not null
      and employee.employment_status = 'active'
    union
    select employee.user_id
    from public.crm_opportunities opportunity
    join public.hr_employees employee on employee.id = opportunity.assigned_employee_id
    where opportunity.id = target_contract.opportunity_id
      and employee.user_id is not null
      and employee.employment_status = 'active'
      and exists (
        select 1 from public.organization_memberships m
        where m.organization_id = target_contract.organization_id and m.user_id = employee.user_id and m.is_active
      )
    union
    select membership.user_id
    from public.organization_memberships membership
    where membership.organization_id = target_contract.organization_id
      and membership.is_active = true
      and membership.role::text in ('owner', 'admin', 'manager')
  ) recipient
  where recipient.user_id is not null;
end;
$function$
;
