/*
  LİSTE SÜZGECİ TEK TANIMDA, ŞERİT TEK ÇAĞRIDA (13.10.2026, hızlandırma).

  Talepler ve İşler sayfalarının üst şeridi (aşama/durum sayıları) her
  sayaç için AYRI bir sayım isteği atıyordu: talepte 8, işte 7. Sayfanın
  öteki istekleriyle aynı anda gittikleri için kuyruğa giriyor; tek
  başına 60–140 ms süren sayım sayfa içinde 170–280 ms sürüyordu
  (ölçüm: app/api/olcum).

  AGENTS.md: "şerit sayıları listeyle AYNI süzgeç kümesinden gelir".
  Sayaçları tek bir veritabanı işlevine toplamak süzgeci ikinci kez
  yazmak olurdu. Bunun yerine süzgecin KENDİSİ tek yere taşınıyor:

    crm_talep_suz / operasyon_is_suz  — süzgeçten geçen satırlar
      (arama, temsilci/sorumlu; görünümün bütün sütunları). Liste bu
      işlevden okunur; aşama/durum, sıralama ve sayfalama PostgREST'te
      bugünkü gibi zincirlenir.
    crm_talep_serit / operasyon_is_serit — şerit sayıları, AYNI işlevin
      üstünden tek çağrıda.

  Liste ve şerit aynı işlevi kullandığı için ikisinin ayrışması mümkün
  değil — kural bugünkünden daha sıkı korunuyor.

  SECURITY INVOKER (görünümler de invoker): RLS çağıranın yetkisiyle,
  bugünkü gibi. Arama deseni uygulamada temizleniyor (lib/liste-arama:
  virgül, parantez, %, _ boşluğa); PostgREST'in "ilike.*x*" süzgeciyle
  ILIKE '%x%' aynı şey.
*/

-- TALEPLER --------------------------------------------------------------------
create or replace function public.crm_talep_suz(p_org uuid, p_desen text, p_telefon text, p_temsilci text)
returns setof public.crm_talep_liste
language sql
stable
security invoker
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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

revoke all on function public.crm_talep_suz(uuid, text, text, text) from public, anon;
revoke all on function public.crm_talep_serit(uuid, text, text, text) from public, anon;
revoke all on function public.operasyon_is_suz(uuid, text, text) from public, anon;
revoke all on function public.operasyon_is_serit(uuid, text, text, date) from public, anon;
grant execute on function public.crm_talep_suz(uuid, text, text, text) to authenticated;
grant execute on function public.crm_talep_serit(uuid, text, text, text) to authenticated;
grant execute on function public.operasyon_is_suz(uuid, text, text) to authenticated;
grant execute on function public.operasyon_is_serit(uuid, text, text, date) to authenticated;
