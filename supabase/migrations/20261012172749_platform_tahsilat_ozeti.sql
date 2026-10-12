/*
  PLATFORM TAHSİLAT ÖZETİ — üç kanalın toplamı veritabanında.

  Abonelikler sayfası tahsilatı üç tablodan okuyor: onaylanmış havale
  bildirimleri, kart ödeme günlüğü (billing_subscriptions — bir
  abonelik kütüğü DEĞİL, yalnızca arvo_record_paytr_payment'in
  yazdığı günlük) ve bireysel abone ödemeleri.

  Eskiden her sorguda `.limit(50)` vardı ve "Tahsil edildi" son 50
  kaydın toplamıydı: 51. ödemeden sonra rakam sessizce eksilmeye
  başlıyordu. Düzeltme olarak sınır kaldırılıp BÜTÜN kayıtlar
  okunmaya başlandı — doğru ama aynı hatanın daha büyük eşikli hâli:
  PostgREST'in satır tavanına çarpıldığı gün toplam yine sessizce
  eksilir, hem de Arvo'nun gelir ekranında.

  Toplam, sayı, bu ayın tahsilatı ve para birimleri artık burada;
  ekran yalnızca gösterdiği son yirmi satırı okuyor.

  SAYMA KURALLARI EKRANLA BİREBİR:
  - Kendi markalarımız (kind = 'internal') sayılmıyor: kendi
    kurumumuza kestiğimiz tahsilat Arvo'nun geliri değil.
  - Bireysel abone ödemelerinin kurumu yok, hepsi sayılıyor.
  - Toplam para birimlerini AYIRMIYOR (ekran da ayırmıyordu);
    karışıklık olursa `birimler` dizisi birden çok değer döndürüyor ve
    ekran uyarı basıyor. Karışmayı gizlemek yerine görünür tutuyoruz.
  - Ay sınırı Türkiye saatiyle: UTC'ye göre hesaplanan ay başı, ayın
    ilk günü gece yarısından sonraki tahsilatı önceki aya atardı.

  GÜVENLİK: security invoker. Üç tabloyu da bugün ekranın kendisi
  kullanıcı istemcisiyle okuyor; kapsamı aynı politikalar belirliyor.
*/

create or replace function public.platform_tahsilat_ozeti()
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with musteri as (
    select id from public.organizations where coalesce(kind, 'customer') <> 'internal'
  ),
  hepsi as (
    select r.amount, r.currency, r.reviewed_at as tarih
    from public.organization_payment_requests r
    join musteri m on m.id = r.organization_id
    where r.status = 'approved'
    union all
    select b.unit_amount as amount, b.currency, b.created_at as tarih
    from public.billing_subscriptions b
    join musteri m on m.id = b.organization_id
    union all
    select s.amount, s.currency, s.paid_at as tarih
    from public.subscriber_payments s
  )
  select jsonb_build_object(
    'adet', (select count(*) from hepsi),
    'toplam', coalesce((select sum(amount) from hepsi), 0),
    'bu_ay', coalesce((select sum(amount) from hepsi
                       where tarih is not null
                         and timezone('Europe/Istanbul', tarih)
                             >= date_trunc('month', timezone('Europe/Istanbul', now()))), 0),
    'birimler', coalesce((select jsonb_agg(distinct coalesce(nullif(btrim(currency), ''), 'TRY')) from hepsi), '[]'::jsonb)
  )
$$;

revoke all on function public.platform_tahsilat_ozeti() from public, anon;
grant execute on function public.platform_tahsilat_ozeti() to authenticated, service_role;

notify pgrst, 'reload schema';
