-- gelir_taksite_baglandi
--
-- GELİR KAYDI TAHSİLATLA KAPANMIYORDU (24.10.2026).
--
-- Müşteri sözleşmeyi imzalayınca `sign_crm_contract` üç şey yapıyor:
-- cariye borç yazıyor, ödeme planının taksitlerini açıyor ve "planlı
-- gelir" kaydı oluşturuyor. Taksit tahsil edilince
-- `collect_payment_installment` o kaydı 'paid'e çevirmeye çalışıyor.
-- Tasarım doğru — imzada tahakkuk, tahsilatta nakit — ama eşleştirme
-- tutmuyordu:
--
--   imzada yazılan   : tutar = sözleşmenin TAMAMI
--                      karşı taraf = crm_opportunities.customer_name
--   tahsilatta aranan: tutar = TAKSİT tutarı
--                      karşı taraf = account_parties.name
--
-- Üç taksitli bir sözleşmede tutarlar hiçbir zaman eşleşmiyor; müşteri
-- adı da iki ayrı tablodan geliyor (biri serbest metin, öteki cari
-- kaydı). Eşleşmeyen `update` HATA VERMİYOR, sessizce geçiyor. Canlıda
-- akademikmerkez kurumunda 27 kayıt (₺878.250) bu yüzden "planlı"da
-- takılı kaldı ve Finansal Performans raporu "Gelir ₺0" gösterdi.
--
-- ÇÖZÜM: ad/tutar tahmini yerine GERÇEK BAĞ. `finance_transactions`
-- satırı hangi taksidin karşılığıysa onu taşıyor
-- (`payment_installment_id`), planlı gelir TAKSİT BAŞINA yazılıyor ve
-- tahsilat kimlikle kapatıyor.
--
-- `sign_crm_contract_v2` bu fonksiyonu ÇAĞIRIYOR; tek yerden düzeltmek
-- iki imza akışını birden düzeltiyor.
--
-- Tekrar çalıştırılabilir.

-- ---------------------------------------------------------------
-- 1) Gelir satırı hangi taksidin karşılığı
-- ---------------------------------------------------------------
alter table public.finance_transactions
  add column if not exists payment_installment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'finance_transactions_payment_installment_id_fkey'
  ) then
    alter table public.finance_transactions
      add constraint finance_transactions_payment_installment_id_fkey
      foreign key (payment_installment_id)
      references public.payment_installments(id) on delete set null;
  end if;
end$$;

comment on column public.finance_transactions.payment_installment_id is
  'Gelir satırının karşılığı olan taksit. Tahsilat bu kimlikle kapatıyor; '
  'önceden karşı taraf adı + tutar + vade ile aranıyordu ve çoğu sözleşmede hiç eşleşmiyordu.';

create index if not exists finance_transactions_installment_idx
  on public.finance_transactions (payment_installment_id)
  where payment_installment_id is not null;

-- ---------------------------------------------------------------
-- 2) İmzada planlı gelir TAKSİT BAŞINA
-- ---------------------------------------------------------------
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

  /*
    PLANLI GELİR ARTIK TAKSİT BAŞINA ve taksite BAĞLI (24.10.2026).

    Önceden sözleşmenin TAMAMI için tek bir satır yazılıyordu; tahsilat
    ise TAKSİT tutarıyla eşleşme arıyordu. Üç taksitli bir sözleşmede
    tutarlar hiçbir zaman tutmuyor, kayıt asla 'paid' olmuyordu —
    üstelik eşleşmeyen `update` hata vermediği için sessizce. Canlıda
    27 kayıt bu yüzden "planlı"da takılı kaldı.

    Eşleştirme artık ad/tutar tahminiyle değil `payment_installment_id`
    ile; sıfır tutarlı taksit gelir satırı üretmiyor.
  */
  insert into public.finance_transactions(
    organization_id, transaction_type, status, title,
    counterparty, category, amount, currency,
    due_date, notes, created_by, party_id, payment_installment_id
  )
  select
    con.organization_id, 'income', 'planned', con.title,
    opp.customer_name, 'Sözleşme Tahsilatı', i.amount, con.currency,
    i.due_date,
    'Sözleşme ' || con.contract_no || ' · ' || i.installment_no || '. taksit',
    con.created_by, party, i.id
  from public.payment_installments i
  where i.payment_plan_id = plan and i.amount > 0;

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

-- ---------------------------------------------------------------
-- 3) Tahsilat gelir kaydını KİMLİKLE kapatıyor
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.collect_payment_installment(target_installment_id uuid)
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

  /* Gelir kaydı TAKSİT KİMLİĞİYLE kapanıyor. Önceden karşı taraf
     ADI + tutar + vade üçlüsüyle aranıyordu: ad iki ayrı tablodan
     geliyordu (talebin serbest metni / cari kaydı) ve tutar sözleşmenin
     tamamıydı, yani çoğu sözleşmede hiç eşleşmiyordu. */
  update public.finance_transactions
  set status='paid', paid_at=now(), updated_at=now()
  where payment_installment_id = inst.id
    and organization_id = plan.organization_id
    and transaction_type = 'income'
    and status = 'planned';

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
$function$
;

-- ---------------------------------------------------------------
-- 4) Cari mutabakatı da aynı kimlikle
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.arvo_reconcile_party_installments(p_organization_id uuid, p_party_id uuid, p_dry_run boolean DEFAULT false)
 RETURNS TABLE(installment_id uuid, installment_no integer, amount bigint, due_date date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_unallocated bigint;
  v_party_name text;
  r record;
begin
  if p_organization_id is null or p_party_id is null then
    return;
  end if;

  -- Eşzamanlı tahsilatlarda aynı taksidin iki kez kapanmasını önle.
  perform 1
  from public.payment_installments i
  join public.payment_plans p on p.id = i.payment_plan_id
  where p.organization_id = p_organization_id and p.party_id = p_party_id
  for update of i;

  select
    coalesce(sum(case
      when e.entry_type = 'credit' then e.amount
      when e.entry_type = 'debit' and e.source_type = 'adjustment' then -e.amount
      else 0
    end), 0)
  into v_unallocated
  from public.account_entries e
  where e.organization_id = p_organization_id and e.party_id = p_party_id;

  v_unallocated := v_unallocated - coalesce((
    select sum(i.amount)
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'paid'
  ), 0);

  select name into v_party_name from public.account_parties where id = p_party_id;

  for r in
    select i.id, i.installment_no, i.amount, i.due_date
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'pending'
    order by i.due_date nulls last, i.installment_no
  loop
    exit when v_unallocated < r.amount;
    v_unallocated := v_unallocated - r.amount;

    installment_id := r.id;
    installment_no := r.installment_no;
    amount := r.amount;
    due_date := r.due_date;
    return next;

    if not p_dry_run then
      update public.payment_installments
      set status = 'paid', paid_at = now()
      where id = r.id;

      -- collect_payment_installment ile aynı eşleştirme: taksit kimliği.
      update public.finance_transactions
      set status = 'paid', paid_at = now(), updated_at = now()
      where payment_installment_id = r.id
        and organization_id = p_organization_id
        and transaction_type = 'income'
        and status = 'planned';
    end if;
  end loop;

  if not p_dry_run then
    update public.payment_plans p
    set status = 'completed', updated_at = now()
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and p.status is distinct from 'completed'
      and exists (select 1 from public.payment_installments i where i.payment_plan_id = p.id)
      and not exists (
        select 1 from public.payment_installments i
        where i.payment_plan_id = p.id and i.status = 'pending'
      );
  end if;
end
$function$
;

-- ---------------------------------------------------------------
-- 5) Yetkiler
--
-- `create or replace` mevcut yetkileri korur; yine de açıkça
-- yazılıyor: Postgres YENİ bir fonksiyonu PUBLIC'e açık oluşturuyor
-- ve bu depoda bir fonksiyon taşınırken revoke satırları kaybolduğu
-- için siparişi "ödendi" yapan fonksiyon saatlerce herkese açık kaldı
-- (ArvoARC, 19.09.2026). Liste canlı dökümdeki hâliyle aynı.
-- ---------------------------------------------------------------
revoke all on function public.sign_crm_contract(public_token text, signer_name text, signer_ip text, signer_user_agent text) from public;
grant execute on function public.sign_crm_contract(public_token text, signer_name text, signer_ip text, signer_user_agent text) to service_role;

revoke all on function public.collect_payment_installment(target_installment_id uuid) from public;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to public;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to service_role;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to authenticated;
grant execute on function public.collect_payment_installment(target_installment_id uuid) to anon;

revoke all on function private.arvo_reconcile_party_installments(p_organization_id uuid, p_party_id uuid, p_dry_run boolean) from public;

-- ---------------------------------------------------------------
-- 6) Takılı kalmış kayıtların onarımı
--
-- SATIR SİLİNMİYOR: `finance_transactions.id` iki tablodan
-- işaret alıyor (crm_contracts.service_cost_transaction_id,
-- hr_commission_payments.finance_transaction_id). İkisi de gider
-- satırlarına bakıyor ama silme yerine GÜNCELLEME + EKLEME yapmak
-- hiçbir kimliği kaybetmiyor.
--
-- Eski satırların taksitle bağı yok; tek ipucu notlardaki sözleşme
-- numarası ("Sözleşme SOZ-… üzerinden otomatik oluşturuldu."). Yeni
-- satırlar bu kalıbı kullanmıyor, yani onarım kendi yazdıklarına
-- ikinci kez dokunmuyor.
-- ---------------------------------------------------------------

-- 6a) Var olan satırı sözleşmenin İLK taksidine bağla
with hedef as (
  select ft.id as ft_id,
         c.party_id as cari,
         (select i.id
            from public.payment_installments i
            join public.payment_plans p on p.id = i.payment_plan_id
           where p.contract_id = c.id and i.amount > 0
           order by i.installment_no
           limit 1) as taksit_id
  from public.finance_transactions ft
  join public.crm_contracts c
    on c.organization_id = ft.organization_id
   and c.contract_no = substring(ft.notes from 'Sözleşme ([^ ]+) üzerinden')
  where ft.transaction_type = 'income'
    and ft.status = 'planned'
    and ft.payment_installment_id is null
)
update public.finance_transactions ft
set payment_installment_id = h.taksit_id,
    amount    = i.amount,
    due_date  = i.due_date,
    party_id  = coalesce(ft.party_id, h.cari),
    notes     = ft.notes || ' · ' || i.installment_no || '. taksit',
    updated_at = now()
from hedef h
join public.payment_installments i on i.id = h.taksit_id
where ft.id = h.ft_id and h.taksit_id is not null;

-- 6b) Kalan taksitler için satır aç (yalnızca geliri ZATEN olan sözleşmelere)
--     Sözleşme imzalanmış ama hiç gelir satırı yoksa UYDURULMUYOR.
insert into public.finance_transactions(
  organization_id, transaction_type, status, title,
  counterparty, category, amount, currency,
  due_date, notes, created_by, party_id, payment_installment_id
)
select
  mevcut.organization_id, 'income', 'planned', mevcut.title,
  mevcut.counterparty, mevcut.category, i.amount, mevcut.currency,
  i.due_date,
  'Sözleşme ' || c.contract_no || ' · ' || i.installment_no || '. taksit',
  mevcut.created_by, coalesce(mevcut.party_id, c.party_id), i.id
from public.payment_installments i
join public.payment_plans p on p.id = i.payment_plan_id
join public.crm_contracts c on c.id = p.contract_id
join public.finance_transactions mevcut
  on mevcut.payment_installment_id = (
       select i2.id from public.payment_installments i2
        where i2.payment_plan_id = p.id and i2.amount > 0
        order by i2.installment_no limit 1)
 and mevcut.transaction_type = 'income'
where i.amount > 0
  and not exists (
    select 1 from public.finance_transactions v
     where v.payment_installment_id = i.id and v.transaction_type = 'income'
  );

-- 6c) Taksidi ödenmiş olan gelir satırlarını kapat
update public.finance_transactions ft
set status = 'paid',
    paid_at = coalesce(ft.paid_at, i.paid_at, now()),
    updated_at = now()
from public.payment_installments i
where ft.payment_installment_id = i.id
  and ft.transaction_type = 'income'
  and ft.status = 'planned'
  and i.status = 'paid';

-- 6d) Bir taksidin EN ÇOK BİR gelir satırı olur
--
--     Dizin onarımdan SONRA kuruluyor: önceden çift kayıt varsa bu
--     satır hata verir ve sebebi görünür. Sessizce ikinci bir satıra
--     izin vermek, aynı parayı iki kez gelir saymanın yolu olurdu.
create unique index if not exists finance_transactions_installment_gelir_uq
  on public.finance_transactions (payment_installment_id)
  where payment_installment_id is not null and transaction_type = 'income';
