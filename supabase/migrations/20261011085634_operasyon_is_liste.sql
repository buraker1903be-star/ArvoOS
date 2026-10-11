/*
  İŞLER LİSTESİ: GÖRÜNÜM VE ÖZET.

  Teklif ve sözleşme listeleriyle aynı dönüşüm. İşler sayfası kurumun
  bütün işlerini (arşivdekiler dahil) adımlarıyla birlikte çekiyor,
  sonra sözleşme bağlantısını, müşteri iletişimini, okunmamış mesaj
  sayısını ve ödenmiş faturaları AYRI sorgularla okuyup hepsini
  bellekte birleştiriyor. Süzgeçler, şerit sayıları ve kartın sayıları
  hep o diziden.

  OPERASYONUN KISITLI YÜZEYİ KORUNUYOR: sözleşme ve müşteri bilgisi
  ops_contracts / ops_opportunities görünümlerinden okunuyor, çünkü
  operasyon personeli tutar görmemeli (20261001143617). Bu görünüm
  onların yerine geçmiyor, üstlerine biniyor.

  Adım sayıları ve okunmamış mesaj sayısı yan sorgularla (lateral):
  her iş için tek satır, listede ikinci sorgu kalmıyor.

  GÜVENLİK: security_invoker — RLS çağıranın kendi yetkisiyle işliyor.
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
    coalesce(adim.toplam, 0) as adim_toplam,
    coalesce(adim.tamam, 0) as adim_tamam,
    coalesce(mesaj.okunmamis, 0) as okunmamis_mesaj,
    sozlesme.opportunity_id,
    sozlesme.invoice_id,
    musteri.contact_phone,
    musteri.contact_email
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

/*
  ÖZET. Kart arşivdeki işleri de sayıyor (zamanında teslim ve aylık
  teslim onlarsız eksik kalır), liste ise göstermiyor — bu yüzden
  sayılar iki kümeden: "hepsi" (iptal hariç) ve "aktif" (arşiv ve
  tamamlanan hariç).

  ZAMANINDA TESLİM günü Türkiye saatiyle karşılaştırılıyor: teslim
  damgası UTC, termin ise tarih. Gece 21:00'den sonra teslim edilen iş
  UTC'ye göre ertesi güne düşüp "geç" sayılıyordu.
*/
create or replace function public.operasyon_is_istatistikleri(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with hepsi as (
    select * from public.operasyon_is_liste
    where organization_id = p_organization_id and status <> 'cancelled'
  ),
  aktif as (
    select * from hepsi where status not in ('completed', 'archived')
  ),
  teslimli as (
    select (timezone('Europe/Istanbul', delivered_at))::date <= due_date as zamaninda
    from hepsi where delivered_at is not null and due_date is not null
  ),
  aylik as (
    select to_char(timezone('Europe/Istanbul', delivered_at), 'YYYY-MM') as ay, count(*) as adet
    from hepsi
    where delivered_at >= timezone(
      'Europe/Istanbul',
      date_trunc('month', timezone('Europe/Istanbul', now())) - interval '5 months'
    )
    group by 1
  ),
  sorumlu as (
    select assigned_employee_id, count(*) as adet
    from aktif group by 1 order by adet desc limit 5
  )
  select jsonb_build_object(
    'toplam', (select count(*) from hepsi),
    'arsiv', (select count(*) from hepsi where status = 'archived'),
    'son30', (select count(*) from hepsi where created_at >= now() - interval '30 days'),
    'onceki30', (select count(*) from hepsi
                 where created_at >= now() - interval '60 days'
                   and created_at < now() - interval '30 days'),
    'teslimli', (select count(*) from teslimli),
    'zamaninda', (select count(*) from teslimli where zamaninda),
    'adim_toplam', coalesce((select sum(adim_toplam) from aktif), 0),
    'adim_tamam', coalesce((select sum(adim_tamam) from aktif), 0),
    'musteri_bekleyen', (select count(*) from aktif where waiting_party in ('customer', 'third_party')),
    'okunmamis_is', (select count(*) from hepsi where status <> 'archived' and okunmamis_mesaj > 0),
    'aylik', coalesce((select jsonb_agg(jsonb_build_object('ay', ay, 'adet', adet, 'toplam', 0) order by ay)
                       from aylik), '[]'::jsonb),
    'sorumlular', coalesce((select jsonb_agg(jsonb_build_object('personel', assigned_employee_id, 'adet', adet))
                            from sorumlu), '[]'::jsonb)
  )
$$;

revoke all on function public.operasyon_is_istatistikleri(uuid) from public, anon;
grant execute on function public.operasyon_is_istatistikleri(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
