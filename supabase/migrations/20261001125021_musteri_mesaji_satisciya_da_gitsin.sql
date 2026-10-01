-- Müşteri mesajı bildirimi satışçıya da gitsin.
--
-- Fırsatın sorumlusu (satışçı) bildirimi yalnızca iş HENÜZ AÇILMAMIŞKEN
-- alıyordu: sözleşmeye bir operasyon işi bağlanır bağlanmaz müşteriyi
-- satan kişi sessizleşiyordu. Oysa müşteri çoğunlukla hâlâ satışçıyı
-- tanıyor ve mesajı ona yazdığını sanıyor; ilişkiyi kuran kişinin iş
-- operasyona geçti diye haberi kesilmemeli.
--
-- Tek değişiklik: ikinci koldaki "target_contract.workflow_id is null"
-- koşulu kalktı. Satışçı ile operasyoncu aynı kişiyse 'select distinct'
-- zaten tek satır yazıyor. Kurum üyeliği denetimi yerinde duruyor:
-- kurumdan ayrılmış satışçıya bildirim gitmez.

create or replace function public.send_customer_file_message(p_tracking_code text, p_body text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
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
    -- İşin sorumlusu (operasyoncu)
    select employee.user_id
    from public.operation_workflows workflow
    join public.hr_employees employee on employee.id = workflow.assigned_employee_id
    where workflow.id = target_contract.workflow_id
      and employee.user_id is not null
      and employee.employment_status = 'active'
    union
    -- Fırsatın sorumlusu (satışçı) — iş açılmış olsa da haber alır
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
$function$;

-- Postgres yeni/değiştirilmiş fonksiyonu PUBLIC'e açık bırakır; kapı
-- yalnızca sunucuya (service_role) açık kalmalı: takip sayfası bu
-- fonksiyonu kendi anahtarıyla çağırır, müşterinin tarayıcısı çağıramaz.
revoke all on function public.send_customer_file_message(text, text) from public, anon, authenticated;
grant execute on function public.send_customer_file_message(text, text) to service_role;
