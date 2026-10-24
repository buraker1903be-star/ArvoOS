/*
  OPERASYON DEPARTMANINDA MÜŞTERİ VERİSİ VARSAYILAN KAPALI.

  Bir önceki migration (20261023183540) tutarı finans, telefonu CRM
  modülüne bağladı. Canlıda ölçüldüğünde BEŞ kişinin ikisi de hâlâ
  açıktı ve sebebi `arvo_modul_acik`'in son satırı: kural YOKSA `true`
  dönüyor. Yani modüllerini hiç yapılandırmamış bir kurumda maskeleme
  hiç işlemiyordu.

  "OPERASYON MODÜLÜ AÇIK OLAN" ÖLÇÜT OLAMAZ — denendi ve yanlış:
  hiç yapılandırma yokken HERKESİN her modülü açık, yani satış
  personelinin de operasyon modülü açık görünüyor. Bu ölçüt satışın
  CRM'ini kapatırdı.

  ÖLÇÜT DEPARTMAN. Sistemin "operasyon departmanı" tanımı zaten var
  (lib/yetki-profilleri.ts → departmanTuru: adı "operasyon" ile
  başlayan departman) ve profil atamasında kullanılıyor. Aynı tanım
  burada SQL'e taşınıyor; bu bir TEKRAR ve bilerek yapılıyor —
  alternatifi, departman kararını uygulama katmanından veritabanına
  parametre olarak taşımaktı ve o da RLS'in göremeyeceği bir yerde
  kalırdı. İki tarafın aynı kalması `tests/unit` tarafında
  sabitlenmeli.

  ROL KURALI YOK SAYILIYOR ve bu ayrımın bedeli ölçüldü: `member`
  rolü satışla operasyon arasında PAYLAŞILIYOR. Kurum satış için
  "member → crm açık" yazdığında aynı satır operasyon personelini de
  açıyordu. Departman kısıtı rol kuralının üstünde.

  İSTİSNA KİŞİYE ÖZEL YAZILIR. Hem satışta hem operasyonda çalışan
  birine Ayarlar → Yetkilendirme'den KİŞİ düzeyinde izin verilebilir;
  rol düzeyinde verilemez. Böylece istisna bir kişiyi kapsıyor,
  departmanın tamamını değil.

  KURUM SAHİBİ KISITLANMIYOR (deponun değişmezi): kendi panelinden
  kilitlenip dışarıda kalmasın.
*/

/* Departman adı normalleştirme — var olan arvo_is_management_name
   kalıbının aynısı. TypeScript'teki karşılığı departmanTuru(). */
create or replace function private.arvo_is_operations_name(p_name text)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select coalesce(lower(translate(btrim(p_name), 'İIı', 'iii')) ~ '\moperasyon', false);
$$;

revoke all on function private.arvo_is_operations_name(text) from public, anon;
grant execute on function private.arvo_is_operations_name(text) to authenticated, service_role;

/* Çağıran, bu kurumda operasyon departmanında mı? */
create or replace function private.arvo_operasyon_departmaninda(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.hr_employees e
      join public.hr_departments d on d.id = e.department_id
    where e.organization_id = p_org
      and e.user_id = (select auth.uid())
      and e.employment_status = 'active'
      and private.arvo_is_operations_name(d.name)
  );
$$;

revoke all on function private.arvo_operasyon_departmaninda(uuid) from public, anon;
grant execute on function private.arvo_operasyon_departmaninda(uuid) to authenticated, service_role;

/*
  MÜŞTERİ VERİSİ KAPISI. `arvo_modul_acik`'in yerine GEÇMİYOR, onu
  sarıyor: o işlev yirmi üç yerde kullanılıyor ve oradaki anlamı
  "bu modülün ekranlarını açabilir mi". Buradaki soru başka: "bu
  kişiye müşterinin parası ya da iletişim bilgisi gösterilebilir mi".
*/
create or replace function private.arvo_musteri_verisi_acik(p_org uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select case
    when exists (
      select 1 from public.organization_memberships m
      where m.organization_id = p_org
        and m.user_id = (select auth.uid())
        and m.is_active
        and m.role::text = 'owner'
    ) then true
    when private.arvo_operasyon_departmaninda(p_org) then
      /* Varsayılan KAPALI; yalnızca kişiye özel açık izin açar. */
      coalesce(
        (select mm.can_access
           from public.member_module_permissions mm
          where mm.organization_id = p_org
            and mm.user_id = (select auth.uid())
            and mm.module_key = p_module),
        false)
    else private.arvo_modul_acik(p_org, p_module)
  end;
$$;

revoke all on function private.arvo_musteri_verisi_acik(uuid, text) from public, anon;
grant execute on function private.arvo_musteri_verisi_acik(uuid, text) to authenticated, service_role;

/* ---------- Kapıyı kullanan üç yer ---------- */

create or replace function public.portal_workflow_payment_status(p_workflow_id uuid)
returns table(has_contract boolean, settled boolean, total_amount bigint, paid_amount bigint, remaining_amount bigint)
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  target_org uuid;
  target_contract uuid;
  can_see_amounts boolean;
  pay record;
begin
  if p_workflow_id is null or not private.arvo_can_access_workflow(p_workflow_id) then
    return;
  end if;

  select w.organization_id,
         coalesce(
           (select c.id from public.crm_contracts c
             where c.id = w.contract_id and c.organization_id = w.organization_id),
           (select c.id from public.crm_contracts c
             where c.workflow_id = w.id and c.organization_id = w.organization_id
             order by c.created_at desc limit 1)
         )
    into target_org, target_contract
  from public.operation_workflows w
  where w.id = p_workflow_id;

  if target_contract is null then
    has_contract := false;
    settled := false;
    return next;
    return;
  end if;

  select * into pay from private.arvo_contract_payment_summary(target_contract);

  /* "settled" BİLEREK açık: iş akışı ödemenin kapandığını bilmek
     zorunda (teslim kararı ona bağlı), RAKAMI bilmek zorunda değil. */
  can_see_amounts := private.arvo_is_privileged_member(target_org)
                     and private.arvo_musteri_verisi_acik(target_org, 'finance');

  has_contract := true;
  settled := coalesce(pay.settled, false);
  total_amount := case when can_see_amounts then pay.total_amount end;
  paid_amount := case when can_see_amounts then pay.paid_amount end;
  remaining_amount := case when can_see_amounts then pay.remaining_amount end;
  return next;
end $function$;

revoke all on function public.portal_workflow_payment_status(uuid) from public, anon;
grant execute on function public.portal_workflow_payment_status(uuid) to authenticated;
grant execute on function public.portal_workflow_payment_status(uuid) to service_role;

create or replace view public.ops_opportunities with (security_barrier=true) as
 select id,
    organization_id,
    title,
    customer_name,
    case when private.arvo_musteri_verisi_acik(organization_id, 'crm') then contact_email end as contact_email,
    case when private.arvo_musteri_verisi_acik(organization_id, 'crm') then contact_phone end as contact_phone,
    stage,
    assigned_employee_id,
    created_at,
    updated_at,
    jsonb_strip_nulls(jsonb_build_object('service_type', request_details ->> 'service_type'::text, 'academic_level', request_details ->> 'academic_level'::text, 'university', request_details ->> 'university'::text, 'faculty', request_details ->> 'faculty'::text, 'department', request_details ->> 'department'::text, 'program', request_details ->> 'program'::text, 'advisor', request_details ->> 'advisor'::text, 'language', request_details ->> 'language'::text)) as kunye
   from public.crm_opportunities o
  where private.arvo_can_access_opportunity(id);

create or replace view public.operasyon_is_liste with (security_invoker=true, security_barrier=true) as
 select w.id,
    w.organization_id,
    w.title,
    w.customer_name,
    w.description,
    w.status,
    w.priority,
    w.start_date,
    w.due_date,
    w.delivered_at,
    w.created_at,
    w.contract_id,
    w.assigned_employee_id,
    w.waiting_party,
    w.waiting_since,
    coalesce(adim.toplam, 0::bigint) as adim_toplam,
    coalesce(adim.tamam, 0::bigint) as adim_tamam,
    coalesce(mesaj.okunmamis, 0::bigint) as okunmamis_mesaj,
    sozlesme.opportunity_id,
    sozlesme.invoice_id,
    case when private.arvo_musteri_verisi_acik(w.organization_id, 'crm') then musteri.contact_phone end as contact_phone,
    case when private.arvo_musteri_verisi_acik(w.organization_id, 'crm') then musteri.contact_email end as contact_email,
    w.updated_at
   from public.operation_workflows w
     left join lateral ( select count(*) as toplam,
            count(*) filter (where s.is_completed) as tamam
           from public.operation_steps s
          where s.workflow_id = w.id) adim on true
     left join lateral ( select count(*) as okunmamis
           from public.customer_file_messages m
          where m.workflow_id = w.id and m.sender_type = 'customer'::text and m.read_at is null) mesaj on true
     left join public.ops_contracts sozlesme on sozlesme.id = w.contract_id
     left join public.ops_opportunities musteri on musteri.id = sozlesme.opportunity_id;

notify pgrst, 'reload schema';
