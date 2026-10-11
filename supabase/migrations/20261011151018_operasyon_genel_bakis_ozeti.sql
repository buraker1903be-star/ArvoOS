/*
  OPERASYON GENEL BAKIŞ ÖZETİ.

  Sayfa kurumun BÜTÜN aktif işlerini, her birinin aşamalarıyla birlikte
  (gömülü operation_steps) çekiyordu; panelin en ağır okuması buydu.
  Kartların sayıları da o diziden geliyordu: planlanan, atanmamış,
  süren, tıkalı, termini geçmiş/yakın, aşaması geçmiş/yakın ve 28
  günlük grafik. PostgREST'in satır tavanına çarpıldığı gün hepsi
  sessizce eksilir (AGENTS.md "Rakam denetimi").

  KÜMELER PARAMETRE: aktif durumlar ve "süren" kümesi TypeScript'te
  yaşıyor (ops-shared.tsx); SQL'e kopyalamak iki ayrı tanım demekti.
  'planned' ve 'blocked' tek birer DEĞER, küme değil: onlar burada
  yazılı — tek değeri de parametreye çevirmek işlevi okunmaz yapardı
  ve kuralın ikizi olmazdı.

  TERMİN PENCERESİ işin terminiyle aynı: bugüne kadar gecikmişler +
  önümüzdeki yedi gün. Gün sınırı Türkiye saatiyle; sunucu UTC'de
  çalıştığı için gece 00:00–03:00 arasında "bugün" bir gün geriye
  kayıyordu.

  GÜVENLİK: security invoker — RLS çağıranın yetkisiyle işliyor.
  Yönetici olmayan yalnızca kendi işlerini sayar.
*/

create or replace function public.operasyon_genel_bakis_ozeti(
  p_organization_id uuid,
  p_aktif text[],
  p_suren text[],
  p_gun int default 14
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
    select w.* from public.operation_workflows w
    where w.organization_id = p_organization_id and w.status = any(p_aktif)
  ),
  /* Aşamalar yalnızca AKTİF işlerden: biten işin açık kalmış adımı
     "yaklaşan aşama" değil. */
  asamalar as (
    select s.* from public.operation_steps s
    join isler i on i.id = s.workflow_id
    where s.is_completed = false and s.due_date is not null
  ),
  seri as (
    select (timezone('Europe/Istanbul', s.completed_at))::date as gun, count(*) as adet
    from public.operation_steps s
    where s.organization_id = p_organization_id
      and s.is_completed = true
      and s.completed_at >= now() - ((p_gun * 2 + 2) || ' days')::interval
      and (timezone('Europe/Istanbul', s.completed_at))::date
          > (timezone('Europe/Istanbul', now()))::date - (p_gun * 2)
    group by 1
  )
  select jsonb_build_object(
    'planlanan', (select count(*) from isler where status = 'planned'),
    'planlanan_atanmamis', (select count(*) from isler
                            where status = 'planned' and assigned_employee_id is null),
    'suren', (select count(*) from isler where status = any(p_suren)),
    'tikali', (select count(*) from isler where status = 'blocked'),
    'termin_gecmis', (select count(*) from isler, bugun
                      where due_date is not null and due_date < bugun.gun),
    'termin_yakin', (select count(*) from isler, bugun
                     where due_date is not null
                       and due_date >= bugun.gun and due_date <= bugun.gun + 7),
    'asama_gecmis', (select count(*) from asamalar, bugun where due_date < bugun.gun),
    'asama_yakin', (select count(*) from asamalar, bugun
                    where due_date >= bugun.gun and due_date <= bugun.gun + 7),
    'seri', coalesce((select jsonb_agg(jsonb_build_object('gun', to_char(gun, 'YYYY-MM-DD'), 'adet', adet)
                      order by gun) from seri), '[]'::jsonb)
  )
$$;

revoke all on function public.operasyon_genel_bakis_ozeti(uuid, text[], text[], int) from public, anon;
grant execute on function public.operasyon_genel_bakis_ozeti(uuid, text[], text[], int) to authenticated, service_role;


/*
  GÖRÜNÜME `updated_at` EKLENİYOR.

  Genel bakışın "Devam eden işler" kartı süren işleri termine göre
  sıralıyor, eşitlikte EN SON DOKUNULANI öne alıyor ve satırdaki "yeni"
  noktasını da ondan veriyor. Kart adım yüzdesini gösterdiği için
  tabloyu değil görünümü okuyor (adim_toplam/adim_tamam hazır); ama
  görünümde updated_at yoktu.

  Sütun SONA ekleniyor: `create or replace view` mevcut sütunların
  sırasını ve tipini değiştirmeye izin vermiyor, yalnızca sona ekleme
  yapılabiliyor.
*/

create or replace view public.operasyon_is_liste
with (security_invoker = true, security_barrier = true) as
  select
    w.id,
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
    musteri.contact_phone,
    musteri.contact_email,
    w.updated_at
  from public.operation_workflows w
  left join lateral (
    select count(*) as toplam, count(*) filter (where s.is_completed) as tamam
    from public.operation_steps s where s.workflow_id = w.id
  ) adim on true
  left join lateral (
    select count(*) as okunmamis
    from public.customer_file_messages m
    where m.workflow_id = w.id and m.sender_type = 'customer' and m.read_at is null
  ) mesaj on true
  left join public.ops_contracts sozlesme on sozlesme.id = w.contract_id
  left join public.ops_opportunities musteri on musteri.id = sozlesme.opportunity_id;

revoke all on public.operasyon_is_liste from public, anon;
grant select on public.operasyon_is_liste to authenticated, service_role;

notify pgrst, 'reload schema';
