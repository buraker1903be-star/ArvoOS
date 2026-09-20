-- ============================================================
-- 20.09.2026 güvenlik denetiminin veritabanı düzeltmeleri.
--
-- Ortak kök: kural yalnızca sunucu kodunda yazılmış, veritabanında yok.
-- Oturum jetonu (ve paylaşım bağlantısı) tarayıcıda olduğu için PostgREST'e
-- doğrudan istek atan biri sunucuyu atlıyordu. AGENTS.md: yetki üç yerdedir.
--
-- 1) İmza: sign_crm_contract sözleşmenin durumuna hiç bakmıyordu. İptal
--    edilmiş, reddedilmiş ya da tamamlanmış sözleşme eski bağlantıdan
--    imzalanabiliyor; iş akışı, ödeme planı, taksitler, cari borç ve fatura
--    oluşuyor, imzalı sözleşme dondurulduğu için geri alınamıyordu.
-- 2) İmza görseli: sign_crm_contract_v2, imza zaten atılmışsa bile
--    signed_signature_data'yı koşulsuz üzerine yazıyordu; bağlantıyı ele
--    geçiren biri imzayı sessizce değiştirebiliyordu. Koruma tetikleyicisi
--    security definer çağrıda devre dışı kaldığı için buradan kapatılır.
-- 3) Belge numarası: next_document_number hiçbir yetki kontrolü yapmıyordu;
--    herhangi bir oturumlu kullanıcı başka kurumun fatura/teklif sayacını
--    artırabiliyor ve ilk çağrıda ön ekini belirleyebiliyordu.
-- 4) Erişim günlüğü: log_document_access "auth.uid() doluysa üye mi" diye
--    baktığı için oturumsuz çağrıda hiç kontrol yapmıyordu; anonim biri
--    başka kurumun denetim izine sahte kayıt yazabiliyordu.
-- 5) Tahsilat: collect_payment_installment ve rebuild_payment_plan_installments
--    yalnızca "üye mi" diye soruyordu. Finans modülü kapalı bir satış
--    personeli taksiti "ödendi" yapabiliyor, prim tahakkuk ettirebiliyor ve
--    ödeme planını yeniden kurabiliyordu. Sunucudaki kural: owner/admin.
--
-- Meşru akışlar korunur: müşteri taslak/gönderilmiş sözleşmeyi imzalar,
-- panel kendi kurumunun numarasını alır, servis rolü (köprü, cron) etkilenmez.
-- ============================================================

-- ---------- 1) İmza yalnızca taslak/gönderilmiş sözleşmede ----------
create or replace function public.sign_crm_contract(public_token text, signer_name text, signer_ip text DEFAULT NULL::text, signer_user_agent text DEFAULT NULL::text)
 RETURNS TABLE(result_status text, workflow_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  con public.crm_contracts%rowtype;
  opp public.crm_opportunities%rowtype;
  proposal_schedule jsonb;
  org_slug text;
  template_key text;
  template_version text := '2.0';
  schedule_item jsonb;
  new_wf uuid;
  party uuid;
  plan uuid;
  invoice uuid;
  due_on date;
  installment_count integer := 0;
begin
  select * into con
  from public.crm_contracts
  where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  for update;

  if con.id is null then
    raise exception 'invalid_token';
  end if;

  if con.workflow_id is not null then
    return query select
      case when con.status = 'signed' then 'signed' else 'workflow_exists' end,
      con.workflow_id;
    return;
  end if;

  if con.status = 'signed' then
    return query select 'signed', con.workflow_id;
    return;
  end if;

  -- Yalnızca taslak ve gönderilmiş sözleşme imzalanır. Eskiden durum hiç
  -- denetlenmiyordu: iptal edilmiş ya da reddedilmiş sözleşme eski
  -- bağlantıdan imzalanıp iş akışı, ödeme planı ve cari borç üretiyordu
  -- (kural yalnızca app/sozlesme/[token]/actions.ts içindeydi).
  if con.status not in ('draft', 'sent') then
    raise exception 'contract_closed';
  end if;

  if length(trim(coalesce(signer_name, ''))) < 2 then
    raise exception 'invalid_signer';
  end if;

  select * into opp
  from public.crm_opportunities
  where id = con.opportunity_id;

  select slug into org_slug
  from public.organizations
  where id = con.organization_id;

  template_key := case
    when regexp_replace(lower(coalesce(org_slug, '')), '[^a-z0-9]', '', 'g') like '%akademikmerkez%'
      then 'akademikmerkez_academic'
    else 'arvoos_general'
  end;

  select coalesce(payment_schedule, '[]'::jsonb)
  into proposal_schedule
  from public.crm_proposals
  where id = con.proposal_id;

  select id into party
  from public.account_parties
  where organization_id = con.organization_id
    and lower(name) = lower(opp.customer_name)
    and is_active = true
  order by created_at
  limit 1;

  if party is null then
    insert into public.account_parties(
      organization_id, party_type, name, email, phone, is_active, created_by
    ) values (
      con.organization_id, 'customer', opp.customer_name,
      opp.contact_email, opp.contact_phone, true, con.created_by
    ) returning id into party;
  end if;

  insert into public.operation_workflows(
    organization_id, contract_id, title, customer_name, description,
    status, priority, start_date, due_date, created_by
  ) values (
    con.organization_id, con.id, con.title, opp.customer_name, con.scope,
    'planned', 'normal', coalesce(con.start_date, current_date),
    con.due_date, con.created_by
  )
  on conflict (contract_id) where contract_id is not null
  do update set updated_at = now()
  returning id into new_wf;

  if not exists (
    select 1
    from public.operation_steps os
    where os.workflow_id = new_wf
  ) then
    insert into public.operation_steps(
      organization_id, workflow_id, title, sort_order
    ) values
      (con.organization_id, new_wf, 'Başlangıç ve kapsam kontrolü', 10),
      (con.organization_id, new_wf, 'Üretim / hizmet çalışması', 20),
      (con.organization_id, new_wf, 'Kalite kontrolü', 30),
      (con.organization_id, new_wf, 'Müşteri teslimi', 40);
  end if;

  due_on := coalesce(con.due_date, current_date + 30);

  insert into public.payment_plans(
    organization_id, contract_id, party_id, total_amount,
    currency, status, created_by
  ) values (
    con.organization_id, con.id, party, con.amount,
    con.currency, 'active', con.created_by
  ) returning id into plan;

  if jsonb_typeof(proposal_schedule) = 'array'
     and jsonb_array_length(proposal_schedule) > 0 then
    for schedule_item in select value from jsonb_array_elements(proposal_schedule)
    loop
      installment_count := installment_count + 1;
      insert into public.payment_installments(
        organization_id, payment_plan_id, installment_no,
        due_date, amount, status
      ) values (
        con.organization_id,
        plan,
        coalesce(nullif(schedule_item->>'sequence', '')::integer, installment_count),
        coalesce(nullif(schedule_item->>'due_date', '')::date, due_on),
        greatest(0, coalesce(nullif(schedule_item->>'amount', '')::bigint, 0)),
        'pending'
      );
    end loop;
  end if;

  if installment_count = 0 then
    insert into public.payment_installments(
      organization_id, payment_plan_id, installment_no,
      due_date, amount, status
    ) values (
      con.organization_id, plan, 1, due_on, con.amount, 'pending'
    );
  end if;

  insert into public.account_entries(
    organization_id, party_id, entry_type, source_type,
    amount, currency, description, reference_no,
    transaction_date, due_date, created_by
  ) values (
    con.organization_id, party, 'debit', 'crm_contract',
    con.amount, con.currency, con.title, con.contract_no,
    current_date, due_on, con.created_by
  );

  insert into public.finance_transactions(
    organization_id, transaction_type, status, title,
    counterparty, category, amount, currency,
    due_date, notes, created_by
  ) values (
    con.organization_id, 'income', 'planned', con.title,
    opp.customer_name, 'Sözleşme Tahsilatı', con.amount,
    con.currency, due_on,
    'Sözleşme ' || con.contract_no || ' üzerinden otomatik oluşturuldu.',
    con.created_by
  );

  insert into public.billing_invoices(
    organization_id, provider, status, currency,
    subtotal, tax, total, due_at
  ) values (
    con.organization_id, 'manual', 'draft', con.currency,
    con.amount, 0, con.amount, due_on::timestamptz
  ) returning id into invoice;

  update public.crm_contracts c
  set status = 'signed',
      signed_name = trim(signer_name),
      signed_at = now(),
      signed_ip = nullif(left(trim(coalesce(signer_ip, '')), 120), ''),
      signed_user_agent = nullif(left(trim(coalesce(signer_user_agent, '')), 1000), ''),
      acceptance_recorded_at = now(),
      contract_template_key = template_key,
      contract_template_version = template_version,
      workflow_id = new_wf,
      party_id = party,
      payment_plan_id = plan,
      invoice_id = invoice,
      updated_at = now()
  where c.id = con.id;

  update public.crm_opportunities o
  set stage = 'won', probability = 100, updated_at = now()
  where o.id = con.opportunity_id;

  return query select 'signed', new_wf;
end
$function$;


-- ---------- 2) İmza görseli yalnızca imzanın atıldığı çağrıda yazılır ----------
create or replace function public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text DEFAULT NULL::text, signer_user_agent text DEFAULT NULL::text)
 returns TABLE(result_status text, workflow_id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  signed_result record;
  onceden_imzali boolean;
begin
  if signature_data is null
     or length(signature_data) < 200
     or length(signature_data) > 500000
     or signature_data not like 'data:image/png;base64,%' then
    raise exception 'invalid_signature';
  end if;

  select (c.status = 'signed' or c.signed_at is not null) into onceden_imzali
  from public.crm_contracts c
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');

  select * into signed_result
  from public.sign_crm_contract(public_token, signer_name, signer_ip, signer_user_agent);

  -- Eskiden bu UPDATE koşulsuzdu: bağlantıyı ele geçiren biri imzalı
  -- sözleşmenin imza görselini değiştirebiliyordu (imzacı adı ve zamanı
  -- eskisi gibi kalıyor, yalnızca görsel değişiyordu).
  if not coalesce(onceden_imzali, false) then
    update public.crm_contracts
    set signed_signature_data = signature_data,
        updated_at = now()
    where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  end if;

  return query select signed_result.result_status::text, signed_result.workflow_id::uuid;
end
$function$;

-- ---------- 3) Belge numarası yalnızca kendi kurumunda ----------
create or replace function public.next_document_number(target_organization_id uuid, target_document_type text, default_prefix text, target_date date DEFAULT CURRENT_DATE)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  seq_year integer := extract(year from target_date)::integer;
  next_value bigint;
  resolved_prefix text;
  resolved_padding integer;
begin
  if target_organization_id is null then raise exception 'organization_required'; end if;
  if trim(coalesce(target_document_type, '')) = '' then raise exception 'document_type_required'; end if;
  if trim(coalesce(default_prefix, '')) = '' then raise exception 'prefix_required'; end if;

  -- Oturumlu çağrı yalnızca kendi kurumunun sayacını ilerletebilir; sunucu
  -- (servis rolü, cron) eskisi gibi serbest. Eskiden hiçbir kontrol yoktu:
  -- herhangi bir kullanıcı başka kurumun numarasını tüketebiliyordu.
  if (select auth.uid()) is not null and not public.arvo_is_member(target_organization_id) then
    raise exception 'forbidden';
  end if;

  insert into public.document_number_sequences(
    organization_id, document_type, sequence_year, prefix, last_number, padding
  )
  values(
    target_organization_id,
    lower(trim(target_document_type)),
    seq_year,
    upper(trim(default_prefix)),
    1,
    6
  )
  on conflict (organization_id, document_type, sequence_year)
  do update set
    last_number = public.document_number_sequences.last_number + 1,
    updated_at = now()
  returning last_number, prefix, padding
  into next_value, resolved_prefix, resolved_padding;

  return resolved_prefix || '-' || seq_year::text || '-' || lpad(next_value::text, resolved_padding, '0');
end
$function$;

-- ---------- 4) Erişim günlüğü: oturumsuz çağrı yazamaz ----------
create or replace function public.log_document_access(target_document_type text, target_document_id uuid, target_access_type text, target_ip text DEFAULT NULL::text, target_user_agent text DEFAULT NULL::text, target_referrer text DEFAULT NULL::text, target_metadata jsonb DEFAULT '{}'::jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  resolved_organization_id uuid;
  new_id uuid;
  cagiran_rol text := coalesce((select auth.jwt() ->> 'role'), '');
begin
  if target_document_type = 'proposal' then
    select organization_id into resolved_organization_id
    from public.crm_proposals where id = target_document_id;
  elsif target_document_type = 'contract' then
    select organization_id into resolved_organization_id
    from public.crm_contracts where id = target_document_id;
  else
    raise exception 'invalid_document_type';
  end if;

  if resolved_organization_id is null then raise exception 'document_not_found'; end if;
  if target_access_type not in ('panel_preview','public_view','pdf_print','share_link') then raise exception 'invalid_access_type'; end if;

  /*
    Eskiden kontrol "auth.uid() doluysa üye mi" diyordu: oturumsuz çağrı hiç
    denetlenmiyordu ve anonim biri belge kimliğini tutturduğunda başka kurumun
    denetim izine istediği kadar sahte kayıt yazabiliyordu. Jetonla gelen
    müşteri erişimleri zaten ayrı fonksiyonlarla (log_public_document_access*)
    kaydediliyor; burası panel içindir. Sunucu (servis rolü) serbest.
  */
  if cagiran_rol <> 'service_role' then
    if (select auth.uid()) is null then raise exception 'forbidden'; end if;
    if not public.arvo_is_member(resolved_organization_id) then raise exception 'forbidden'; end if;
  end if;

  insert into public.document_access_logs(
    organization_id, document_type, document_id, access_type, actor_user_id,
    access_ip, user_agent, referrer, metadata
  ) values (
    resolved_organization_id, target_document_type, target_document_id, target_access_type,
    (select auth.uid()), nullif(left(coalesce(target_ip,''),120),''),
    nullif(left(coalesce(target_user_agent,''),1000),''),
    nullif(left(coalesce(target_referrer,''),1000),''),
    coalesce(target_metadata,'{}'::jsonb)
  ) returning id into new_id;

  return new_id;
end
$function$;

-- ---------- 5) Tahsilat ve ödeme planı: owner/admin ----------
-- Sunucudaki kuralın (app/panel/finance/actions.ts: finans modülü + owner/admin)
-- veritabanı karşılığı. Rol kontrolü tek yerde dursun diye yardımcı fonksiyon.
create or replace function private.arvo_is_finance_manager(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin')
  )
$function$;

revoke all on function private.arvo_is_finance_manager(uuid) from public, anon, authenticated;
grant execute on function private.arvo_is_finance_manager(uuid) to authenticated, service_role;

create or replace function public.collect_payment_installment(target_installment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  inst public.payment_installments%rowtype;
  plan public.payment_plans%rowtype;
  con public.crm_contracts%rowtype;
  opp public.crm_opportunities%rowtype;
  emp public.hr_employees%rowtype;
  commission_value bigint;
begin
  select * into inst from public.payment_installments where id=target_installment_id;
  if inst.id is null then raise exception 'installment_not_found'; end if;
  select * into plan from public.payment_plans where id=inst.payment_plan_id;
  -- Eskiden yalnızca "üye mi" diye bakılıyordu: finans modülü kapalı bir satış
  -- personeli taksiti "ödendi" yapıp kendi primini tahakkuk ettirebiliyordu.
  -- Sunucudaki kural (app/panel/finance/actions.ts) owner/admin istiyor.
  if (select auth.uid()) is not null and not private.arvo_is_finance_manager(plan.organization_id) then
    raise exception 'forbidden';
  end if;
  if inst.status='paid' then return; end if;

  select * into con from public.crm_contracts where id=plan.contract_id;
  select * into opp from public.crm_opportunities where id=con.opportunity_id;

  update public.payment_installments set status='paid',paid_at=now() where id=inst.id;

  insert into public.account_entries(organization_id,party_id,entry_type,source_type,amount,currency,description,reference_no,transaction_date,due_date,created_by)
  values(plan.organization_id,plan.party_id,'credit','payment',inst.amount,plan.currency,'Tahsilat - '||coalesce(con.title,'Sözleşme'),coalesce(con.contract_no,'TAHSILAT'),current_date,inst.due_date,auth.uid());

  update public.finance_transactions set status='paid',paid_at=now(),updated_at=now()
  where organization_id=plan.organization_id and transaction_type='income' and status='planned'
    and counterparty=(select name from public.account_parties where id=plan.party_id)
    and amount=inst.amount and (due_date=inst.due_date or due_date is null);

  if opp.assigned_employee_id is not null then
    select * into emp from public.hr_employees
    where id=opp.assigned_employee_id and organization_id=plan.organization_id and employment_status='active';
    if emp.id is not null and emp.commission_rate > 0 then
      commission_value:=round(inst.amount*emp.commission_rate/100.0);
      insert into public.hr_sales_commissions(organization_id,employee_id,opportunity_id,payment_installment_id,collected_amount,commission_rate,commission_amount,status)
      values(plan.organization_id,emp.id,opp.id,inst.id,inst.amount,emp.commission_rate,commission_value,'accrued')
      on conflict(payment_installment_id,employee_id) do nothing;
    end if;
  end if;

  if not exists(select 1 from public.payment_installments where payment_plan_id=plan.id and status='pending') then
    update public.payment_plans set status='completed',updated_at=now() where id=plan.id;
  end if;
end$function$
;

CREATE OR REPLACE FUNCTION public.complete_organization_onboarding(p_organization_id uuid, p_legal_name text, p_phone text, p_website text, p_logo_url text, p_primary_color text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if length(trim(p_legal_name)) < 2 or length(trim(p_legal_name)) > 180 then
    raise exception 'Invalid legal name';
  end if;
  if p_primary_color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Invalid color';
  end if;

  insert into public.organization_onboarding (
    organization_id, current_step, legal_name, phone, website, logo_url,
    primary_color, completed_at, completed_by, updated_at
  ) values (
    p_organization_id, 4, trim(p_legal_name), nullif(trim(p_phone), ''),
    nullif(trim(p_website), ''), nullif(trim(p_logo_url), ''), p_primary_color,
    now(), (select auth.uid()), now()
  )
  on conflict (organization_id) do update set
    current_step = 4,
    legal_name = excluded.legal_name,
    phone = excluded.phone,
    website = excluded.website,
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    completed_at = excluded.completed_at,
    completed_by = excluded.completed_by,
    updated_at = excluded.updated_at;
end;
$function$;


create or replace function public.rebuild_payment_plan_installments(p_plan_id uuid, p_installment_count integer, p_first_due_date date, p_interval_months integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan public.payment_plans%rowtype;
  v_base_amount bigint;
  v_remainder bigint;
  v_index integer;
begin
  select * into v_plan
  from public.payment_plans
  where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'payment_plan_not_found';
  end if;
  -- Ödenmemiş taksitleri silip yeniden kurar; owner/admin işi (bkz. collect).
  if (select auth.uid()) is not null and not private.arvo_is_finance_manager(v_plan.organization_id) then
    raise exception 'forbidden';
  end if;
  if p_installment_count < 1 or p_installment_count > 36 then
    raise exception 'invalid_installment_count';
  end if;
  if p_interval_months < 1 or p_interval_months > 12 then
    raise exception 'invalid_interval';
  end if;
  if p_first_due_date is null then
    raise exception 'invalid_first_due_date';
  end if;
  if exists (
    select 1 from public.payment_installments
    where payment_plan_id = v_plan.id and status = 'paid'
  ) then
    raise exception 'payment_plan_has_paid_installments';
  end if;

  delete from public.payment_installments
  where payment_plan_id = v_plan.id;

  v_base_amount := v_plan.total_amount / p_installment_count;
  v_remainder := v_plan.total_amount - (v_base_amount * p_installment_count);

  for v_index in 1..p_installment_count loop
    insert into public.payment_installments (
      organization_id,
      payment_plan_id,
      installment_no,
      due_date,
      amount,
      status
    ) values (
      v_plan.organization_id,
      v_plan.id,
      v_index,
      (p_first_due_date + make_interval(months => (v_index - 1) * p_interval_months))::date,
      v_base_amount + case when v_index = p_installment_count then v_remainder else 0 end,
      'pending'
    );
  end loop;

  update public.payment_plans
  set status = 'active', updated_at = now()
  where id = v_plan.id;
end;
$function$;


notify pgrst, 'reload schema';
