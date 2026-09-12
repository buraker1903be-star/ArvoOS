-- CRM: Müşteri sorgulama ve müşterinin tüm geçmişi.
--
-- Neden: Talep formundaki "geri dönen müşteri" uyarısı ve yeni "Müşteri
-- sorgula" penceresi kullanıcının kendi oturumuyla (RLS) çalışıyordu.
-- Satış personeli RLS gereği yalnızca kendisine atanmış kayıtları görüyor;
-- başka temsilcinin çalıştığı müşteri, kendi kabul / red edilmiş teklifleri
-- ve operasyon işleri gizli kalıyordu. Kurum kararı: talep girebilen her CRM
-- kullanıcısı müşterinin TÜM geçmişini görebilmeli.
--
-- Çözüm: iki SECURITY DEFINER fonksiyon. Tablo RLS'i değişmez; geçmiş
-- yalnızca bu fonksiyonlardan, sınırlı sütunlarla (başlık, tutar, durum,
-- tarih, temsilci) okunur. Kayıt ayrıntısını açabilme ("can_open") yine
-- mevcut RLS kuralıyla aynı hesaplanır; arayüz açamayacağı kaydı bağlantı
-- olarak göstermez.
--
--   crm_customer_search(org, sorgu, limit)
--     Telefon (en az 4 rakam; ön ek / parça) ya da ad soyad (Türkçe harf ve
--     aksan duyarsız; tüm kelimeler, kelime başı, tek harf hatalı "benzer")
--     ile müşterileri bulur. Müşteri = aynı telefon (son 10 hane); telefonu
--     olmayan kayıtlar aynı adla tek bir telefona bağlanabiliyorsa oraya,
--     yoksa ada göre gruplanır.
--
--   crm_customer_history(org, müşteri anahtarı | telefon + ad, hariç talep, limit)
--     Bir müşterinin talepleri, tekliflerinin güncel revizyonu, sözleşmeleri
--     ve operasyon işleri (arşivdekiler dahil).
--
-- Yetki (lib/panel-context.ts + lib/role-permissions.ts ile aynı kural):
--   * auth.uid() kurumun aktif üyesi ve kurum aktif (get_my_workspaces),
--   * kurumda CRM modülü açık (organization_modules.is_enabled),
--   * rol owner değilse role_module_permissions'ta crm için can_access=false
--     satırı yok.
--   Koşul sağlanmazsa fonksiyon boş döner (hata vermez, bilgi sızdırmaz).
--
-- pg_trgm bu projede açık değil; yeni eklenti eklenmedi. Benzerlik, kelime
-- içerme + tek harf farkı (ekleme / silme / değiştirme) ile hesaplanır.
--
-- Tekrar çalıştırılabilir (idempotent).

create schema if not exists private;

-- 1) Anahtar yardımcıları ---------------------------------------------------

-- Yalnızca rakamlar; 10 haneden uzunsa son 10 hane (+90 / 0 atılır).
-- İstemcideki phoneKey (customer-history-keys.ts) ile aynı kural.
create or replace function private.arvo_phone_key(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when length(s.d) > 10 then right(s.d, 10) else s.d end
  from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as d) s
$$;

-- Türkçe duyarsız, aksansız, tek boşluklu ad anahtarı ("IŞIK Çağlar" -> "isik caglar").
-- translate lower'dan ÖNCE: lower('I') Türkçe'de 'ı' olmalı ama Postgres 'i'
-- verir; İ ise yerel ayara göre 'i̇' (i + U+0307) olabiliyor. chr(775)
-- (birleşik nokta) karşılıksız olduğu için silinir.
create or replace function private.arvo_name_key(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(
    lower(translate(
      coalesce(value, ''),
      'İIıŞşĞğÜüÖöÇçÂâÎîÛûÊêÉéÀàÁá' || chr(775),
      'iiissgguuooccaaiiuueeeeaaaa'
    )),
    '[^[:alnum:]]+', ' ', 'g'
  ))
$$;

-- Aranan telefon parçası: "+90 532", "0090532" -> "532"; "05324628098" -> "5324628098".
create or replace function private.arvo_search_digits(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ltrim(
    case
      when btrim(coalesce(value, '')) ~ '^(\+|00)[[:space:]]*9[[:space:]]*0' then regexp_replace(s.d, '^(00)?90', '')
      when length(s.d) > 10 then right(s.d, 10)
      else s.d
    end, '0')
  from (select regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g') as d) s
$$;

-- a ile b arasında en fazla bir düzenleme (ekleme / silme / değiştirme) var mı? O(n).
create or replace function private.arvo_within_one_edit(a text, b text)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  la integer := length(a);
  lb integer := length(b);
  i integer := 1;
  j integer := 1;
  edits integer := 0;
begin
  if abs(la - lb) > 1 then
    return false;
  end if;
  while i <= la and j <= lb loop
    if substr(a, i, 1) = substr(b, j, 1) then
      i := i + 1;
      j := j + 1;
    else
      edits := edits + 1;
      if edits > 1 then
        return false;
      end if;
      if la > lb then
        i := i + 1;
      elsif lb > la then
        j := j + 1;
      else
        i := i + 1;
        j := j + 1;
      end if;
    end if;
  end loop;
  return edits + (la - i + 1) + (lb - j + 1) <= 1;
end
$$;

-- 2) Yetki: CRM'e erişebilen aktif üyenin rolü, değilse null --------------
create or replace function private.arvo_crm_lookup_role(p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role::text
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  where m.organization_id = p_organization_id
    and m.user_id = (select auth.uid())
    and m.is_active = true
    and exists (
      select 1 from public.organization_modules om
      where om.organization_id = p_organization_id
        and om.module_code = 'crm'
        and om.is_enabled = true
    )
    and (
      m.role::text = 'owner'
      or not exists (
        select 1 from public.role_module_permissions rp
        where rp.organization_id = p_organization_id
          and rp.role = m.role::text
          and rp.module_key = 'crm'
          and rp.can_access = false
      )
    )
  limit 1
$$;

-- 3) Müşteri birimleri: kurumdaki her talep ve talebe bağlı olmayan her iş,
--    ortak müşteri anahtarıyla ("p:<10 hane>" ya da "n:<ad anahtarı>").
--    Yalnızca aşağıdaki SECURITY DEFINER fonksiyonlar çağırır.
drop function if exists private.arvo_crm_customer_units(uuid);
create function private.arvo_crm_customer_units(p_organization_id uuid)
returns table (
  unit_kind text,
  unit_id uuid,
  phone_key text,
  name_key text,
  customer_key text,
  customer_name text,
  contact_phone text,
  contact_email text,
  at timestamptz
)
language sql
stable
set search_path = ''
as $$
  with opp as (
    select o.id, o.customer_name, o.contact_phone, o.contact_email,
      greatest(o.created_at, coalesce(o.updated_at, o.created_at)) as at,
      private.arvo_phone_key(o.contact_phone) as pk,
      private.arvo_name_key(o.customer_name) as nk
    from public.crm_opportunities o
    where o.organization_id = p_organization_id
  ),
  -- Adı tek bir telefona bağlanan müşteriler: telefonsuz kayıtları oraya kat
  phone_names as (
    select nk, min(pk) as pk
    from opp
    where length(pk) >= 7 and nk <> ''
    group by nk
    having count(distinct pk) = 1
  ),
  linked_workflows as (
    select distinct w.id
    from public.operation_workflows w
    join public.crm_contracts c on c.organization_id = w.organization_id
      and (c.id = w.contract_id or c.workflow_id = w.id)
    where w.organization_id = p_organization_id
  ),
  orphan as (
    select w.id, w.customer_name,
      coalesce(w.updated_at, w.created_at) as at,
      private.arvo_name_key(w.customer_name) as nk
    from public.operation_workflows w
    where w.organization_id = p_organization_id
      and not exists (select 1 from linked_workflows l where l.id = w.id)
  )
  select 'opportunity'::text, o.id, o.pk, o.nk,
    case
      when length(o.pk) >= 7 then 'p:' || o.pk
      when pn.pk is not null then 'p:' || pn.pk
      else 'n:' || o.nk
    end,
    o.customer_name, o.contact_phone, o.contact_email, o.at
  from opp o
  left join phone_names pn on pn.nk = o.nk and length(o.pk) < 7
  union all
  select 'workflow'::text, w.id, ''::text, w.nk,
    case when pn.pk is not null then 'p:' || pn.pk else 'n:' || w.nk end,
    w.customer_name, null::text, null::text, w.at
  from orphan w
  left join phone_names pn on pn.nk = w.nk
  where w.nk <> ''
$$;

-- 4) Müşteri arama ---------------------------------------------------------
drop function if exists public.crm_customer_search(uuid, text, integer);
create function public.crm_customer_search(
  p_organization_id uuid,
  p_query text,
  p_limit integer default 12
)
returns table (
  customer_key text,
  display_name text,
  phone text,
  email text,
  match_kind text,
  score integer,
  request_count integer,
  proposal_count integer,
  contract_count integer,
  job_count integer,
  archived_job_count integer,
  proposed_totals jsonb,
  contract_totals jsonb,
  last_contact_at timestamptz,
  rep_names text[]
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_raw text := btrim(left(coalesce(p_query, ''), 120));
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 25);
  v_phone_mode boolean;
  v_digits text := '';
  v_name text := '';
  v_tokens text[] := '{}';
begin
  if private.arvo_crm_lookup_role(p_organization_id) is null then
    return;
  end if;

  -- Harf içermeyen sorgu telefon sayılır ("+90 (532) 462-80.98")
  v_phone_mode := regexp_replace(v_raw, '[0-9[:space:]+()./-]', '', 'g') = '';
  if v_phone_mode then
    v_digits := private.arvo_search_digits(v_raw);
    if length(regexp_replace(v_raw, '[^0-9]', '', 'g')) < 4 or length(v_digits) < 3 then
      return;
    end if;
  else
    v_name := private.arvo_name_key(v_raw);
    if length(replace(v_name, ' ', '')) < 2 then
      return;
    end if;
    v_tokens := string_to_array(v_name, ' ');
  end if;

  return query
  with units as (
    select * from private.arvo_crm_customer_units(p_organization_id)
  ),
  scored as (
    select u.customer_key as ck, u.at as at,
      case
        when v_phone_mode then
          case
            when length(u.phone_key) < 7 then null
            when u.phone_key = v_digits then 100
            when u.phone_key like v_digits || '%' then 85
            when strpos(u.phone_key, v_digits) > 0 then 60
          end
        when u.name_key = '' then null
        when u.name_key = v_name then 100
        when u.name_key like v_name || '%' then 90
        -- tüm kelimeler bir kelimenin başında ("cag isi" -> "isik caglar")
        when (select bool_and(strpos(' ' || u.name_key, ' ' || t) > 0) from unnest(v_tokens) t) then 80
        when (select bool_and(strpos(u.name_key, t) > 0) from unnest(v_tokens) t) then 65
        -- benzer: her kelime ya geçiyor ya da bir kelimeden tek harf farklı
        when (
          select bool_and(
            strpos(u.name_key, t) > 0
            or (length(t) >= 4 and exists (
              select 1 from unnest(string_to_array(u.name_key, ' ')) w
              where private.arvo_within_one_edit(t, w)
                 or (length(w) > length(t) and private.arvo_within_one_edit(t, left(w, length(t))))
            ))
          )
          from unnest(v_tokens) t
        ) then 45
        -- benzer: çok kelimeli aramada en az bir kelime tutuyor (ör. soyadı)
        when cardinality(v_tokens) > 1 and exists (
          select 1 from unnest(v_tokens) t
          where length(t) >= 3 and strpos(' ' || u.name_key, ' ' || t) > 0
        ) then 30
      end as s
    from units u
  ),
  best as (
    select sc.ck, max(sc.s)::integer as sc_score, max(sc.at) as last_unit_at
    from scored sc
    where sc.s is not null
    group by sc.ck
    order by max(sc.s) desc, max(sc.at) desc nulls last
    limit v_limit
  ),
  -- Özetler yalnızca seçilen müşterilerin birimleri üzerinden (tüm kurum
  -- birimleri her müşteri için yeniden taranmasın)
  grp as (
    select u.* from units u join best b on b.ck = u.customer_key
  )
  select
    b.ck,
    g.display_name,
    g.phone,
    g.email,
    case
      when v_phone_mode then case when b.sc_score = 100 then 'phone' else 'phone_partial' end
      when b.sc_score >= 90 then 'name'
      when b.sc_score >= 65 then 'name_partial'
      else 'similar'
    end,
    b.sc_score,
    g.request_count,
    p.proposal_count,
    c.contract_count,
    w.job_count,
    w.archived_job_count,
    p.totals,
    c.totals,
    -- Son temas: eşleşen birimler değil, müşterinin TÜM kayıtları
    greatest(g.last_at, p.last_at, c.last_at, w.last_at),
    r.names
  from best b
  cross join lateral (
    select
      (array_agg(u.customer_name order by (u.unit_kind = 'opportunity') desc, u.at desc nulls last))[1] as display_name,
      (array_agg(u.contact_phone order by u.at desc nulls last) filter (where coalesce(u.contact_phone, '') <> ''))[1] as phone,
      (array_agg(u.contact_email order by u.at desc nulls last) filter (where coalesce(u.contact_email, '') <> ''))[1] as email,
      (count(*) filter (where u.unit_kind = 'opportunity'))::integer as request_count,
      max(u.at) as last_at
    from grp u
    where u.customer_key = b.ck
  ) g
  cross join lateral (
    select coalesce(sum(x.n), 0)::integer as proposal_count,
      max(x.last_at) as last_at,
      jsonb_object_agg(x.cur, x.total) filter (where x.total <> 0) as totals
    from (
      select upper(coalesce(pr.currency::text, 'TRY')) as cur,
        count(*) as n,
        sum(coalesce(pr.amount, 0))::numeric as total,
        max(coalesce(pr.responded_at, pr.sent_at, pr.created_at)) as last_at
      from crm_proposals pr
      join grp u on u.unit_kind = 'opportunity' and u.unit_id = pr.opportunity_id and u.customer_key = b.ck
      where pr.organization_id = p_organization_id
        and pr.superseded_at is null
      group by 1
    ) x
  ) p
  cross join lateral (
    select coalesce(sum(x.n), 0)::integer as contract_count,
      max(x.last_at) as last_at,
      jsonb_object_agg(x.cur, x.total) filter (where x.total <> 0) as totals
    from (
      select upper(coalesce(ct.currency::text, 'TRY')) as cur,
        count(*) as n,
        sum(coalesce(ct.amount, 0))::numeric as total,
        max(coalesce(ct.signed_at, ct.created_at)) as last_at
      from crm_contracts ct
      join grp u on u.unit_kind = 'opportunity' and u.unit_id = ct.opportunity_id and u.customer_key = b.ck
      where ct.organization_id = p_organization_id
      group by 1
    ) x
  ) c
  cross join lateral (
    select count(*)::integer as job_count,
      (count(*) filter (where wf.status = 'archived'))::integer as archived_job_count,
      max(coalesce(wf.updated_at, wf.created_at)) as last_at
    from operation_workflows wf
    where wf.organization_id = p_organization_id
      and (
        exists (
          select 1 from grp u
          where u.customer_key = b.ck and u.unit_kind = 'workflow' and u.unit_id = wf.id
        )
        or exists (
          select 1
          from crm_contracts ct
          join grp u on u.unit_kind = 'opportunity' and u.unit_id = ct.opportunity_id and u.customer_key = b.ck
          where ct.organization_id = p_organization_id
            and (ct.id = wf.contract_id or ct.workflow_id = wf.id)
        )
      )
  ) w
  cross join lateral (
    select array_agg(x.full_name order by x.last_at desc) as names
    from (
      select e.full_name::text as full_name, max(o.created_at) as last_at
      from grp u
      join crm_opportunities o on o.id = u.unit_id
      join hr_employees e on e.id = o.assigned_employee_id
      where u.customer_key = b.ck and u.unit_kind = 'opportunity'
      group by e.full_name
      order by 2 desc
      limit 4
    ) x
  ) r
  order by 6 desc, 14 desc nulls last;
end
$$;

-- 5) Bir müşterinin geçmişi ------------------------------------------------
--    p_customer_key verilirse arama sonucundaki müşteri; verilmezse telefon
--    (son 10 hane, en az 7) VEYA ad soyad birebir eşleşmesi (talep formu).
drop function if exists public.crm_customer_history(uuid, text, text, text, uuid, integer);
create function public.crm_customer_history(
  p_organization_id uuid,
  p_customer_key text default null,
  p_phone text default null,
  p_name text default null,
  p_exclude_opportunity_id uuid default null,
  p_limit integer default 200
)
returns table (
  kind text,
  record_id uuid,
  opportunity_id uuid,
  title text,
  request_title text,
  service_type text,
  record_no text,
  customer_name text,
  amount numeric,
  currency text,
  status text,
  archive_reason text,
  happened_at timestamptz,
  sales_rep text,
  operator_name text,
  match_kind text,
  can_open boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_role text;
  v_privileged boolean;
  v_my_employees uuid[];
  v_key text := nullif(btrim(left(coalesce(p_customer_key, ''), 200)), '');
  v_key_phone text := '';
  v_phone text := '';
  v_name text := '';
  v_limit integer := least(greatest(coalesce(p_limit, 200), 1), 500);
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
begin
  v_role := private.arvo_crm_lookup_role(p_organization_id);
  if v_role is null then
    return;
  end if;
  v_privileged := v_role in ('owner', 'admin', 'manager');
  select coalesce(array_agg(e.id), '{}'::uuid[]) into v_my_employees
  from hr_employees e
  where e.organization_id = p_organization_id
    and e.user_id = auth.uid()
    and e.employment_status = 'active';

  if v_key is not null then
    if v_key !~ '^(p:[0-9]{7,10}|n:.+)$' then
      return;
    end if;
    if left(v_key, 2) = 'p:' then
      v_key_phone := substr(v_key, 3);
    end if;
  else
    v_phone := private.arvo_phone_key(p_phone);
    if length(v_phone) < 7 then
      v_phone := '';
    end if;
    v_name := private.arvo_name_key(p_name);
    if length(replace(v_name, ' ', '')) < 2 then
      v_name := '';
    end if;
    if v_phone = '' and v_name = '' then
      return;
    end if;
  end if;

  return query
  with units as (
    select * from private.arvo_crm_customer_units(p_organization_id)
  ),
  picked as (
    select u.unit_kind as uk, u.unit_id as uid,
      case
        when v_key is not null then
          case when v_key_phone <> '' and u.phone_key = v_key_phone then 'phone' else 'name' end
        when v_phone <> '' and u.phone_key = v_phone and v_name <> '' and u.name_key = v_name then 'both'
        when v_phone <> '' and u.phone_key = v_phone then 'phone'
        else 'name'
      end as m
    from units u
    where (
        case
          when v_key is not null then u.customer_key = v_key
          else (v_phone <> '' and u.phone_key = v_phone) or (v_name <> '' and u.name_key = v_name)
        end
      )
      and (p_exclude_opportunity_id is null or u.unit_id <> p_exclude_opportunity_id)
  ),
  opps as (
    select o.id as oid, o.title::text as otitle, o.customer_name::text as oname, o.stage::text as ostage,
      o.created_at as ocreated, o.request_details ->> 'service_type' as oservice,
      pk.m as om, e.full_name::text as orep,
      (v_privileged or coalesce(o.assigned_employee_id = any(v_my_employees), false)) as omine
    from picked pk
    join crm_opportunities o on o.id = pk.uid and o.organization_id = p_organization_id
    left join hr_employees e on e.id = o.assigned_employee_id
    where pk.uk = 'opportunity'
  ),
  props as (
    select pr.id as pid, pr.opportunity_id as poid, pr.proposal_no::text as pno, pr.title::text as ptitle,
      pr.amount::numeric as pamount, pr.currency::text as pcur, pr.status::text as pstatus,
      pr.archive_reason::text as preason, pr.valid_until as pvalid,
      coalesce(pr.responded_at, pr.sent_at, pr.created_at) as pat
    from crm_proposals pr
    join opps o on o.oid = pr.opportunity_id
    where pr.organization_id = p_organization_id
      and pr.superseded_at is null
  ),
  contr as (
    select ct.id as cid, ct.opportunity_id as coid, ct.contract_no::text as cno, ct.title::text as ctitle,
      ct.amount::numeric as camount, ct.currency::text as ccur, ct.status::text as cstatus,
      ct.workflow_id as cwf, coalesce(ct.signed_at, ct.created_at) as cat
    from crm_contracts ct
    join opps o on o.oid = ct.opportunity_id
    where ct.organization_id = p_organization_id
  ),
  jobs as (
    select distinct on (wf.id)
      wf.id as jid, wf.title::text as jtitle, wf.customer_name::text as jname, wf.status::text as jstatus,
      wf.assigned_employee_id as jemp, coalesce(wf.updated_at, wf.created_at) as jat,
      c.coid as joid, c.cno as jno, pk.m as jm
    from operation_workflows wf
    left join contr c on c.cid = wf.contract_id or c.cwf = wf.id
    left join picked pk on pk.uk = 'workflow' and pk.uid = wf.id
    where wf.organization_id = p_organization_id
      and (c.cid is not null or pk.uid is not null)
    order by wf.id, (c.cid = wf.contract_id) desc nulls last
  ),
  items as (
    select 'proposal'::text as k, p.pid as rid, p.poid as roid, p.ptitle as rtitle, o.otitle as rreq,
      o.oservice as rservice, p.pno as rno, o.oname as rname, p.pamount as ramount, p.pcur as rcur,
      p.pstatus as rstatus, p.preason as rreason, p.pat as rat, o.orep as rrep, null::text as rop,
      o.om as rm,
      (v_privileged or (o.omine and (
        p.pstatus = 'draft'
        or (p.pstatus = 'sent' and (p.pvalid is null or p.pvalid >= v_today))
        or (p.pstatus = 'archived' and p.preason = 'expired')
      ))) as ropen
    from props p
    join opps o on o.oid = p.poid
    union all
    select 'contract'::text, c.cid, c.coid, c.ctitle, o.otitle, o.oservice, c.cno, o.oname, c.camount, c.ccur,
      c.cstatus, null::text, c.cat, o.orep, null::text, o.om, o.omine
    from contr c
    join opps o on o.oid = c.coid
    union all
    select 'job'::text, j.jid, j.joid, j.jtitle, o.otitle, o.oservice, j.jno, coalesce(o.oname, j.jname),
      null::numeric, null::text, j.jstatus, null::text, j.jat, o.orep, op.full_name::text,
      coalesce(o.om, j.jm, 'name'),
      (v_privileged or coalesce(j.jemp = any(v_my_employees), false))
    from jobs j
    left join opps o on o.oid = j.joid
    left join hr_employees op on op.id = j.jemp
    union all
    -- Teklif / sözleşme verilmemiş talepler de "daha önce aradı" bilgisi
    select 'request'::text, o.oid, o.oid, o.otitle, o.otitle, o.oservice, null::text, o.oname, null::numeric,
      null::text, o.ostage, null::text, o.ocreated, o.orep, null::text, o.om, o.omine
    from opps o
    where not exists (select 1 from props p where p.poid = o.oid)
      and not exists (select 1 from contr c where c.coid = o.oid)
  )
  select i.k, i.rid, i.roid, i.rtitle, i.rreq, i.rservice, i.rno, i.rname, i.ramount, i.rcur,
    i.rstatus, i.rreason, i.rat, i.rrep, i.rop, i.rm, i.ropen
  from items i
  order by i.rat desc nulls last
  limit v_limit;
end
$$;

-- 6) Yetkiler ----------------------------------------------------------------
revoke all on function private.arvo_phone_key(text) from public, anon, authenticated;
revoke all on function private.arvo_name_key(text) from public, anon, authenticated;
revoke all on function private.arvo_search_digits(text) from public, anon, authenticated;
revoke all on function private.arvo_within_one_edit(text, text) from public, anon, authenticated;
revoke all on function private.arvo_crm_lookup_role(uuid) from public, anon, authenticated;
revoke all on function private.arvo_crm_customer_units(uuid) from public, anon, authenticated;

revoke all on function public.crm_customer_search(uuid, text, integer) from public, anon;
revoke all on function public.crm_customer_history(uuid, text, text, text, uuid, integer) from public, anon;
grant execute on function public.crm_customer_search(uuid, text, integer) to authenticated;
grant execute on function public.crm_customer_history(uuid, text, text, text, uuid, integer) to authenticated;

comment on function public.crm_customer_search(uuid, text, integer) is
  'CRM müşteri sorgulama: telefon / ad soyad ile müşteri grupları ve özetleri. CRM erişimi olan aktif üyelere açık.';
comment on function public.crm_customer_history(uuid, text, text, text, uuid, integer) is
  'CRM müşteri geçmişi: talep, teklif (güncel revizyon), sözleşme ve operasyon işleri (arşiv dahil). can_open RLS ile aynı hesaplanır.';
