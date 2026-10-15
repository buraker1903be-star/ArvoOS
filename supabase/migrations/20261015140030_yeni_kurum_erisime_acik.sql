/*
  YENİ KURULAN KURUM PANELE GİREMİYORDU (15.10.2026).

  provision_customer_organization kurumu `status = 'trial'` ile açıyordu.
  Oysa panele girişin iki kapısı da `status = 'active'` arıyor:

    · public.get_my_workspaces  — çalışma alanı listesi. Boş dönünce
      lib/panel-context kullanıcıyı /kurulum'a yolluyor.
    · private.arvo_crm_lookup_role — CRM RLS yardımcısı.

  Yani kurucu kurumu açıyor, sahip daveti kabul edip şifresini
  belirliyor, panele giriyor ve "Kullanıcınıza henüz kurum ve paket
  atanmamış" ekranını görüyor. Konsolda ise her şey yerinde görünüyor:
  kurum kurulmuş, sahip aktif, lisans denemede, modüller açık.

  Canlıda yakalandı: "Arvo Deneme" kurumu açıldıktan sonra sahibinin
  (kurucunun kendi hesabı) çalışma alanı listesinde kurum GÖRÜNMEDİ;
  konsolun kullanıcı penceresi aynı anda "Kurum sahibi · Erişim açık"
  diyordu. Bugüne kadar fark edilmemesinin sebebi, çalışan üç kurumun
  status'unun erişim anahtarıyla 'active'e çekilmiş olması: konsolda bir
  kurumun erişimini kapatıp açmak (licenses/actions cekirdekErisimi)
  status'u 'active' yazıyor, yani kurucu farkında olmadan onarıyordu.

  DENEME DURUMU LİSANSTA, ERİŞİM DURUMU KURUMDA. İkisi ayrı alan ve
  ekranlar da böyle okuyor: "Deneme" rozeti organization_licenses
  .license_status'tan, "Kullanımda / Askıda" ise organizations.status'tan
  geliyor. Kuruluşta ikisini birden 'trial' yapmak, erişim alanını
  deneme bilgisini taşımak için kullanmaktı; bu yüzden kurum artık
  erişime açık doğuyor ve denemeyi lisans satırı anlatıyor.

  Gövde canlı anlık görüntüden alındı (AGENTS.md: eski migration'dan
  değil); tek değişiklik organizations.status satırı.
*/
create or replace function public.provision_customer_organization(
  p_name text, p_slug text, p_sector text, p_plan_code text,
  p_owner_email text, p_custom_domain text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  new_organization_id uuid;
  new_invitation_id uuid;
  normalized_email text := lower(trim(p_owner_email));
begin
  if not (select private.is_arvoos_founder()) then raise exception 'Founder authorization required'; end if;
  if length(trim(p_name)) < 2 or length(trim(p_name)) > 160 then raise exception 'Invalid organization name'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid organization slug'; end if;
  if length(trim(p_sector)) < 2 or length(trim(p_sector)) > 80 then raise exception 'Invalid sector'; end if;
  if p_plan_code not in ('starter','professional','enterprise') then raise exception 'Invalid plan'; end if;
  if normalized_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'Invalid owner email'; end if;

  -- 'active': erişim durumu. Deneme bilgisi lisans satırında (yukarıdaki not).
  insert into public.organizations (name, slug, sector, status, plan_code, custom_domain)
  values (trim(p_name), p_slug, trim(p_sector), 'active'::public.organization_status, p_plan_code::public.plan_code, nullif(trim(p_custom_domain), ''))
  returning id into new_organization_id;

  insert into public.organization_modules (organization_id, module_code, is_enabled)
  select new_organization_id, module.code,
    case when p_plan_code = 'enterprise' then true
         when p_plan_code = 'professional' then module.code in ('crm','operations','finance','reporting')
         else module.code in ('crm','operations') end
  from public.arvo_modules module where module.is_active = true;

  insert into public.organization_invitations (organization_id, email, role, invited_by)
  values (new_organization_id, normalized_email, 'owner', (select auth.uid()))
  returning id into new_invitation_id;

  return jsonb_build_object('organization_id', new_organization_id, 'invitation_id', new_invitation_id, 'owner_email', normalized_email);
end;
$function$;

/*
  ZATEN KURULMUŞ OLANLARI ONAR. Bu durumda kalan her kurumun sahibi şu
  anda panele giremiyor. Yalnızca 'trial' olanlar açılıyor: 'suspended'
  bilerek kapatılmış (kurucu sebep yazarak kapatıyor), 'archived' ise
  kapanmış bir kurum — ikisine de dokunulmuyor.
*/
update public.organizations
   set status = 'active'::public.organization_status,
       updated_at = now()
 where status = 'trial'::public.organization_status;
