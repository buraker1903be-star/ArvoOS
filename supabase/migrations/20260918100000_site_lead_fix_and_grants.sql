-- ============================================================
-- arvo-os.com talep formu 13 Eylül'den beri hiçbir talebi kaydetmiyordu
--
-- submit_site_lead iki var olmayan sütuna başvuruyordu:
--   organizations.is_active   → tabloda yok; durum `status` (organization_status)
--   organization_memberships.created_at → tabloda yok; katılma `joined_at`
-- plpgsql gövdesi sütunları çalışma anında denetlediği için fonksiyon
-- oluşurken hata vermedi; her GEÇERLİ başvuru bu satıra gelince
-- "column o.is_active does not exist" ile düştü ve işlem geri alındı.
-- Geçersiz başvurular (boş ad vb.) daha önce döndüğü için çalışıyor
-- görünüyordu. Ziyaretçi "Talebiniz şu anda gönderilemedi" gördü; hata
-- yalnızca sunucu günlüğüne yazıldı. Formun yayına girdiği 13 Eylül 2026'dan
-- (b20f12b) bu yana web sitesinden CRM'e talep düşmedi.
--
-- Düzeltme yalnızca bu iki satır; gövdenin geri kalanı canlı tanımla birebir.
-- "Aktif" = askıya alınmamış ve arşivlenmemiş kurum (active veya trial);
-- arc_store_stage da kurumu aynı ölçütle açık sayıyor.
--
-- Canlı şema üzerinde doğrulandı: düzeltme öncesi hata, sonrası CRM talebi,
-- etkinlik kaydı ve sahip bildirimi oluşuyor.
-- ============================================================

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
  where o.slug = 'arvo-os' and o.status::text in ('active', 'trial')
  limit 1;
  if v_org is not null then
    select m.user_id into v_creator
    from public.organization_memberships m
    where m.organization_id = v_org and m.is_active and m.role::text = 'owner'
    order by m.joined_at
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

-- ============================================================
-- Kimliksiz (anon) çağrılabilen ve kullanılmayan / içeriden çağrılan
-- fonksiyonların yetkileri daraltılıyor
-- ============================================================

-- lookup_contracts_by_phone_suffix: hiçbir uygulama çağırmıyor, ama anon'a
-- açıktı. Kurum slug'ı + telefonun SON 4 HANESİ ile o kurumun imzalı
-- sözleşmelerini (başlık, tutar, ödenen, kalan) döndürüyor. 10.000 olasılık,
-- yani kimliksiz biri bir kurumun bütün sözleşmelerini tarayabiliyordu; takip
-- koduna eklenen kaba kuvvet korumasını (arvo_tracking_guard) da tamamen
-- atlıyor. Takip kodu fonksiyonları zaten yalnızca service_role'e açık.
revoke all on function public.lookup_contracts_by_phone_suffix(text, text) from public, anon, authenticated;
grant execute on function public.lookup_contracts_by_phone_suffix(text, text) to service_role;

-- add_standard_operation_steps: yalnızca seed_standard_operation_steps_trigger
-- (security definer) çağırıyor. Anon'a açıktı ve yetki kontrolü yok; iş
-- kimliğini bilen biri herhangi bir işe adım ekleyebiliyordu.
revoke all on function public.add_standard_operation_steps(uuid, uuid) from public, anon, authenticated;
grant execute on function public.add_standard_operation_steps(uuid, uuid) to service_role;

-- next_document_number: anon'a açıktı ve yetki kontrolü yok. Kurum kimliği
-- get_public_organization_branding ile slug'dan herkese açık; yani kimliksiz
-- biri herhangi bir kurumun teklif/sözleşme numarasını ileri kaydırabiliyordu.
-- authenticated KALIYOR: create_crm_proposal_v2 çağıranın yetkisiyle
-- (security invoker) çalışıyor ve bunu çağırıyor. respond_to_crm_proposal
-- security definer olduğu için anon müşteri kabulü etkilenmiyor.
revoke all on function public.next_document_number(uuid, text, text, date) from public, anon;
grant execute on function public.next_document_number(uuid, text, text, date) to authenticated, service_role;
