/*
  OPERASYON EKİP YÜKÜ — "kimde ne var, kim geride".

  Operasyon müdürü (rol: manager) işlerin TAMAMINI görüyor
  (private.arvo_can_access_workflow rolü owner/admin/manager ise
  atamaya bakmıyor) ve işi atayıp arşivleyebiliyor
  (operations.gorev.ata, operations.arsiv.yonet). Eksik olan,
  organizasyonu KİŞİ KİŞİ görebileceği tek bir yüzeydi: işler listesi
  sorumluya göre süzülüyor ama "kimde kaç iş birikti, kimin termini
  geçti, kim müsait" sorusu için personeli tek tek süzmek gerekiyordu.

  İŞİ OLMAYAN PERSONEL DE DÖNÜYOR: "kim müsait" sorusu, "kim yüklü"
  kadar değerli. Sıfır satırları elemek, müdürün iş dağıtırken boş
  olanı görmemesi demekti.

  ATANMAMIŞ İŞLER AYRI SATIR (employee_id null): sahibi olmayan iş
  kimsenin listesinde görünmediği için en kolay kaybolan iştir.

  ADIM SORUMLUSU: adımın kendi sorumlusu yoksa işin sorumlusu sayılır —
  panonun ve genel bakışın kuralıyla aynı. İki yerde iki ayrı kural,
  aynı işi iki kişiye yüklü göstermek demekti.

  KÜMELER PARAMETRE: aktif ve "süren" durumları TypeScript'te yaşıyor
  (ops-shared.tsx); SQL'e kopyalanmadı.

  GÜVENLİK: security invoker. Operasyon personeli bu işlevi çağırsa
  yalnızca KENDİ işlerinin sayılarını görür (RLS), çünkü işler
  tablosundan okuyor. Sayfa ayrıca operations.ekip.gor yetkisine bağlı.
*/

create or replace function public.operasyon_ekip_yuku(
  p_organization_id uuid,
  p_aktif text[],
  p_suren text[]
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with bugun as (
    select (timezone('Europe/Istanbul', now()))::date as gun
  ),
  isler as (
    select w.id, w.assigned_employee_id, w.status, w.due_date
    from public.operation_workflows w
    where w.organization_id = p_organization_id and w.status = any(p_aktif)
  ),
  /* Adımın sorumlusu: kendi sorumlusu, yoksa işin sorumlusu. */
  adimlar as (
    select s.id, s.is_completed, s.due_date,
           coalesce(s.assigned_employee_id, i.assigned_employee_id) as sorumlu
    from public.operation_steps s
    join isler i on i.id = s.workflow_id
  ),
  mesajlar as (
    select i.assigned_employee_id as sorumlu, count(*) as adet
    from public.customer_file_messages m
    join isler i on i.id = m.workflow_id
    where m.sender_type = 'customer' and m.read_at is null
    group by 1
  ),
  is_ozeti as (
    select
      i.assigned_employee_id as sorumlu,
      count(*) as acik_is,
      count(*) filter (where i.status = any(p_suren)) as suren_is,
      count(*) filter (where i.due_date is not null and i.due_date < (select gun from bugun)) as termin_gecmis,
      count(*) filter (where i.due_date is not null
                         and i.due_date >= (select gun from bugun)
                         and i.due_date <= (select gun from bugun) + 7) as termin_yakin
    from isler i group by 1
  ),
  adim_ozeti as (
    select
      a.sorumlu,
      count(*) as adim_toplam,
      count(*) filter (where a.is_completed) as adim_tamam,
      count(*) filter (where not a.is_completed and a.due_date is not null
                         and a.due_date < (select gun from bugun)) as adim_gecmis
    from adimlar a group by 1
  ),
  /* Satırlar: kurumun personeli + "atanmamış" (null) satırı. Pasif
     personel de görünüyor, üstünde iş kaldıysa devredilmesi gerekiyor. */
  kisiler as (
    select e.id, e.full_name, e.job_title, e.employment_status
    from public.hr_employees e
    where e.organization_id = p_organization_id
    union all
    select null, null, null, null
  ),
  satirlar as (
    select
      k.id as employee_id,
      k.full_name as ad,
      k.job_title as unvan,
      k.employment_status as durum,
      coalesce(o.acik_is, 0) as acik_is,
      coalesce(o.suren_is, 0) as suren_is,
      coalesce(o.termin_gecmis, 0) as termin_gecmis,
      coalesce(o.termin_yakin, 0) as termin_yakin,
      coalesce(a.adim_toplam, 0) as adim_toplam,
      coalesce(a.adim_tamam, 0) as adim_tamam,
      coalesce(a.adim_gecmis, 0) as adim_gecmis,
      coalesce(m.adet, 0) as okunmamis_mesaj
    from kisiler k
    left join is_ozeti o on o.sorumlu is not distinct from k.id
    left join adim_ozeti a on a.sorumlu is not distinct from k.id
    left join mesajlar m on m.sorumlu is not distinct from k.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'employee_id', employee_id,
      'ad', ad,
      'unvan', unvan,
      'durum', durum,
      'acik_is', acik_is,
      'suren_is', suren_is,
      'termin_gecmis', termin_gecmis,
      'termin_yakin', termin_yakin,
      'adim_toplam', adim_toplam,
      'adim_tamam', adim_tamam,
      'adim_gecmis', adim_gecmis,
      'okunmamis_mesaj', okunmamis_mesaj
    )
    /* Sıra: geciken işi olan üstte, sonra yük, sonra ad. Atanmamış
       satırı sıfır değilse kendiliğinden üste çıkıyor. */
    order by (termin_gecmis + adim_gecmis) desc, acik_is desc, ad nulls first
  ), '[]'::jsonb)
  from satirlar
  /* İşi olmayan ve PASİF olan personel listeyi şişirmesin; aktif olan
     "müsait" diye görünmeli. Atanmamış satırı yalnızca gerçekten
     atanmamış iş varsa görünüyor — hep duran sıfırlı bir satır
     müdürün gözünü alıştırır ve dolduğu gün fark edilmez. */
  where acik_is > 0 or durum = 'active'
$$;

revoke all on function public.operasyon_ekip_yuku(uuid, text[], text[]) from public, anon;
grant execute on function public.operasyon_ekip_yuku(uuid, text[], text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
