-- Teklifte müşterinin kendi kararı ve kabul edilmiş teklifin doğru görünmesi.
--
-- Sorunlar:
-- 1) archive_inactive_crm_proposal tetikleyicisi kabul/ret edilen teklifi
--    'archived' durumuna çeviriyor (asıl durum archive_reason'da). Herkese
--    açık teklif sayfası durumu 'archived' gördüğü için müşteri kabul etmiş
--    olsa bile kararı göstermiyor, "Karar tamamlandı / Karar bekleniyor"
--    yazıyordu. Karar anındaki cihaz bilgisi de (arvo_record_proposal_response_agent
--    yalnızca 'accepted'/'rejected' arıyor) hiç yazılmıyordu.
-- 2) Personel teklifi müşteri adına sözleşmeye çevirdiğinde (hızlı dönüşüm,
--    doğrudan sözleşme) teklif "kabul edildi" oluyor; müşteri kendi onayını
--    hiç veremiyordu.
--
-- Çözüm:
--  - Etkin durum: 'archived' + archive_reason (accepted/rejected/expired) → o durum.
--  - crm_proposals.customer_responded_at: kararı müşterinin kendisinin verdiği an.
--    Müşteri akışında cihaz kaydıyla birlikte yazılır. Eski kayıtlarda IP'si
--    olan karar müşteri kararıdır (personel akışı IP göndermiyor).
--  - arvo_public_proposal_decision: etkin durum + müşteri kararı + sözleşme imzalı mı.
--  - arvo_confirm_proposal_decision (teklif sayfası) / arvo_tracking_confirm_proposal
--    (takip ekranı): personelin kabul ettiği teklifi müşteri onaylar ya da
--    sözleşme imzalanmadıysa reddeder (imzasız sözleşme iptal edilir).
--  - arvo_tracking_documents: takip ekranında teklif/sözleşme rozetleri.
-- respond_to_crm_proposal'a dokunulmaz (canlı tanım repodan ayrışabilir).
-- Tekrar çalıştırılabilir.

alter table public.crm_proposals
  add column if not exists customer_responded_at timestamptz;

create or replace function private.arvo_proposal_effective_status(p_status text, p_reason text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when p_status = 'archived' and p_reason in ('accepted', 'rejected', 'expired') then p_reason
    else p_status
  end
$$;

create or replace function private.arvo_proposal_customer_decided(
  p_responded_at timestamptz,
  p_response_ip text,
  p_customer_responded_at timestamptz
)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select p_customer_responded_at is not null
      or (p_responded_at is not null and nullif(btrim(coalesce(p_response_ip, '')), '') is not null)
$$;

revoke all on function private.arvo_proposal_effective_status(text, text) from public, anon;
revoke all on function private.arvo_proposal_customer_decided(timestamptz, text, timestamptz) from public, anon;

-- ---------------------------------------------------------------
-- Müşteri akışında karar kaydı (cihaz + müşteri kararı)
-- ---------------------------------------------------------------
create or replace function public.arvo_record_proposal_response_agent(public_token text, p_user_agent text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  affected integer;
begin
  update public.crm_proposals
     set response_user_agent = coalesce(response_user_agent, nullif(left(trim(coalesce(p_user_agent, '')), 1000), '')),
         customer_responded_at = coalesce(customer_responded_at, responded_at)
   where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
     and private.arvo_proposal_effective_status(status, archive_reason) in ('accepted', 'rejected')
     and responded_at is not null
     and responded_at > now() - interval '10 minutes'
     and customer_responded_at is null;
  get diagnostics affected = row_count;
  return affected > 0;
end
$function$;
revoke all on function public.arvo_record_proposal_response_agent(text, text) from public;
grant execute on function public.arvo_record_proposal_response_agent(text, text) to anon, authenticated;

-- ---------------------------------------------------------------
-- Herkese açık teklif kararı (etkin durum)
-- ---------------------------------------------------------------
drop function if exists public.arvo_public_proposal_decision(text);
create function public.arvo_public_proposal_decision(public_token text)
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
    private.arvo_proposal_effective_status(p.status::text, p.archive_reason::text),
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
-- Müşteri onayı (personelin kabul ettiği teklif için)
-- Dönüş: accepted | rejected | already | closed | contract_signed
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

  v_status := private.arvo_proposal_effective_status(prop.status, prop.archive_reason);
  if v_status <> 'accepted' then
    return query select 'closed'::text, con.share_token, con.status;
    return;
  end if;

  if p_decision = 'accept' then
    update public.crm_proposals
       set responded_at = now(),
           response_ip = v_ip,
           response_user_agent = v_ua,
           customer_responded_at = now(),
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

  -- Satış ekibine bildirim: owner/admin/manager ve talebin satış temsilcisi.
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

create or replace function public.arvo_confirm_proposal_decision(
  public_token text,
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
  select p.id into v_id
  from public.crm_proposals p
  where p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  if v_id is null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;
  return query select * from private.arvo_confirm_proposal(v_id, p_decision, p_ip, p_user_agent);
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
    and c.status in ('draft', 'sent', 'signed', 'completed')
  limit 1;
  if v_id is null then
    raise exception 'proposal_not_found' using errcode = 'P0002';
  end if;
  return query select * from private.arvo_confirm_proposal(v_id, p_decision, p_ip, p_user_agent);
end
$function$;

-- ---------------------------------------------------------------
-- Takip ekranı: teklif ve sözleşme durumu
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
    and status in ('draft', 'sent', 'signed', 'completed')
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

revoke all on function public.arvo_confirm_proposal_decision(text, text, text, text) from public;
revoke all on function public.arvo_tracking_confirm_proposal(text, text, text, text) from public;
revoke all on function public.arvo_tracking_documents(text) from public;
grant execute on function public.arvo_confirm_proposal_decision(text, text, text, text) to anon, authenticated;
grant execute on function public.arvo_tracking_confirm_proposal(text, text, text, text) to anon, authenticated;
grant execute on function public.arvo_tracking_documents(text) to anon, authenticated;
