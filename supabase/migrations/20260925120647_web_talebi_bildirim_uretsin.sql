-- ============================================================
-- AkademikMerkez'den gelen web talebi artık bildirim üretiyor.
--
-- İki kardeş fonksiyon var ve yalnızca biri haber veriyordu:
--
--   submit_site_lead    (arvo-os.com)      → fırsat + activity_logs + bildirim
--   submit_public_lead  (kiracı siteleri,  → yalnızca crm_requests + fırsat
--                        akademikmerkez.com)
--
-- Sonuç: siteden gelen bir iş, o gün panele bakan olmazsa GÖRÜLMEDEN
-- bekliyordu. Hiçbir yerde hata yoktu — talep düzgün kaydediliyordu,
-- yalnızca kimsenin haberi olmuyordu. Kayıt geçmişinde de "oluşturuldu"
-- satırı çıkmıyordu, yani talebin ne zaman ve nereden geldiği panelden
-- okunamıyordu.
--
-- Bu migration submit_public_lead'i kardeşiyle aynı hizaya getiriyor.
-- Fonksiyonun geri kalanı CANLIDAKİ gövdenin birebir aynısı (imza, dönüş
-- tipi, doğrulama, hız sınırı, kaynak adı) — yalnızca sonuna iki yazma
-- ekleniyor.
--
-- Kategori bilerek 'site_lead': panel bu kategoriyi zaten tanıyor ve
-- müşteri adıyla birlikte gösteriyor (app/panel/notifications/describe.ts).
-- Yeni bir kategori, eski bildirim ekranlarının tanımadığı bir değerle
-- karşılaşması demekti.
-- ============================================================

create or replace function public.submit_public_lead(org_slug text, p_customer_name text, p_email text, p_phone text, p_service text, p_message text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org_id uuid;
  v_owner uuid;
  v_request_id uuid;
  v_opportunity_id uuid;
  v_title text;
  v_notes text;
  v_source text;
  v_service text;
begin
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_name';
  end if;

  if (p_email is null or char_length(trim(p_email)) = 0)
     and (p_phone is null or char_length(trim(p_phone)) = 0) then
    raise exception 'contact_required';
  end if;

  -- Kaynak adı da buradan geliyor; ayrı sorgu yok.
  select o.id, coalesce(nullif(trim(o.custom_domain), ''), o.name)
    into v_org_id, v_source
  from public.organizations o
  where lower(o.slug) = lower(trim(org_slug))
    and o.status::text = 'active'
  limit 1;

  if v_org_id is null then
    raise exception 'organization_not_found';
  end if;

  -- Talep, kurumun sahibine (yoksa yöneticisine) atanır.
  select om.user_id
    into v_owner
  from public.organization_memberships om
  where om.organization_id = v_org_id
    and om.is_active = true
  order by
    case om.role::text
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    om.joined_at asc
  limit 1;

  if v_owner is null then
    raise exception 'organization_not_found';
  end if;

  -- Aynı e-postadan 2 dakika içinde ikinci talep kabul edilmez.
  if p_email is not null and trim(p_email) <> '' and exists (
    select 1
    from public.crm_requests r
    where r.organization_id = v_org_id
      and lower(r.email) = lower(trim(p_email))
      and r.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'rate_limited';
  end if;

  v_service := coalesce(nullif(trim(p_service), ''), 'Belirtilmedi');
  v_title := left(coalesce(nullif(trim(p_service), ''), 'Web sitesi talebi'), 180);
  v_notes := trim(both E'\n' from format(
    E'Kaynak: %s — Teklif Al formu\nHizmet: %s\n\n%s',
    v_source,
    v_service,
    coalesce(left(trim(p_message), 1500), '')
  ));

  insert into public.crm_requests (
    organization_id,
    title,
    customer_name,
    email,
    phone,
    status,
    notes,
    created_by
  ) values (
    v_org_id,
    v_title,
    left(trim(p_customer_name), 160),
    nullif(left(trim(p_email), 320), ''),
    nullif(left(trim(p_phone), 40), ''),
    'new',
    v_notes,
    v_owner
  )
  returning id into v_request_id;

  insert into public.crm_opportunities (
    organization_id,
    title,
    customer_name,
    contact_email,
    contact_phone,
    stage,
    estimated_value,
    probability,
    owner_user_id,
    source,
    notes,
    created_by,
    request_details
  ) values (
    v_org_id,
    v_title,
    left(trim(p_customer_name), 180),
    nullif(left(trim(p_email), 320), ''),
    nullif(left(trim(p_phone), 40), ''),
    'lead',
    0,
    10,
    v_owner,
    'WEB SİTESİ',
    v_notes,
    v_owner,
    jsonb_build_object(
      'source_request_id', v_request_id::text,
      'source', v_source,
      'service_type', v_service,
      'scope', coalesce(left(trim(p_message), 1500), ''),
      'customer_type', 'Bireysel'
    )
  )
  -- YENİ: fırsatın kimliği tutuluyor; bildirim ve kayıt geçmişi buna bağlanıyor.
  returning id into v_opportunity_id;

  /*
    YENİ — Kayıt geçmişi. Panelde talebin "oluşturuldu" satırı bu; yoksa
    talebin nereden ve ne zaman geldiği ekrandan okunamıyordu.
    actor_user_id null: talebi bir personel değil, ziyaretçi açtı.
  */
  insert into public.activity_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_org_id, null, 'create', 'crm_opportunity', v_opportunity_id::text,
    jsonb_build_object(
      'opportunity_id', v_opportunity_id,
      'changes', '[]'::jsonb,
      'note', 'Web sitesi formu · ' || left(trim(p_customer_name), 180) || ' · ' || v_source
    )
  );

  /*
    YENİ — Satış ekibine bildirim. Alıcı kümesi kardeş fonksiyonla aynı:
    aktif owner/admin/manager. Atanmamış talebi yalnızca bu roller
    görebiliyor; sıradan üyeye bildirim göndermek, açamayacağı bir kaydı
    haber vermek olurdu.
  */
  insert into public.notifications (organization_id, user_id, audience, category, title, message, action_url, metadata)
  select distinct on (m.user_id)
    v_org_id,
    m.user_id,
    'organization',
    'site_lead',
    'Web sitesinden yeni talep',
    left(trim(p_customer_name), 180) || ' web sitesinden “' || v_service || '” talebi bıraktı.',
    '/panel/crm/requests/' || v_opportunity_id::text,
    jsonb_build_object('opportunity_id', v_opportunity_id, 'source', v_source, 'service_type', v_service)
  from public.organization_memberships m
  where m.organization_id = v_org_id
    and m.is_active
    and m.role::text in ('owner', 'admin', 'manager');

  return v_request_id;
end;
$function$;

/*
  Yetkiler canlıdakiyle birebir tekrarlanıyor. Postgres "create or replace"
  sonrasında mevcut yetkileri korur ama fonksiyon bir gün DROP edilip
  yeniden kurulursa PUBLIC'e açık doğar; ARC'ta siparişi "ödendi" yapan
  fonksiyon tam olarak böyle herkese açık kalmıştı.
*/
revoke all on function public.submit_public_lead(text, text, text, text, text, text) from public;
grant execute on function public.submit_public_lead(text, text, text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
