-- Tekliften sözleşme oluştuysa teklif "kabul edilmiş" sayılır.
--
-- Sorun: Geçerlilik tarihi geçen teklif otomatik olarak 'archived' +
-- archive_reason='expired' oluyor. Bu teklife bağlı sözleşme sonradan
-- oluşup imzalansa bile müşteri teklif sayfasında ve takip ekranında
-- "Süresi doldu — yeni teklif için iletişime geçin" görüyordu
-- (ör. TKF-2026-000004 / SOZ-2026-000005).
--
-- Kural: Teklifin bağlı, iptal/ret edilmemiş bir sözleşmesi varsa ve teklif
-- reddedilmemişse etkin durum 'accepted'. Müşteri kendisi karar vermediyse
-- (20260914150000) teklif "Onayınızı bekliyor" görünür ve müşteri onaylayabilir;
-- onaylayınca archive_reason da 'accepted' olarak düzeltilir.
-- 20260914150000 ve 20260914170000'den SONRA çalıştırılmalıdır.
-- Tekrar çalıştırılabilir.

create or replace function private.arvo_proposal_status_with_contract(
  p_status text,
  p_reason text,
  p_contract_status text
)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when private.arvo_proposal_effective_status(p_status, p_reason) in ('expired', 'archived', 'sent', 'draft')
     and p_contract_status in ('draft', 'sent', 'signed', 'completed')
      then 'accepted'
    else private.arvo_proposal_effective_status(p_status, p_reason)
  end
$$;
revoke all on function private.arvo_proposal_status_with_contract(text, text, text) from public, anon;

-- ---------------------------------------------------------------
-- Herkese açık teklif kararı
-- ---------------------------------------------------------------
create or replace function public.arvo_public_proposal_decision(public_token text)
returns table(
  status text,
  responded_at timestamptz,
  response_ip text,
  valid_until date,
  contract_share_token text,
  contract_no text,
  contract_status text,
  response_user_agent text,
  proposal_created_at timestamptz,
  estimated_delivery_date date,
  tax_rate numeric,
  payment_plan_type text,
  payment_schedule jsonb,
  customer_decided boolean,
  contract_signed boolean
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select
    private.arvo_proposal_status_with_contract(p.status::text, p.archive_reason::text, c.status::text),
    p.responded_at,
    p.response_ip::text,
    p.valid_until::date,
    c.share_token::text,
    c.contract_no::text,
    c.status::text,
    p.response_user_agent::text,
    p.created_at,
    p.estimated_delivery_date::date,
    p.tax_rate::numeric,
    p.payment_plan_type::text,
    p.payment_schedule::jsonb,
    private.arvo_proposal_customer_decided(p.responded_at, p.response_ip::text, p.customer_responded_at),
    coalesce(c.status in ('signed', 'completed'), false)
  from public.crm_proposals p
  left join lateral (
    select con.* from public.crm_contracts con
    where con.proposal_id = p.id
    order by con.created_at desc
    limit 1
  ) c on true
  where p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$;
revoke all on function public.arvo_public_proposal_decision(text) from public;
grant execute on function public.arvo_public_proposal_decision(text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Müşteri onayı
-- ---------------------------------------------------------------
create or replace function private.arvo_confirm_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_ip text,
  p_user_agent text
)
returns table(result_status text, contract_token text, contract_status text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  prop public.crm_proposals%rowtype;
  con public.crm_contracts%rowtype;
  v_status text;
  v_ip text := nullif(left(btrim(coalesce(p_ip, '')), 120), '');
  v_ua text := nullif(left(btrim(coalesce(p_user_agent, '')), 1000), '');
  v_customer text;
begin
  if coalesce(p_decision, '') not in ('accept', 'reject') then
    raise exception 'invalid_decision' using errcode = 'check_violation';
  end if;

  select * into prop from public.crm_proposals where id = p_proposal_id for update;
  if prop.id is null then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;

  select * into con
  from public.crm_contracts
  where proposal_id = prop.id
  order by created_at desc
  limit 1;

  if private.arvo_proposal_customer_decided(prop.responded_at, prop.response_ip, prop.customer_responded_at) then
    return query select 'already'::text, con.share_token, con.status;
    return;
  end if;

  v_status := private.arvo_proposal_status_with_contract(prop.status, prop.archive_reason, con.status);
  if v_status <> 'accepted' then
    return query select 'closed'::text, con.share_token, con.status;
    return;
  end if;

  if p_decision = 'accept' then
    -- Arşivlenmiş teklifte sebep de 'accepted' olur (süresi dolmuş görünmesin).
    update public.crm_proposals
       set responded_at = now(),
           response_ip = v_ip,
           response_user_agent = v_ua,
           customer_responded_at = now(),
           archive_reason = case when status = 'archived' then 'accepted' else archive_reason end,
           updated_at = now()
     where id = prop.id;
  else
    if con.id is not null and con.status in ('signed', 'completed') then
      return query select 'contract_signed'::text, con.share_token, con.status;
      return;
    end if;
    update public.crm_proposals
       set status = 'rejected',
           responded_at = now(),
           response_ip = v_ip,
           response_user_agent = v_ua,
           customer_responded_at = now(),
           updated_at = now()
     where id = prop.id;
    if con.id is not null and con.status in ('draft', 'sent') then
      update public.crm_contracts set status = 'cancelled', updated_at = now() where id = con.id;
      con.status := 'cancelled';
    end if;
    update public.crm_opportunities
       set stage = 'lost',
           probability = 0,
           lost_reason = 'Teklif müşteri tarafından reddedildi',
           updated_at = now()
     where id = prop.opportunity_id;
  end if;

  select o.customer_name into v_customer from public.crm_opportunities o where o.id = prop.opportunity_id;

  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct
    prop.organization_id,
    recipient.user_id,
    'organization',
    'proposal_customer_decision',
    case p_decision when 'accept' then 'Müşteri teklifi onayladı' else 'Müşteri teklifi reddetti' end,
    coalesce(prop.proposal_no, 'Teklif')
      || case p_decision when 'accept' then ' müşteri tarafından onaylandı.' else ' müşteri tarafından reddedildi.' end,
    case when con.id is not null then '/panel/crm/contracts/' || con.id::text else '/panel/crm/proposals' end,
    jsonb_build_object(
      'proposal_id', prop.id,
      'proposal_no', prop.proposal_no,
      'contract_id', con.id,
      'decision', p_decision,
      'customer_name', v_customer
    )
  from (
    select m.user_id
    from public.organization_memberships m
    where m.organization_id = prop.organization_id
      and m.is_active
      and m.role::text in ('owner', 'admin', 'manager')
    union
    select e.user_id
    from public.crm_opportunities o
    join public.hr_employees e on e.id = o.assigned_employee_id
    join public.organization_memberships m on m.organization_id = prop.organization_id and m.user_id = e.user_id and m.is_active
    where o.id = prop.opportunity_id
      and e.user_id is not null
  ) recipient
  where recipient.user_id is not null;

  return query select case p_decision when 'accept' then 'accepted' else 'rejected' end, con.share_token, con.status;
end
$function$;
revoke all on function private.arvo_confirm_proposal(uuid, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Takip ekranı rozetleri (20260914170000 + sözleşme kuralı)
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
    v_status := private.arvo_proposal_status_with_contract(p.status, p.archive_reason, c.status);
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
revoke all on function public.arvo_tracking_documents(text) from public;
grant execute on function public.arvo_tracking_documents(text) to anon, authenticated;
