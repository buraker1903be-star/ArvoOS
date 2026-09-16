-- Tanıtım sitesi teklif formu: mevcut canlı fonksiyonun sürüm takibine alınması.
--
-- akademikmerkez.com'daki "Teklif Al" formu bu fonksiyona yazıyor (anon
-- anahtarla, doğrudan PostgREST üzerinden). Fonksiyon bugüne kadar yalnızca
-- canlı veritabanında yaşıyordu; hiçbir depoda tanımı yoktu.
--
-- Riski: veritabanı sıfırdan kurulursa form SESSİZCE çalışmaz. Kullanıcı
-- "talebiniz alındı" görür, talep hiçbir yere yazılmaz, kimse fark etmez.
-- Aynı sınıftan üç fonksiyon (create_arvoculture_storefront_order,
-- check_arvoculture_coupon, arc_categorize_supplier_products) 16 Eylül'de
-- migration'a alınmıştı; bu dördüncüsü.
--
-- Tanım canlıdaki hâliyle BİREBİR aynı; davranış değişmiyor.
--
-- Bilinen kusur (bu migration'da düzeltilmedi): talep notundaki ve
-- request_details.source alanındaki "akademikmerkez.com" sabit yazılmış,
-- oysa kurum org_slug parametresiyle geliyor. Başka bir marka bu fonksiyonu
-- çağırırsa talep yanlış kaynakla kaydedilir. Düzeltmek imza değişikliği
-- gerektiriyor (kaynak adı parametre olmalı), ayrı ele alınmalı.

create or replace function public.submit_public_lead(
  org_slug text,
  p_customer_name text,
  p_email text,
  p_phone text,
  p_service text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org_id uuid;
  v_owner uuid;
  v_request_id uuid;
  v_title text;
  v_notes text;
begin
  if p_customer_name is null or char_length(trim(p_customer_name)) < 2 then
    raise exception 'invalid_name';
  end if;

  if (p_email is null or char_length(trim(p_email)) = 0)
     and (p_phone is null or char_length(trim(p_phone)) = 0) then
    raise exception 'contact_required';
  end if;

  select o.id
    into v_org_id
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

  v_title := left(coalesce(nullif(trim(p_service), ''), 'Web sitesi talebi'), 180);
  v_notes := trim(both E'\n' from format(
    E'Kaynak: akademikmerkez.com — Teklif Al formu\nHizmet: %s\n\n%s',
    coalesce(nullif(trim(p_service), ''), 'Belirtilmedi'),
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
      'source', 'akademikmerkez.com',
      'service_type', coalesce(nullif(trim(p_service), ''), 'Belirtilmedi'),
      'scope', coalesce(left(trim(p_message), 1500), ''),
      'customer_type', 'Bireysel'
    )
  );

  return v_request_id;
end;
$function$;

-- Tanıtım sitesi anon anahtarla çağırıyor; izin olmadan form çalışmaz.
grant execute on function public.submit_public_lead(text, text, text, text, text, text) to anon, authenticated;
