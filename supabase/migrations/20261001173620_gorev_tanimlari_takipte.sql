-- Müşteri takibinde görev tanımları da görünsün.
--
-- Şimdiye kadar müşteriye yalnızca AŞAMA adları açılıyordu; adım
-- başlıkları bilerek dışarı çıkmıyordu. Kurum artık işin görevlerini de
-- göstermek istiyor: müşteri "Planlama aşaması" yerine tam olarak hangi
-- işin bittiğini, hangisinin yapıldığını ve sıradakini görecek.
--
-- YENİ BİR AÇMA ANAHTARI EKLENMEDİ: bu, var olan
-- organizations.tracking_show_phases kararının ta kendisi — "sürecimi
-- müşteriye göstereyim". İki ayrı anahtar olsaydı kurum birini açıp
-- diğerini kapalı sanır, görev adları beklenmedik şekilde dışarı
-- çıkabilirdi. Bayrak kapalıyken fonksiyon yine null dönüyor.
--
-- "Şu an yapılan iş" tek görevdir ve veritabanı seçer: önce
-- status='in_progress' olan ilk görev, yoksa tamamlanmamış ilk görev.
-- Uygulamada yeniden türetilseydi iki ayrı doğru olurdu.
--
-- Dönen yapıya 'gorevler' eklendi; 'asamalar' ve diğer alanlar aynen
-- duruyor, eski ekranlar kırılmıyor.

create or replace function public.arvo_tracking_asamalar(p_tracking_code text)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_code text := upper(btrim(coalesce(p_tracking_code, '')));
  c public.crm_contracts%rowtype;
  v_goster boolean;
  v_asamalar jsonb;
  v_gorevler jsonb;
  v_toplam int;
  v_tamam int;
  v_gorev_toplam int;
  v_gorev_tamam int;
begin
  if char_length(v_code) < 6 then
    return null;
  end if;

  select * into c
  from public.crm_contracts
  where upper(tracking_code) = v_code
    and private.arvo_contract_tracking_open(status, tracking_open_before_signature)
  limit 1;
  if c.id is null then
    return null;
  end if;

  select o.tracking_show_phases into v_goster
  from public.organizations o
  where o.id = c.organization_id;
  if not coalesce(v_goster, false) then
    return null;
  end if;

  with gruplar as (
    select
      s.phase_title as ad,
      min(s.sort_order) as sira,
      count(*) as adet,
      count(*) filter (where s.is_completed) as biten
    from public.operation_steps s
    join public.operation_workflows w on w.id = s.workflow_id
    where w.contract_id = c.id
      and s.phase_title is not null
      and btrim(s.phase_title) <> ''
    group by s.phase_title
  ),
  sirali as (
    select ad, sira, adet, biten, row_number() over (order by sira) as no
    from gruplar
  ),
  ilk_acik as (
    select min(no) as no from sirali where biten < adet
  )
  select
    jsonb_agg(
      jsonb_build_object(
        'ad', s.ad,
        'durum', case
          when s.biten >= s.adet then 'done'
          when s.no = (select no from ilk_acik) then 'current'
          else 'upcoming'
        end
      )
      order by s.sira
    ),
    count(*)::int,
    count(*) filter (where s.biten >= s.adet)::int
  into v_asamalar, v_toplam, v_tamam
  from sirali s;

  if v_asamalar is null or v_toplam = 0 then
    return null;
  end if;

  -- Görevler: aşamaya giren adımlar, iş sırasıyla. Aşama başlığı olmayan
  -- adım listede de yok; aşama çizelgesiyle aynı küme kalsın diye.
  with adimlar as (
    select
      s.title as ad,
      s.phase_title as asama,
      s.is_completed,
      s.status,
      s.sort_order,
      row_number() over (order by s.sort_order, s.title) as no
    from public.operation_steps s
    join public.operation_workflows w on w.id = s.workflow_id
    where w.contract_id = c.id
      and s.phase_title is not null
      and btrim(s.phase_title) <> ''
  ),
  simdiki as (
    select coalesce(
      (select min(no) from adimlar where not is_completed and status = 'in_progress'),
      (select min(no) from adimlar where not is_completed)
    ) as no
  )
  select
    jsonb_agg(
      jsonb_build_object(
        'ad', a.ad,
        'asama', a.asama,
        'durum', case
          when a.is_completed then 'done'
          when a.no = (select no from simdiki) then 'current'
          else 'upcoming'
        end
      )
      order by a.no
    ),
    count(*)::int,
    count(*) filter (where a.is_completed)::int
  into v_gorevler, v_gorev_toplam, v_gorev_tamam
  from adimlar a;

  return jsonb_build_object(
    'asamalar', v_asamalar,
    'toplam', v_toplam,
    'tamamlanan', v_tamam,
    'gorevler', coalesce(v_gorevler, '[]'::jsonb),
    'gorevToplam', coalesce(v_gorev_toplam, 0),
    'gorevTamamlanan', coalesce(v_gorev_tamam, 0),
    'guncel', (
      select e ->> 'ad' from jsonb_array_elements(v_asamalar) as e
      where e ->> 'durum' = 'current' limit 1
    ),
    'guncelGorev', (
      select e ->> 'ad' from jsonb_array_elements(coalesce(v_gorevler, '[]'::jsonb)) as e
      where e ->> 'durum' = 'current' limit 1
    )
  );
end;
$function$;

-- Postgres yeni fonksiyonu PUBLIC'e açık oluşturur; yetkiler yeniden yazılıyor.
revoke all on function public.arvo_tracking_asamalar(p_tracking_code text) from public, anon, authenticated, service_role;
grant execute on function public.arvo_tracking_asamalar(p_tracking_code text) to service_role;
grant execute on function public.arvo_tracking_asamalar(p_tracking_code text) to authenticated;
grant execute on function public.arvo_tracking_asamalar(p_tracking_code text) to anon;
