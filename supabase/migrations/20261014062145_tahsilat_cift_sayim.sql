/*
  TAHSİLAT İKİ KEZ SAYILIYORDU (14.10.2026).

  platform_tahsilat_ozeti üç "kanalı" topluyordu: onaylanmış ödeme
  istekleri, billing_subscriptions ("kart ödeme günlüğü") ve bireysel
  abone ödemeleri. Oysa billing_subscriptions ayrı bir kanal değil:
  satırını YALNIZCA aktivasyon işlevleri (arvo_activate_license_period /
  arvo_activate_product_period) yazıyor ve onları çağıran iki yolun ikisi
  de önce bir onaylı ödeme isteği bırakıyor:
    - PayTR (arvo_record_paytr_payment): 15.09.2026'dan beri aktivasyondan
      ÖNCE 'approved' bir organization_payment_requests satırı ekliyor;
    - havale onayı (review_bank_transfer_payment): onaylanan şey zaten
      ödeme isteğinin kendisi.
  Yani her kurum ödemesi iki kez toplanıyordu (havale 'manual', kart
  'paytr' sağlayıcısıyla). Kurum ödemesinin tek kaynağı artık onaylı
  ödeme isteği; kanalı payment_method söylüyor (havale / paytr).

  Gövde 20261012172749'dan; tek fark billing_subscriptions dalının
  çıkması.
*/

create or replace function public.platform_tahsilat_ozeti()
returns jsonb
language sql
stable
set search_path to ''
as $function$
  with musteri as (
    select id from public.organizations where coalesce(kind, 'customer') <> 'internal'
  ),
  hepsi as (
    select r.amount, r.currency, r.reviewed_at as tarih
    from public.organization_payment_requests r
    join musteri m on m.id = r.organization_id
    where r.status = 'approved'
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
$function$;

revoke all on function public.platform_tahsilat_ozeti() from public, anon;
grant execute on function public.platform_tahsilat_ozeti() to authenticated, service_role;
