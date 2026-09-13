-- arvo-os.com demo / iletişim formu → platform sahibinin CRM'inde yeni talep.
--
-- Akış:
--   Site formu (app/_site/lead-form.tsx) → sunucu eylemi
--   (app/_site/lead-actions.ts: bal küpü, form süresi, bağlantı sayısı,
--   IP'nin günlük tuzlu SHA-256 özeti) → public.submit_site_lead (bu dosya).
--
-- Talebi alan kurum: platform sahibi kurum. Uygulamadaki tanımla aynı
-- (lib/panel-context.ts isPlatformOwner ve private.is_arvoos_founder):
-- slug = 'arvo-os' olan aktif kurum. Kodda UUID yok. Kurum bulunamazsa
-- (veya aktif sahibi yoksa) fonksiyon 'not_configured' döner ve form
-- ziyaretçiye e-posta adresini gösterir; talep sessizce kaybolmaz.
-- Kontrol: select id, name from public.organizations where slug = 'arvo-os';
-- Farklı bir kurum kullanılacaksa o kurumun slug'ı 'arvo-os' olmalı
-- (kurucu yetkileri de aynı tanımı kullanır).
--
-- Talep panelde normal bir talep gibi görünür:
--   stage = 'lead' (createOpportunity ile aynı), olasılık kurumun 'lead'
--   aşamasından, source = 'Web sitesi (arvo-os.com)', başlık
--   "Web sitesi · ArvoOS demo talebi", mesaj request_details.scope'ta,
--   şirket / dil / sayfa / KVKK onayı notes ve request_details'te.
--   Temsilci atanmaz (created_by = kurumun ilk aktif sahibi, zorunlu sütun).
--
-- Bildirim: atama bildirimi (notify_crm_assignment) yalnızca temsilci
-- atanınca çalıştığı için burada kurumun aktif owner/admin/manager
-- üyelerine kişisel 'site_lead' bildirimi yazılır (panelde "Talepler"
-- başlığında, app/panel/notifications/describe.ts metni kurar).
--
-- Spam / kötüye kullanım:
--   * site_lead_attempts: IP özeti başına saatte 5 deneme, sitede saatte
--     50 kabul edilen talep. Aşılırsa 'rate_limited' (kayıt açılmaz).
--   * Aynı e-posta + ilgi alanı 10 dakika içinde tekrar gelirse yeni talep
--     açılmaz, önceki referans döner.
--   * Tablo RLS açık ve politikasız; yalnızca bu fonksiyon dokunur.
--     2 günden eski denemeler her çağrıda silinir (KVKK: veri azaltma;
--     ham IP hiç saklanmaz).
--
-- Tekrar çalıştırılabilir.

create table if not exists public.site_lead_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email_norm text,
  interest text,
  outcome text not null,
  reference text,
  opportunity_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists site_lead_attempts_ip_idx
  on public.site_lead_attempts (ip_hash, created_at desc);
create index if not exists site_lead_attempts_created_idx
  on public.site_lead_attempts (created_at desc);
create index if not exists site_lead_attempts_dedupe_idx
  on public.site_lead_attempts (email_norm, interest, created_at desc)
  where outcome = 'accepted';

alter table public.site_lead_attempts enable row level security;
revoke all on public.site_lead_attempts from public, anon, authenticated;

create or replace function public.submit_site_lead(
  p_name text,
  p_email text,
  p_phone text,
  p_company text,
  p_interest text,
  p_message text,
  p_locale text,
  p_page text,
  p_ip_hash text,
  p_consent boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_phone_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_company text := btrim(regexp_replace(coalesce(p_company, ''), '\s+', ' ', 'g'));
  v_interest text := lower(btrim(coalesce(p_interest, '')));
  v_message text := btrim(coalesce(p_message, ''));
  v_locale text := case when lower(coalesce(p_locale, '')) = 'en' then 'en' else 'tr' end;
  v_page text := left(btrim(coalesce(p_page, '')), 300);
  v_ip text := lower(btrim(coalesce(p_ip_hash, '')));
  v_org uuid;
  v_creator uuid;
  v_probability integer;
  v_previous text;
  v_reference text;
  v_opportunity uuid;
  v_title text;
  v_service text;
  v_now_local text := to_char(now() at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI');
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text := '';
  i integer;
begin
  -- Aynı anda gelen çağrılar sayaçları tutarlı görsün (düşük hacim).
  perform pg_advisory_xact_lock(hashtext('public.submit_site_lead'));

  if v_ip !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_request');
  end if;

  -- IP başına saatte 5 deneme (geçersiz denemeler dahil)
  if (select count(*) from public.site_lead_attempts a
      where a.ip_hash = v_ip and a.created_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  -- Site genelinde saatte 50 kabul edilen talep (çöp istekler gerçek
  -- ziyaretçileri kilitleyemesin diye yalnızca kabul edilenler sayılır)
  if (select count(*) from public.site_lead_attempts a
      where a.outcome = 'accepted' and a.created_at > now() - interval '1 hour') >= 50 then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;

  delete from public.site_lead_attempts where created_at < now() - interval '2 days';

  -- Doğrulama
  v_reference := case
    when p_consent is distinct from true then 'consent_required'
    when char_length(v_name) not between 2 and 120 then 'invalid_name'
    when v_interest not in ('arvoos', 'arvolab', 'arc', 'services', 'other') then 'invalid_interest'
    when v_email = '' and v_phone = '' then 'contact_required'
    when v_email <> '' and (char_length(v_email) > 200
      or v_email !~ '^[a-z0-9._%+''-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$') then 'invalid_email'
    when v_phone <> '' and (char_length(v_phone) > 40 or v_phone !~ '^[0-9 +().-]+$'
      or char_length(v_phone_digits) not between 7 and 20) then 'invalid_phone'
    when char_length(v_company) > 160 then 'invalid_company'
    when char_length(v_message) > 2000 then 'invalid_message'
    else null
  end;
  if v_reference is not null then
    insert into public.site_lead_attempts (ip_hash, interest, outcome)
    values (v_ip, left(v_interest, 20), v_reference);
    return jsonb_build_object('ok', false, 'code', v_reference);
  end if;

  -- Talebi alacak kurum: platform sahibi (slug 'arvo-os') ve ilk aktif sahibi
  select o.id into v_org
  from public.organizations o
  where o.slug = 'arvo-os' and o.is_active
  limit 1;
  if v_org is not null then
    select m.user_id into v_creator
    from public.organization_memberships m
    where m.organization_id = v_org and m.is_active and m.role::text = 'owner'
    order by m.created_at
    limit 1;
  end if;
  if v_org is null or v_creator is null then
    insert into public.site_lead_attempts (ip_hash, interest, outcome)
    values (v_ip, v_interest, 'not_configured');
    return jsonb_build_object('ok', false, 'code', 'not_configured');
  end if;

  -- Tekrar: aynı e-posta + ilgi alanı 10 dk içinde → önceki referans
  if v_email <> '' then
    select a.reference into v_previous
    from public.site_lead_attempts a
    where a.outcome = 'accepted' and a.email_norm = v_email and a.interest = v_interest
      and a.created_at > now() - interval '10 minutes'
    order by a.created_at desc
    limit 1;
    if v_previous is not null then
      insert into public.site_lead_attempts (ip_hash, email_norm, interest, outcome, reference)
      values (v_ip, v_email, v_interest, 'duplicate', v_previous);
      return jsonb_build_object('ok', true, 'code', 'duplicate', 'reference', v_previous);
    end if;
  end if;

  for i in 1..6 loop
    v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
  end loop;
  v_reference := 'WEB-' || v_code;

  v_title := case v_interest
    when 'arvoos' then 'Web sitesi · ArvoOS demo talebi'
    when 'arvolab' then 'Web sitesi · ArvoLab talebi'
    when 'arc' then 'Web sitesi · Arc talebi'
    when 'services' then 'Web sitesi · Hizmet talebi'
    else 'Web sitesi · Genel talep'
  end;
  v_service := case v_interest
    when 'arvoos' then 'ArvoOS demo'
    when 'arvolab' then 'ArvoLab'
    when 'arc' then 'Arc'
    when 'services' then 'Dijital hizmetler'
    else 'Genel iletişim'
  end;

  select s.probability into v_probability
  from public.organization_crm_stages s
  where s.organization_id = v_org and s.code = 'lead' and s.is_active
  limit 1;

  insert into public.crm_opportunities (
    organization_id, title, customer_name, contact_email, contact_phone,
    source, notes, estimated_value, probability, stage, request_details,
    assigned_employee_id, owner_user_id, created_by
  ) values (
    v_org,
    v_title,
    v_name,
    nullif(v_email, ''),
    nullif(v_phone, ''),
    'Web sitesi (arvo-os.com)',
    concat_ws(E'\n',
      'Web sitesi formu · Ref ' || v_reference,
      case when v_company <> '' then 'Şirket: ' || v_company end,
      'Dil: ' || case v_locale when 'en' then 'İngilizce' else 'Türkçe' end,
      case when v_page <> '' then 'Sayfa: ' || v_page end,
      'KVKK aydınlatma metni onayı: ' || v_now_local || ' (TSİ)'
    ),
    0,
    coalesce(v_probability, 10),
    'lead',
    jsonb_strip_nulls(jsonb_build_object(
      'customer_type', case when v_company <> '' then 'Kurumsal' else 'Bireysel' end,
      'service_type', v_service,
      'scope', nullif(v_message, ''),
      'company', nullif(v_company, ''),
      'channel', 'website',
      'site_reference', v_reference,
      'site_interest', v_interest,
      'site_locale', v_locale,
      'site_page', nullif(v_page, ''),
      'kvkk_consent_at', now()
    )),
    null,
    null,
    v_creator
  )
  returning id into v_opportunity;

  insert into public.site_lead_attempts (ip_hash, email_norm, interest, outcome, reference, opportunity_id)
  values (v_ip, nullif(v_email, ''), v_interest, 'accepted', v_reference, v_opportunity);

  -- Kayıt geçmişi (panelde "oluşturuldu" satırı)
  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (v_org, null, 'create', 'crm_opportunity', v_opportunity::text,
    jsonb_build_object('opportunity_id', v_opportunity, 'changes', '[]'::jsonb,
      'note', 'Web sitesi formu · ' || v_name || ' · Ref ' || v_reference));

  -- Satış ekibine bildirim: aktif owner/admin/manager (atanmamış talebi
  -- yalnızca bu roller görebiliyor)
  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct on (m.user_id)
    v_org,
    m.user_id,
    'organization',
    'site_lead',
    'Web sitesinden yeni talep',
    v_name || ' web sitesinden “' || v_service || '” talebi bıraktı (Ref ' || v_reference || ').',
    '/panel/crm/requests/' || v_opportunity::text,
    jsonb_build_object('opportunity_id', v_opportunity, 'reference', v_reference, 'interest', v_interest, 'locale', v_locale)
  from public.organization_memberships m
  where m.organization_id = v_org and m.is_active and m.role::text in ('owner', 'admin', 'manager');

  return jsonb_build_object('ok', true, 'code', 'ok', 'reference', v_reference);
end;
$$;

revoke all on function public.submit_site_lead(text, text, text, text, text, text, text, text, text, boolean) from public;
grant execute on function public.submit_site_lead(text, text, text, text, text, text, text, text, text, boolean) to anon, authenticated;
