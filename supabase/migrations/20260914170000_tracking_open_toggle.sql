-- İmza öncesi takip, sözleşme bazında açılıp kapatılır.
--
-- 20260914120000 imza bekleyen (taslak/gönderilmiş) sözleşmeyi takip
-- ekranına herkes için açmıştı. Kurum bunu her müşteriye açmak istemiyor:
-- crm_contracts.tracking_open_before_signature (varsayılan kapalı) panelden
-- sözleşme bazında açılır. İmzalı/tamamlanmış sözleşme her zaman açıktır;
-- reddedilen/iptal edilen hiçbir zaman.
--
-- Aynı kural takip koduyla çalışan tüm uçlarda uygulanır: sorgu, mesaj
-- listesi/gönderimi, belge bağlantıları, iş planı, teklif rozetleri ve
-- teklif onayı; sözleşme sayfası da takip kodunu yalnızca açıksa gösterir.
-- 20260914120000 ve 20260914150000'dan SONRA çalıştırılmalıdır.
-- Tekrar çalıştırılabilir.

alter table public.crm_contracts
  add column if not exists tracking_open_before_signature boolean not null default false;

create or replace function private.arvo_contract_tracking_open(p_status text, p_open boolean)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_status in ('signed', 'completed')
      or (p_status in ('draft', 'sent') and coalesce(p_open, false))
$$;
revoke all on function private.arvo_contract_tracking_open(text, boolean) from public, anon;

-- ---------------------------------------------------------------
-- Takip sorgusu
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
    and private.arvo_contract_tracking_open(c.status, c.tracking_open_before_signature)
  limit 1;
$$;
revoke all on function public.lookup_contract_by_tracking_code_global(text) from public;
grant execute on function public.lookup_contract_by_tracking_code_global(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Mesajlaşma
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
    and private.arvo_contract_tracking_open(contract.status, contract.tracking_open_before_signature)
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

-- ---------------------------------------------------------------
-- Belge bağlantıları (20260912210000 + erişim kuralı)
-- ---------------------------------------------------------------
create or replace function public.arvo_tracking_document_links(p_tracking_code text)
returns table(
  proposal_share_token text,
  proposal_no text,
  proposal_status text,
  contract_share_token text,
  contract_no text,
  contract_status text
)
language plpgsql
volatile
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_code text := upper(trim(coalesce(p_tracking_code, '')));
  c public.crm_contracts%rowtype;
  p public.crm_proposals%rowtype;
  v_token text;
begin
  if char_length(v_code) < 6 then
    return;
  end if;

  select * into c
  from public.crm_contracts
  where upper(tracking_code) = v_code
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1
  for update;

  if c.id is null then
    return;
  end if;

  if c.share_token is null and coalesce(c.status, 'draft') <> 'draft' then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.crm_contracts
       set share_token = v_token,
           access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
           updated_at = now()
     where id = c.id
       and share_token is null;
    c.share_token := v_token;
  end if;

  if c.proposal_id is not null then
    select * into p
    from public.crm_proposals
    where id = c.proposal_id
    for update;

    if p.id is not null and p.share_token is null and coalesce(p.status, 'draft') <> 'draft' then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
      update public.crm_proposals
         set share_token = v_token,
             access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
             updated_at = now()
       where id = p.id
         and share_token is null;
      p.share_token := v_token;
    end if;
  end if;

  return query
  select p.share_token, p.proposal_no, p.status,
         c.share_token, c.contract_no, c.status;
end
$function$;
revoke all on function public.arvo_tracking_document_links(text) from public;
grant execute on function public.arvo_tracking_document_links(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- İş planı (20260914090000 + erişim kuralı)
-- ---------------------------------------------------------------
create or replace function public.arvo_tracking_work_plan(p_tracking_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_code text := upper(btrim(coalesce(p_tracking_code, '')));
  c public.crm_contracts%rowtype;
  v_plan jsonb;
  v_source text := 'contract';
  v_schedule jsonb;
  v_payments jsonb;
begin
  if char_length(v_code) < 6 then
    return null;
  end if;

  select * into c
  from public.crm_contracts
  where upper(tracking_code) = v_code
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1;
  if c.id is null then
    return null;
  end if;

  select a.work_plan into v_plan
  from public.crm_contract_addenda a
  where a.contract_id = c.id
    and a.status = 'accepted'
    and jsonb_array_length(a.work_plan) > 0
  order by a.addendum_no desc
  limit 1;
  if v_plan is not null then
    v_source := 'addendum';
  else
    v_plan := coalesce(c.work_plan, '[]'::jsonb);
  end if;

  v_schedule := coalesce(
    c.payment_schedule,
    (select p.payment_schedule from public.crm_proposals p where p.id = c.proposal_id),
    '[]'::jsonb
  );
  if jsonb_typeof(v_schedule) <> 'array' then
    v_schedule := '[]'::jsonb;
  end if;

  if c.payment_plan_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'sequence', i.installment_no,
      'label', coalesce(s.item->>'label', i.installment_no::text || '. Ödeme'),
      'amount', i.amount,
      'due_date', to_char(i.due_date, 'YYYY-MM-DD'),
      'trigger', nullif(s.item->>'trigger', ''),
      'status', i.status
    ) order by i.installment_no), '[]'::jsonb)
    into v_payments
    from public.payment_installments i
    left join lateral (
      select x as item
      from jsonb_array_elements(v_schedule) x
      where jsonb_typeof(x) = 'object'
        and coalesce(x->>'sequence', '') ~ '^\d{1,3}$'
        and (x->>'sequence')::integer = i.installment_no
      limit 1
    ) s on true
    where i.payment_plan_id = c.payment_plan_id;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'sequence', case when coalesce(x->>'sequence', '') ~ '^\d{1,3}$' then (x->>'sequence')::integer else t.idx::integer end,
      'label', coalesce(x->>'label', t.idx::text || '. Ödeme'),
      'amount', x->'amount',
      'due_date', to_char(private.arvo_try_date(x->>'due_date'), 'YYYY-MM-DD'),
      'trigger', nullif(x->>'trigger', ''),
      'status', null
    ) order by t.idx), '[]'::jsonb)
    into v_payments
    from jsonb_array_elements(v_schedule) with ordinality as t(x, idx)
    where jsonb_typeof(t.x) = 'object';
  end if;

  return jsonb_build_object(
    'work_plan', v_plan,
    'source', v_source,
    'payments', v_payments,
    'pending_addendum', exists (
      select 1 from public.crm_contract_addenda a where a.contract_id = c.id and a.status = 'sent'
    )
  );
end
$function$;
revoke all on function public.arvo_tracking_work_plan(text) from public;
grant execute on function public.arvo_tracking_work_plan(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Teklif rozetleri ve teklif onayı (20260914150000 + erişim kuralı)
-- ---------------------------------------------------------------
create or replace function public.arvo_tracking_documents(p_tracking_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  c public.crm_contracts%rowtype;
  p public.crm_proposals%rowtype;
  v_status text;
  v_decided boolean;
  v_signed boolean;
begin
  select * into c
  from public.crm_contracts
  where tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
    and char_length(coalesce(tracking_code, '')) >= 6
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1;
  if c.id is null then
    return null;
  end if;

  v_signed := c.status in ('signed', 'completed');
  if c.proposal_id is not null then
    select * into p from public.crm_proposals where id = c.proposal_id;
  end if;
  if p.id is not null then
    v_status := private.arvo_proposal_effective_status(p.status, p.archive_reason);
    v_decided := private.arvo_proposal_customer_decided(p.responded_at, p.response_ip, p.customer_responded_at);
  end if;

  return jsonb_build_object(
    'proposal', case when p.id is null then null else jsonb_build_object(
      'no', p.proposal_no,
      'status', v_status,
      'customer_decided', v_decided,
      'can_accept', v_status = 'accepted' and not v_decided,
      'can_reject', v_status = 'accepted' and not v_decided and not v_signed
    ) end,
    'contract', jsonb_build_object('no', c.contract_no, 'status', c.status, 'signed', v_signed)
  );
end
$function$;

create or replace function public.arvo_tracking_confirm_proposal(
  p_tracking_code text,
  p_decision text,
  p_ip text default null,
  p_user_agent text default null
)
returns table(result_status text, contract_token text, contract_status text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_id uuid;
begin
  select c.proposal_id into v_id
  from public.crm_contracts c
  where c.tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
    and char_length(coalesce(c.tracking_code, '')) >= 6
    and private.arvo_contract_tracking_open(c.status, c.tracking_open_before_signature)
  limit 1;
  if v_id is null then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;
  return query select * from private.arvo_confirm_proposal(v_id, p_decision, p_ip, p_user_agent);
end
$function$;

revoke all on function public.arvo_tracking_documents(text) from public;
revoke all on function public.arvo_tracking_confirm_proposal(text, text, text, text) from public;
grant execute on function public.arvo_tracking_documents(text) to anon, authenticated;
grant execute on function public.arvo_tracking_confirm_proposal(text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Sözleşme sayfası: takip kodu yalnızca takip açıksa
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
    'tracking_code', case when private.arvo_contract_tracking_open(c.status, c.tracking_open_before_signature) then c.tracking_code end,
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
