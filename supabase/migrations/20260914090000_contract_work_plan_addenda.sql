-- Sözleşmeye iş planı (ara teslim takvimi), taksitlere net vade tarihi ve
-- imzalı sözleşme için ek protokol.
--
-- Sorun: Sözleşmenin 4.3 maddesi "ara teslimler ve iş planı Taraflar'ın
-- yazılı mutabakatıyla belirlenebilir" diyor ama panelde bu takvimi yazacak
-- yer yoktu; 3'lü ödeme planında "Ara Ödeme"nin ne tarihi ne koşulu vardı.
-- Müşteri net tarih istediğinde (ör. "ara teslim ve ara ödeme tarihleri
-- net olsun") verilecek kayıtlı bir belge yoktu.
--
-- 1) crm_contracts.work_plan: imza öncesi sözleşmeye ara teslim takvimi
--    yazılır; belgede madde 4.3'te tablo olarak gösterilir, imzayla donar.
-- 2) crm_contract_addenda: imzalı sözleşmede takvim ve taksit vadeleri
--    "Ek Protokol" olarak müşteriye sunulur. Müşteri sözleşme bağlantısından
--    onaylar (ad soyad, tarih-saat, IP, cihaz kaydıyla) ya da gerekçesini
--    yazarak değişiklik ister. Onaylanınca ilgili taksitlerin vadesi finans
--    kaydında (payment_installments) güncellenir. Panel ek protokolü yalnızca
--    bu dosyadaki fonksiyonlarla oluşturur/geri çeker; tabloya doğrudan
--    yazma yetkisi yoktur.
-- 3) Sözleşmenin ödeme planında vade tarihi girilmiş taksitlerin finans
--    kaydı imzada bu tarihle eşitlenir (imza fonksiyonuna dokunulmaz; canlı
--    tanımı repodan ayrışabilir).
-- 4) Takip sayfası için takip koduyla çalışan salt-okur özet.
--
-- Mevcut arvo_freeze_signed_contract tetikleyicisine dokunulmaz; work_plan
-- için ayrı bir dondurma tetikleyicisi eklenir.
-- Tekrar çalıştırılabilir.

-- ---------------------------------------------------------------
-- Yardımcılar
-- ---------------------------------------------------------------

-- Yalnızca YYYY-AA-GG biçimindeki geçerli tarihi döndürür; aksi halde null.
create or replace function private.arvo_try_date(p_value text)
returns date
language plpgsql
immutable
set search_path to ''
as $function$
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_value::date;
exception when others then
  return null;
end
$function$;

-- İş planını doğrular ve tarihe göre sıralı, sıra numaralı hale getirir:
-- [{"sequence":1,"title":"...","due_date":"2026-10-01"}, ...]
create or replace function private.arvo_normalize_work_plan(p_plan jsonb)
returns jsonb
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v_item jsonb;
  v_title text;
  v_date date;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) = 'null' then
    return '[]'::jsonb;
  end if;
  if jsonb_typeof(p_plan) <> 'array' then
    raise exception 'invalid_work_plan' using errcode = 'check_violation';
  end if;
  if jsonb_array_length(p_plan) > 20 then
    raise exception 'work_plan_too_long' using errcode = 'check_violation';
  end if;

  for v_item in select value from jsonb_array_elements(p_plan) loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'invalid_work_plan' using errcode = 'check_violation';
    end if;
    v_title := btrim(regexp_replace(coalesce(v_item->>'title', ''), '\s+', ' ', 'g'));
    if char_length(v_title) < 2 or char_length(v_title) > 200 then
      raise exception 'invalid_work_plan_title' using errcode = 'check_violation';
    end if;
    v_date := private.arvo_try_date(v_item->>'due_date');
    if v_date is null then
      raise exception 'invalid_work_plan_date' using errcode = 'check_violation';
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('title', v_title, 'due_date', to_char(v_date, 'YYYY-MM-DD')));
  end loop;

  return coalesce((
    select jsonb_agg(s.elem || jsonb_build_object('sequence', s.ord) order by s.ord)
    from (
      select t.elem, row_number() over (order by t.elem->>'due_date', t.idx) as ord
      from jsonb_array_elements(v_rows) with ordinality as t(elem, idx)
    ) s
  ), '[]'::jsonb);
end
$function$;

revoke all on function private.arvo_try_date(text) from public, anon;
revoke all on function private.arvo_normalize_work_plan(jsonb) from public, anon;

-- ---------------------------------------------------------------
-- 1) Sözleşmenin iş planı
-- ---------------------------------------------------------------
alter table public.crm_contracts
  add column if not exists work_plan jsonb;

create or replace function private.arvo_normalize_contract_work_plan()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan jsonb;
begin
  v_plan := private.arvo_normalize_work_plan(new.work_plan);
  new.work_plan := case when jsonb_array_length(v_plan) = 0 then null else v_plan end;
  return new;
end
$function$;

drop trigger if exists arvo_normalize_contract_work_plan on public.crm_contracts;
create trigger arvo_normalize_contract_work_plan
  before insert or update of work_plan on public.crm_contracts
  for each row execute function private.arvo_normalize_contract_work_plan();

-- İmzalı sözleşmenin iş planı değişmez; değişiklik ek protokolle yapılır.
create or replace function private.arvo_freeze_signed_work_plan()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.status in ('signed', 'completed') and new.work_plan is distinct from old.work_plan then
    raise exception
      'Bu sözleşme imzalandı; iş planı değiştirilemez. Değişiklik için ek protokol oluşturun.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$function$;

drop trigger if exists arvo_freeze_signed_work_plan on public.crm_contracts;
create trigger arvo_freeze_signed_work_plan
  before update of work_plan on public.crm_contracts
  for each row execute function private.arvo_freeze_signed_work_plan();

-- ---------------------------------------------------------------
-- 2) Ek protokoller
-- ---------------------------------------------------------------
create table if not exists public.crm_contract_addenda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contract_id uuid not null references public.crm_contracts(id) on delete cascade,
  opportunity_id uuid not null references public.crm_opportunities(id) on delete cascade,
  addendum_no integer not null check (addendum_no > 0),
  work_plan jsonb not null default '[]'::jsonb check (jsonb_typeof(work_plan) = 'array'),
  payment_dates jsonb not null default '[]'::jsonb check (jsonb_typeof(payment_dates) = 'array'),
  note text check (note is null or char_length(note) <= 2000),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'rejected', 'cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  responder_name text,
  responder_ip text,
  responder_user_agent text,
  response_note text,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  unique (contract_id, addendum_no)
);

create index if not exists crm_contract_addenda_org_idx on public.crm_contract_addenda(organization_id);
create index if not exists crm_contract_addenda_opportunity_idx on public.crm_contract_addenda(opportunity_id);
-- Aynı sözleşmede aynı anda yalnızca bir ek protokol onay bekleyebilir.
create unique index if not exists crm_contract_addenda_one_pending
  on public.crm_contract_addenda(contract_id) where status = 'sent';

alter table public.crm_contract_addenda enable row level security;
revoke all on public.crm_contract_addenda from anon, authenticated;
grant select on public.crm_contract_addenda to authenticated;

drop policy if exists "members read contract addenda" on public.crm_contract_addenda;
create policy "members read contract addenda" on public.crm_contract_addenda
  for select to authenticated
  using (private.arvo_can_access_opportunity(opportunity_id));

-- Sonuçlanmış ek protokol değişmez; içerik hiçbir durumda değişmez.
create or replace function private.arvo_guard_contract_addendum()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.organization_id is distinct from old.organization_id
  or new.contract_id     is distinct from old.contract_id
  or new.opportunity_id  is distinct from old.opportunity_id
  or new.addendum_no     is distinct from old.addendum_no
  or new.work_plan       is distinct from old.work_plan
  or new.payment_dates   is distinct from old.payment_dates
  or new.note            is distinct from old.note
  or new.created_by      is distinct from old.created_by
  or new.created_at      is distinct from old.created_at
  then
    raise exception 'Ek protokolün içeriği değiştirilemez; yeni bir ek protokol oluşturun.'
      using errcode = 'check_violation';
  end if;

  if old.status <> 'sent' and new is distinct from old then
    raise exception 'Bu ek protokol sonuçlandı; değiştirilemez.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$;

drop trigger if exists arvo_guard_contract_addendum on public.crm_contract_addenda;
create trigger arvo_guard_contract_addendum
  before update on public.crm_contract_addenda
  for each row execute function private.arvo_guard_contract_addendum();

-- Panel: ek protokol oluşturur ve müşterinin onayına sunar (status 'sent').
-- p_payment_dates: [{"sequence":2,"due_date":"2026-10-15"}] — yalnızca
-- ödenmemiş taksitlerin vadesi değiştirilebilir; tutarlar değişmez.
create or replace function public.arvo_create_contract_addendum(
  p_contract_id uuid,
  p_work_plan jsonb,
  p_payment_dates jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  c public.crm_contracts%rowtype;
  v_plan jsonb;
  v_dates jsonb := '[]'::jsonb;
  v_item jsonb;
  v_seq integer;
  v_date date;
  v_status text;
  v_no integer;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into c from public.crm_contracts where id = p_contract_id for update;
  if c.id is null or not private.arvo_can_access_opportunity(c.opportunity_id) then
    raise exception 'contract_not_found' using errcode = 'P0002';
  end if;
  if c.status not in ('signed', 'completed') then
    raise exception 'contract_not_signed' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.crm_contract_addenda a where a.contract_id = c.id and a.status = 'sent') then
    raise exception 'addendum_pending' using errcode = 'check_violation';
  end if;

  v_plan := private.arvo_normalize_work_plan(p_work_plan);

  if p_payment_dates is not null and jsonb_typeof(p_payment_dates) not in ('array', 'null') then
    raise exception 'invalid_payment_date' using errcode = 'check_violation';
  end if;
  if p_payment_dates is not null and jsonb_typeof(p_payment_dates) = 'array' then
    if jsonb_array_length(p_payment_dates) > 24 then
      raise exception 'invalid_payment_date' using errcode = 'check_violation';
    end if;
    for v_item in select value from jsonb_array_elements(p_payment_dates) loop
      if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'sequence', '') !~ '^\d{1,3}$' then
        raise exception 'invalid_payment_date' using errcode = 'check_violation';
      end if;
      v_seq := (v_item->>'sequence')::integer;
      v_date := private.arvo_try_date(v_item->>'due_date');
      if v_date is null then
        raise exception 'invalid_payment_date' using errcode = 'check_violation';
      end if;
      if c.payment_plan_id is null then
        raise exception 'unknown_installment' using errcode = 'check_violation';
      end if;
      select i.status into v_status
      from public.payment_installments i
      where i.payment_plan_id = c.payment_plan_id and i.installment_no = v_seq
      limit 1;
      if not found then
        raise exception 'unknown_installment' using errcode = 'check_violation';
      end if;
      if coalesce(v_status, '') in ('paid', 'cancelled') then
        raise exception 'installment_closed' using errcode = 'check_violation';
      end if;
      if exists (select 1 from jsonb_array_elements(v_dates) d where (d->>'sequence')::integer = v_seq) then
        raise exception 'duplicate_installment' using errcode = 'check_violation';
      end if;
      v_dates := v_dates || jsonb_build_array(jsonb_build_object('sequence', v_seq, 'due_date', to_char(v_date, 'YYYY-MM-DD')));
    end loop;
  end if;

  if jsonb_array_length(v_plan) = 0 and jsonb_array_length(v_dates) = 0 then
    raise exception 'addendum_empty' using errcode = 'check_violation';
  end if;

  select coalesce(max(a.addendum_no), 0) + 1 into v_no
  from public.crm_contract_addenda a
  where a.contract_id = c.id;

  insert into public.crm_contract_addenda(
    organization_id, contract_id, opportunity_id, addendum_no,
    work_plan, payment_dates, note, status, created_by
  ) values (
    c.organization_id, c.id, c.opportunity_id, v_no,
    v_plan,
    (select coalesce(jsonb_agg(d order by (d->>'sequence')::integer), '[]'::jsonb) from jsonb_array_elements(v_dates) d),
    nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
    'sent',
    v_uid
  ) returning id into v_id;

  return v_id;
end
$function$;

-- Panel: onay bekleyen ek protokolü geri çeker.
create or replace function public.arvo_cancel_contract_addendum(p_addendum_id uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := auth.uid();
  a public.crm_contract_addenda%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select * into a from public.crm_contract_addenda where id = p_addendum_id for update;
  if a.id is null or not private.arvo_can_access_opportunity(a.opportunity_id) then
    raise exception 'addendum_not_found' using errcode = 'P0002';
  end if;
  if a.status <> 'sent' then
    return a.status;
  end if;
  update public.crm_contract_addenda
     set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
   where id = a.id;
  return 'cancelled';
end
$function$;

-- Herkese açık sözleşme sayfası: iş planı + gönderilmiş ek protokoller.
create or replace function public.arvo_public_contract_plan(public_token text)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select jsonb_build_object(
    'work_plan', coalesce(c.work_plan, '[]'::jsonb),
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

-- Müşteri: ek protokolü onaylar ('accept') ya da değişiklik ister ('reject').
-- Dönüş: accepted | rejected | closed | missing_name | missing_note
create or replace function public.arvo_respond_contract_addendum(
  public_token text,
  p_addendum_id uuid,
  p_decision text,
  p_name text,
  p_note text default null,
  p_ip text default null,
  p_user_agent text default null
)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  c public.crm_contracts%rowtype;
  a public.crm_contract_addenda%rowtype;
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 180);
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
  v_status text;
begin
  if coalesce(p_decision, '') not in ('accept', 'reject') then
    raise exception 'invalid_decision' using errcode = 'check_violation';
  end if;

  select * into c
  from public.crm_contracts
  where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  if c.id is null then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  select * into a
  from public.crm_contract_addenda
  where id = p_addendum_id and contract_id = c.id
  for update;
  if a.id is null then
    raise exception 'addendum_not_found' using errcode = 'P0002';
  end if;
  if a.status <> 'sent' then
    return 'closed';
  end if;
  if char_length(v_name) < 2 then
    return 'missing_name';
  end if;
  if p_decision = 'reject' and char_length(coalesce(v_note, '')) < 3 then
    return 'missing_note';
  end if;

  v_status := case p_decision when 'accept' then 'accepted' else 'rejected' end;

  update public.crm_contract_addenda
     set status = v_status,
         responded_at = now(),
         responder_name = v_name,
         responder_ip = nullif(left(btrim(coalesce(p_ip, '')), 120), ''),
         responder_user_agent = nullif(left(btrim(coalesce(p_user_agent, '')), 1000), ''),
         response_note = v_note
   where id = a.id;

  -- Onaylanan vadeler finans kaydına işlenir (ödenmiş taksite dokunulmaz).
  if v_status = 'accepted' and c.payment_plan_id is not null then
    update public.payment_installments i
       set due_date = d.due_on
      from (
        select (x->>'sequence')::integer as seq, private.arvo_try_date(x->>'due_date') as due_on
        from jsonb_array_elements(a.payment_dates) x
      ) d
     where i.payment_plan_id = c.payment_plan_id
       and i.installment_no = d.seq
       and d.due_on is not null
       and coalesce(i.status, '') not in ('paid', 'cancelled');
  end if;

  -- Satış ekibine bildirim: aktif owner/admin/manager ve ek protokolü hazırlayan kişi.
  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct on (m.user_id)
    c.organization_id,
    m.user_id,
    'organization',
    case v_status when 'accepted' then 'contract_addendum_accepted' else 'contract_addendum_rejected' end,
    case v_status when 'accepted' then 'Ek protokol onaylandı' else 'Ek protokolde değişiklik istendi' end,
    coalesce(c.contract_no, 'Sözleşme') || ' Ek Protokol ' || a.addendum_no
      || case v_status when 'accepted' then ' müşteri tarafından onaylandı.' else ' için müşteri değişiklik istedi.' end,
    '/panel/crm/contracts/' || c.id::text,
    jsonb_build_object(
      'contract_id', c.id,
      'addendum_id', a.id,
      'addendum_no', a.addendum_no,
      'contract_no', c.contract_no,
      'responder_name', v_name,
      'note', v_note
    )
  from public.organization_memberships m
  where m.organization_id = c.organization_id
    and m.is_active
    and (m.role::text in ('owner', 'admin', 'manager') or m.user_id = a.created_by);

  return v_status;
end
$function$;

-- ---------------------------------------------------------------
-- 3) İmzada taksit vadelerini sözleşmedeki tarihlerle eşitle
-- ---------------------------------------------------------------
create or replace function private.arvo_sync_installment_due_dates()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_schedule jsonb;
begin
  v_schedule := coalesce(
    new.payment_schedule,
    (select p.payment_schedule from public.crm_proposals p where p.id = new.proposal_id)
  );
  if v_schedule is null or jsonb_typeof(v_schedule) <> 'array' then
    return new;
  end if;

  update public.payment_installments i
     set due_date = s.due_on
    from (
      select (x->>'sequence')::integer as seq, private.arvo_try_date(x->>'due_date') as due_on
      from jsonb_array_elements(v_schedule) x
      where jsonb_typeof(x) = 'object' and coalesce(x->>'sequence', '') ~ '^\d{1,3}$'
    ) s
   where i.payment_plan_id = new.payment_plan_id
     and i.installment_no = s.seq
     and s.due_on is not null
     and coalesce(i.status, '') not in ('paid', 'cancelled')
     and i.due_date is distinct from s.due_on;

  return new;
end
$function$;

drop trigger if exists arvo_sync_installment_due_dates on public.crm_contracts;
create trigger arvo_sync_installment_due_dates
  after update of payment_plan_id on public.crm_contracts
  for each row
  when (new.payment_plan_id is not null and new.payment_plan_id is distinct from old.payment_plan_id)
  execute function private.arvo_sync_installment_due_dates();

-- ---------------------------------------------------------------
-- 4) Takip sayfası özeti
-- ---------------------------------------------------------------
-- Dönüş: {"work_plan":[...], "source":"contract"|"addendum",
--         "payments":[{"sequence","label","amount","due_date","trigger","status"}],
--         "pending_addendum":bool}  — kod eşleşmezse null.
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

-- ---------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------
revoke all on function public.arvo_create_contract_addendum(uuid, jsonb, jsonb, text) from public, anon;
revoke all on function public.arvo_cancel_contract_addendum(uuid) from public, anon;
revoke all on function public.arvo_public_contract_plan(text) from public;
revoke all on function public.arvo_respond_contract_addendum(text, uuid, text, text, text, text, text) from public;
revoke all on function public.arvo_tracking_work_plan(text) from public;

grant execute on function public.arvo_create_contract_addendum(uuid, jsonb, jsonb, text) to authenticated;
grant execute on function public.arvo_cancel_contract_addendum(uuid) to authenticated;
grant execute on function public.arvo_public_contract_plan(text) to anon, authenticated;
grant execute on function public.arvo_respond_contract_addendum(text, uuid, text, text, text, text, text) to anon, authenticated;
grant execute on function public.arvo_tracking_work_plan(text) to anon, authenticated;
