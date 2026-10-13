/*
  LİSTE SÜZGECİ İŞLEVLERİ SATIR İÇİ (13.10.2026, hızlandırma).

  20261013141922 süzgeç işlevlerini "set search_path = ''" ile yazmıştı.
  Postgres SET içeren SQL işlevini sorgunun içine KATAMIYOR (inline): talep
  listesi 50 satır istese de crm_talep_suz kurumun bütün taleplerini, her
  satırın yan sorgularıyla (son yorum…) hesaplıyor, aşama süzgeci, sıralama
  ve sayfalama ancak ondan SONRA uygulanıyordu. Canlıda talepler sayfası
  hızlanmadı (0,65–0,88 sn), işler hızlandı (0,58 sn).

  Gövdeler aynen, yalnızca SET satırı yok: bütün adlar zaten tam yazılı
  (public.…) ve işlevler SECURITY INVOKER — çağıranın yetkisiyle çalışıyor,
  search_path ile yetki yükseltilemez (o önlem security definer için).
  Satır içi olunca aşama süzgeci, sıralama ve sınır görünümün içine
  itilebiliyor.
*/

-- TALEPLER --------------------------------------------------------------------
create or replace function public.crm_talep_suz(p_org uuid, p_desen text, p_telefon text, p_temsilci text)
returns setof public.crm_talep_liste
language sql
stable
security invoker
as $$
  select t.*
  from public.crm_talep_liste t
  where t.organization_id = p_org
    and (
      p_desen is null
      or t.customer_name ilike '%' || p_desen || '%'
      or t.title ilike '%' || p_desen || '%'
      or t.contact_email ilike '%' || p_desen || '%'
      or t.hizmet_turu ilike '%' || p_desen || '%'
      or t.temsilci_adi ilike '%' || p_desen || '%'
      or (p_telefon is not null and t.telefon_rakamlari ilike '%' || p_telefon || '%')
    )
    and (
      p_temsilci is null
      or (p_temsilci = 'atanmamis' and t.assigned_employee_id is null)
      or t.assigned_employee_id::text = p_temsilci
    )
$$;

create or replace function public.crm_talep_serit(p_org uuid, p_desen text, p_telefon text, p_temsilci text)
returns jsonb
language sql
stable
security invoker
as $$
  select coalesce(jsonb_object_agg(s.stage, s.adet), '{}'::jsonb)
  from (
    select t.stage, count(*) as adet
    from public.crm_talep_suz(p_org, p_desen, p_telefon, p_temsilci) t
    group by t.stage
  ) s
$$;

-- İŞLER -----------------------------------------------------------------------
create or replace function public.operasyon_is_suz(p_org uuid, p_desen text, p_sorumlu text)
returns setof public.operasyon_is_liste
language sql
stable
security invoker
as $$
  select w.*
  from public.operasyon_is_liste w
  where w.organization_id = p_org
    -- Arşiv listede yok (kendi sayfasında), iptal hiçbir yerde.
    and w.status <> 'cancelled' and w.status <> 'archived'
    and (
      p_desen is null
      or w.title ilike '%' || p_desen || '%'
      or w.customer_name ilike '%' || p_desen || '%'
    )
    and (
      p_sorumlu is null
      or (p_sorumlu = 'atanmamis' and w.assigned_employee_id is null)
      or w.assigned_employee_id::text = p_sorumlu
    )
$$;

/*
  İş şeridi: toplam, termini geçen (tamamlanmamış), yeni müşteri mesajı
  olan ve durum başına sayılar — sayfanın bugün ayrı ayrı saydığı küme.
  p_bugun Türkiye günü, uygulamadan (todayIstanbul).
*/
create or replace function public.operasyon_is_serit(p_org uuid, p_desen text, p_sorumlu text, p_bugun date)
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object(
    'tum', count(*),
    'geciken', count(*) filter (where w.status <> 'completed' and w.due_date < p_bugun),
    'okunmamis', count(*) filter (where w.okunmamis_mesaj > 0),
    'durumlar', coalesce((
      select jsonb_object_agg(d.status, d.adet)
      from (
        select x.status, count(*) as adet
        from public.operasyon_is_suz(p_org, p_desen, p_sorumlu) x
        group by x.status
      ) d
    ), '{}'::jsonb)
  )
  from public.operasyon_is_suz(p_org, p_desen, p_sorumlu) w
$$;

