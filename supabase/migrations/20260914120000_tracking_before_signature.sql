-- İmza bekleyen müşteri de takip sistemine girebilsin.
--
-- Sorun: Takip kodu sorgusu, müşteri mesajlaşması yalnızca imzalı/tamamlanmış
-- sözleşmede çalışıyordu. Panel "Takip Kodu"nu her sözleşme için veriyor;
-- sözleşmeyi henüz imzalamamış müşteri kodu girince "eşleşen sözleşme
-- bulunamadı" görüyor, imzadan önce soru soramıyordu.
--
-- 1) Takip kodu her sözleşmede bulunur (boşsa üretilir) ve bir kez
--    verildikten sonra değişmez; müşteriye imzadan önce verilen kod imzadan
--    sonra da geçerli kalır.
-- 2) Takip sorgusu ve mesajlaşma taslak/gönderilmiş sözleşmede de çalışır
--    (reddedilen/iptal edilen hariç). Dosyalar yine yalnızca imzalı işte
--    (list_customer_portal_files değişmedi).
-- 3) İmzadan önce gelen mesaj, iş akışı yokken satış temsilcisine de
--    bildirilir; iş akışı oluşunca önceki mesajlar işe bağlanır (operasyon
--    ekibi iş detayında görür).
-- 4) Herkese açık sözleşme sayfası takip kodunu gösterebilsin diye
--    arvo_public_contract_plan takip kodunu da döndürür.
-- Tekrar çalıştırılabilir.

-- ---------------------------------------------------------------
-- 1) Takip kodu
-- ---------------------------------------------------------------
-- 6 karakter; karışan harf/rakamlar (0/O, 1/I) yok. 256, 32'ye tam bölünür.
create or replace function private.arvo_generate_tracking_code()
returns text
language plpgsql
volatile
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea;
  v_code text;
  v_try integer := 0;
begin
  loop
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    end loop;
    exit when not exists (select 1 from public.crm_contracts c where upper(c.tracking_code) = v_code);
    v_try := v_try + 1;
    if v_try > 50 then
      raise exception 'tracking_code_exhausted';
    end if;
  end loop;
  return v_code;
end
$function$;

create or replace function private.arvo_contract_tracking_code()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and nullif(btrim(coalesce(old.tracking_code, '')), '') is not null then
    -- Müşteriye verilmiş kod değişmez.
    new.tracking_code := old.tracking_code;
  elsif nullif(btrim(coalesce(new.tracking_code, '')), '') is null then
    new.tracking_code := private.arvo_generate_tracking_code();
  end if;
  return new;
end
$function$;

drop trigger if exists arvo_contract_tracking_code on public.crm_contracts;
create trigger arvo_contract_tracking_code
  before insert or update of tracking_code on public.crm_contracts
  for each row execute function private.arvo_contract_tracking_code();

-- Kodu olmayan sözleşmelere kod ver (trigger 'update of tracking_code' ile çalışır).
update public.crm_contracts
   set tracking_code = private.arvo_generate_tracking_code()
 where nullif(btrim(coalesce(tracking_code, '')), '') is null;

revoke all on function private.arvo_generate_tracking_code() from public, anon;

-- ---------------------------------------------------------------
-- 2) Takip sorgusu (imza öncesi dahil)
-- ---------------------------------------------------------------
create or replace function public.lookup_contract_by_tracking_code_global(
  p_tracking_code text
)
returns table (
  contract_no text,
  contract_title text,
  contract_status text,
  workflow_status text,
  last_update timestamptz,
  total_amount bigint,
  paid_amount bigint,
  remaining_amount bigint,
  progress_percentage integer,
  organization_name text,
  organization_logo_url text,
  organization_primary_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.contract_no,
    c.title,
    c.status,
    case when w.status = 'archived' then 'completed' else w.status end as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    coalesce(pay.paid_amount, 0) as paid_amount,
    coalesce(pay.remaining_amount, greatest(0, c.amount)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage,
    org.name,
    org.logo_url,
    org.primary_color
  from public.crm_contracts c
  join public.organizations org on org.id = c.organization_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral private.arvo_contract_payment_summary(c.id) pay on true
  left join lateral (
    select round(
      100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0)
    )::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  where c.tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
    and c.status in ('draft', 'sent', 'signed', 'completed')
  limit 1;
$$;
revoke all on function public.lookup_contract_by_tracking_code_global(text) from public;
grant execute on function public.lookup_contract_by_tracking_code_global(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- 3) Mesajlaşma (imza öncesi dahil)
-- ---------------------------------------------------------------
create or replace function public.list_customer_file_messages(p_tracking_code text)
returns table(sender_type text, sender_name text, body text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select message.sender_type, message.sender_name, message.body, message.created_at
  from public.crm_contracts contract
  join public.customer_file_messages message on message.contract_id = contract.id
  where contract.tracking_code = upper(regexp_replace(trim(p_tracking_code), '[^A-Za-z0-9]', '', 'g'))
    and contract.status in ('draft', 'sent', 'signed', 'completed')
  order by message.created_at asc
  limit 200;
$$;

create or replace function public.send_customer_file_message(p_tracking_code text, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
    and contract.status in ('draft', 'sent', 'signed', 'completed')
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

  -- Alıcılar: işin sorumlusu (iş varsa), talebin satış temsilcisi (imza
  -- öncesi soruları o yanıtlar) ve aktif owner/admin/manager.
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
    from public.crm_opportunities opportunity
    join public.hr_employees employee on employee.id = opportunity.assigned_employee_id
    where opportunity.id = target_contract.opportunity_id
      and target_contract.workflow_id is null
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
$$;

revoke all on function public.list_customer_file_messages(text) from public;
revoke all on function public.send_customer_file_message(text, text) from public;
grant execute on function public.list_customer_file_messages(text) to anon, authenticated;
grant execute on function public.send_customer_file_message(text, text) to anon, authenticated;

-- İş akışı oluşunca imza öncesi mesajlar işe bağlanır.
create or replace function private.arvo_link_contract_messages_to_workflow()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.customer_file_messages m
     set workflow_id = new.workflow_id
   where m.contract_id = new.id
     and m.workflow_id is null;
  return new;
end
$function$;

drop trigger if exists arvo_link_contract_messages_to_workflow on public.crm_contracts;
create trigger arvo_link_contract_messages_to_workflow
  after update of workflow_id on public.crm_contracts
  for each row
  when (new.workflow_id is not null and new.workflow_id is distinct from old.workflow_id)
  execute function private.arvo_link_contract_messages_to_workflow();

-- ---------------------------------------------------------------
-- 4) Herkese açık sözleşme sayfası: takip kodu
-- ---------------------------------------------------------------
create or replace function public.arvo_public_contract_plan(public_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select jsonb_build_object(
    'work_plan', coalesce(c.work_plan, '[]'::jsonb),
    'tracking_code', case when c.status in ('draft', 'sent', 'signed', 'completed') then c.tracking_code end,
    'addenda', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'addendum_no', a.addendum_no,
        'work_plan', a.work_plan,
        'payment_dates', a.payment_dates,
        'note', a.note,
        'status', a.status,
        'created_at', a.created_at,
        'responded_at', a.responded_at,
        'responder_name', a.responder_name,
        'responder_ip', a.responder_ip,
        'responder_user_agent', a.responder_user_agent,
        'response_note', a.response_note
      ) order by a.addendum_no)
      from public.crm_contract_addenda a
      where a.contract_id = c.id
        and a.status in ('sent', 'accepted', 'rejected')
    ), '[]'::jsonb)
  )
  from public.crm_contracts c
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$;

revoke all on function public.arvo_public_contract_plan(text) from public;
grant execute on function public.arvo_public_contract_plan(text) to anon, authenticated;
