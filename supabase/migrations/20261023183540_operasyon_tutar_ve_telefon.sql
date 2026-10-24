/*
  OPERASYON PERSONELİ PARA VE TELEFON GÖRMEZ.

  Kurum sahibinin kuralı (23.10.2026): operasyon departmanındaki hiç
  kimse sözleşme tutarını, teklif tutarını, müşteri bakiyesini ya da
  müşterinin telefon numarasını görmemeli.

  DENETİMDE İKİSİ AÇIK BULUNDU:

  1. SÖZLEŞME TUTARI. `portal_workflow_payment_status` tutarları
     `arvo_is_privileged_member` ile veriyordu; o işlev rol listesine
     bakıyor (`owner`, `admin`, `manager`) ve Operasyon Müdürü
     profilinin rolü tam olarak `manager`. İş detayında kalan tutar ve
     ödenen yüzde yazıyordu.

     Operasyon PERSONELİ (member) zaten göremiyordu; açık olan yalnızca
     müdürdü — yani kusur "bazı operasyoncular" için geçerliydi ve
     ekrana bakarak fark edilmesi zordu.

  2. MÜŞTERİ TELEFONU VE E-POSTASI. `ops_opportunities` ve
     `operasyon_is_liste` bu iki sütunu herkese döndürüyordu; iş
     listesindeki müşteri hücresi ve iş detayındaki künye ikisini de
     basıyordu.

  Teklif tutarı ve müşteri bakiyesi zaten kapalıydı: `ops_proposals`
  görünümünde tutar sütunu yok, cari ekranları `finance` modülü ve
  `finance.gor` yeteneğinin arkasında (varsayılanı yalnızca admin).

  KARAR ROLE DEĞİL MODÜLE BAĞLANDI.

  `arvo_is_privileged_member`'ı değiştirmedim: yirmi üç yerde, çoğu
  RLS politikası: oradaki anlamı "yönetim kademesi", para görme yetkisi
  değil. Onu daraltmak alakasız yüzeyleri kırardı.

  Yetenek tablosuna (`role_capability_permissions`) bakmak da seçilmedi:
  yeteneklerin VARSAYILANLARI TypeScript'te (`lib/yetkiler.ts`) ve
  SQL'e kopyalamak aynı kuralı iki yerde tutmak olurdu — bu depoda
  sapan her kural böyle sapmıştı.

  Bunun yerine zaten veritabanında olan ve kişiye özel çözülen bilgi
  kullanılıyor: `arvo_modul_acik`. Karar kurumda kalıyor (Ayarlar →
  Yetkilendirme'den modül açılıp kapanıyor) ve ikinci bir yerde
  tutulan kural yok:

    - tutar  → `finance` modülü açık olmalı
    - telefon/e-posta → `crm` modülü açık olmalı

  ŞEMA ADLARI AÇIKÇA YAZILI: anlık görüntüden kurulan test
  veritabanında `search_path` public içermiyor ve niteliksiz
  `ops_contracts` 42P01 veriyordu.

  Operasyon Müdürü profilinde ikisi de kapalı
  (`acikModuller: ["operations","posta"]`), Satış Müdürü'nde crm açık.
*/

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

  /*
    TUTAR İÇİN FİNANS MODÜLÜ DE AÇIK OLMALI. Önceden yalnızca
    `arvo_is_privileged_member` vardı ve Operasyon Müdürü (rol
    `manager`) kalan tutarı ve ödenen yüzdeyi görüyordu.

    "settled" (kapandı mı) BİLEREK kaldı: iş akışı ödemenin
    tamamlandığını bilmek zorunda — teslim kararı ona bağlı — ama
    RAKAMI bilmek zorunda değil.
  */
  can_see_amounts := private.arvo_is_privileged_member(target_org)
                     and private.arvo_modul_acik(target_org, 'finance');

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

/*
  TELEFON VE E-POSTA CRM MODÜLÜNE BAĞLANDI.

  Sütunlar DÜŞÜRÜLMÜYOR, maskeleniyor: adları ve tipleri aynı kalıyor,
  yoksa görünümden okuyan her yer derlemede değil ÇALIŞMA ANINDA
  kırılırdı ve `select("*")` yapan sayfalar sessizce boş alan alırdı.
*/
create or replace view public.ops_opportunities with (security_barrier=true) as
 select id,
    organization_id,
    title,
    customer_name,
    case when private.arvo_modul_acik(organization_id, 'crm') then contact_email end as contact_email,
    case when private.arvo_modul_acik(organization_id, 'crm') then contact_phone end as contact_phone,
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
    /*
      Maskeleme SÜZMEYİ etkilemiyor: `operasyon_is_suz` telefonla hiç
      aramıyor (yalnızca iş başlığı ve müşteri adı). Talep/teklif/
      sözleşme listelerindeki telefon araması AYRI görünümlerde ve
      onlara dokunulmadı — orada arama CRM personelinin işi.
    */
    case when private.arvo_modul_acik(w.organization_id, 'crm') then musteri.contact_phone end as contact_phone,
    case when private.arvo_modul_acik(w.organization_id, 'crm') then musteri.contact_email end as contact_email,
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
