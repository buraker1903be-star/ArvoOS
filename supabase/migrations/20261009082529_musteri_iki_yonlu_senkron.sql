-- ============================================================
-- MÜŞTERİ BİLGİSİ İKİ YÖNLÜ SENKRON (CRM ⇄ FİNANS)
--
-- Müşterinin iki kaydı var: talepler (crm_opportunities: ad, telefon,
-- e-posta, künye) ve carisi (account_parties). Bağ sözleşmeden geçiyor.
-- 20261001222733 CRM'den cariye TEK YÖNLÜ yansıtıyordu ve yalnızca cari
-- alanı hâlâ ESKİ değeri taşıyorsa: bir kez ayrışan alan ("EMİNE ÇETİN"
-- / "Emine Çetin") bir daha hiç eşlenmiyordu; caride yapılan düzeltme
-- de taleplere, işlere hiç yansımıyordu. Talepler, teklifler, işler ve
-- Finans → Müşteriler aynı müşteriyi farklı adla gösteriyordu.
--
-- ARTIK (kurum sahibinin kararı, 09.10.2026):
--   1) Talepte ad/telefon/e-posta değişince bağlı cariler HER ZAMAN
--      güncellenir (iş kaydındaki ad kopyası da, önceki gibi).
--   2) Caride ad/telefon/e-posta değişince o cariye bağlı BÜTÜN talepler
--      güncellenir; onların tetikleyicisi iş kayıtlarını ve müşterinin
--      diğer carilerini günceller. Değerler aynıya yakınsadığında (IS
--      DISTINCT FROM) zincir kendiliğinden durur; ayrıca derinlik sınırı.
--   3) İmzada cari önce telefona, sonra Türkçe harf duyarsız ada göre
--      bulunur (sign_crm_contract).
--
-- Vergi no, vergi dairesi ve adres yalnızca caride; senkron dışı.
-- Tetikleyiciler security definer: talebi düzenleyebilen kişinin cariye
-- (ya da tersi) yazma yetkisi olmasa da müşteri bilgisi tek kalmalı;
-- yalnızca bu üç alan ve yalnızca sözleşmeyle bağlı kayıtlar.
-- ============================================================

-- 1) Talep → cari ve iş: koşulsuz eşleme
create or replace function private.arvo_musteri_bilgisi_yansit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if pg_trigger_depth() > 6 then
    return new;
  end if;

  -- İş kaydındaki ad kopyası (İşler, pano, takvim, arşiv, genel bakış)
  if new.customer_name is distinct from old.customer_name then
    update public.operation_workflows w
       set customer_name = new.customer_name,
           updated_at = now()
      from public.crm_contracts c
     where c.opportunity_id = new.id
       and w.contract_id = c.id
       and w.customer_name is distinct from new.customer_name;
  end if;

  -- Cari (finans): sözleşmenin party_id'si ve ödeme planının party_id'si.
  update public.account_parties p
     set name = new.customer_name,
         email = new.contact_email,
         phone = new.contact_phone,
         updated_at = now()
   where p.organization_id = new.organization_id
     and p.id in (
       select pp.party_id
         from public.crm_contracts c
         join public.payment_plans pp on pp.contract_id = c.id
        where c.opportunity_id = new.id and pp.party_id is not null
       union
       select c.party_id
         from public.crm_contracts c
        where c.opportunity_id = new.id and c.party_id is not null
     )
     and (p.name is distinct from new.customer_name
          or p.email is distinct from new.contact_email
          or p.phone is distinct from new.contact_phone);

  return new;
end;
$$;

revoke all on function private.arvo_musteri_bilgisi_yansit() from public, anon, authenticated;

-- 2) Cari → talepler (yeni)
create or replace function private.arvo_cari_bilgisi_yansit()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if pg_trigger_depth() > 6 then
    return new;
  end if;

  update public.crm_opportunities o
     set customer_name = new.name,
         contact_email = new.email,
         contact_phone = new.phone,
         updated_at = now()
   where o.organization_id = new.organization_id
     and o.id in (
       select c.opportunity_id
         from public.crm_contracts c
        where c.party_id = new.id and c.opportunity_id is not null
       union
       select c.opportunity_id
         from public.payment_plans pp
         join public.crm_contracts c on c.id = pp.contract_id
        where pp.party_id = new.id and c.opportunity_id is not null
     )
     and (o.customer_name is distinct from new.name
          or o.contact_email is distinct from new.email
          or o.contact_phone is distinct from new.phone);

  return new;
end;
$$;

revoke all on function private.arvo_cari_bilgisi_yansit() from public, anon, authenticated;

drop trigger if exists arvo_cari_bilgisi_yansit on public.account_parties;
create trigger arvo_cari_bilgisi_yansit
  after update of name, email, phone on public.account_parties
  for each row
  when (old.name is distinct from new.name
        or old.email is distinct from new.email
        or old.phone is distinct from new.phone)
  execute function private.arvo_cari_bilgisi_yansit();

-- 3) İmza: cari önce telefona, sonra ada göre. Gövdenin geri kalanı
--    canlıdakiyle aynı (supabase/schema/canli-sema.sql, 09.10.2026).
CREATE OR REPLACE FUNCTION public.sign_crm_contract(public_token text, signer_name text, signer_ip text DEFAULT NULL::text, signer_user_agent text DEFAULT NULL::text)
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

  /*
    Müşterinin carisi: önce TELEFON (son 10 hane), sonra AD. Eskiden
    yalnızca birebir ad (lower(name) = lower(...)) aranıyordu: "EMİNE
    ÇETİN" ile "Emine Çetin" farklı sayılıyor ve aynı müşteriye ikinci
    bir cari açılıyordu (borç iki kayda bölünüyordu); aynı adı taşıyan
    iki farklı kişi de tek cariye düşüyordu. Ad karşılaştırması
    arvo_name_key ile: Türkçe harf ve büyük/küçük harf farkı gözetmez.
  */
  if length(private.arvo_phone_key(opp.contact_phone)) = 10 then
    select id into party
    from public.account_parties
    where organization_id = con.organization_id
      and is_active = true
      and private.arvo_phone_key(phone) = private.arvo_phone_key(opp.contact_phone)
    order by created_at
    limit 1;
  end if;
  if party is null and private.arvo_name_key(opp.customer_name) <> '' then
    select id into party
    from public.account_parties
    where organization_id = con.organization_id
      and is_active = true
      and private.arvo_name_key(name) = private.arvo_name_key(opp.customer_name)
    order by created_at
    limit 1;
  end if;

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
$function$
;

revoke all on function public.sign_crm_contract(public_token text, signer_name text, signer_ip text, signer_user_agent text) from public;
grant execute on function public.sign_crm_contract(public_token text, signer_name text, signer_ip text, signer_user_agent text) to service_role;
