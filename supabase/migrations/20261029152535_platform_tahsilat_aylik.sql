/*
  PLATFORM TAHSİLATI AY AY (29.10.2026, konsolun Tahsilat ekranı).

  Tahsilat ekranında yalnızca toplam ve "bu ay" vardı
  (platform_tahsilat_ozeti); kurucu gelirin aydan aya nasıl gittiğini
  ve kapıda ne kadar para beklediğini göremiyordu. Bu sayılar ekranda
  hesaplanamaz: liste son elli kayıt, ondan toplanan bir ay "son elli
  kaydın içindeki ay" olur (check:rakamlar).

  Üç seri, son p_ay ay, Türkiye ayıyla (sunucu UTC; ayın ilk gecesi
  00:00–03:00 arasındaki ödeme önceki aya düşmesin):
   - tahsilat: onaylı kurum ödemeleri (havale + kart) ve bireysel abone
     ödemeleri. Kural platform_tahsilat_ozeti ile AYNI: Arvo'nun kendi
     kurumu ve grup markaları gelir değil.
   - bekleyen: onay bekleyen havale bildirimleri, bildirildiği ay.
   - proforma: ödenmemiş ve süresi geçmemiş proformalar, düzenlendiği
     ay. Süresi geçen proforma beklenen para değil; iptal de öyle.

  Tutarlar kuruş; para birimi ayrımı yapılmıyor (ekran birim karışıksa
  zaten uyarıyor, özet işleviyle aynı).

  Proforma tablosu istemciye kapalı (RLS): işlev invoker ve yalnızca
  service_role'e açık; konsol onu sunucu anahtarıyla, kurucuyu
  doğruladıktan sonra çağırıyor.
*/
create or replace function public.platform_tahsilat_aylik(p_ay integer default 12)
returns table(ay date, tahsilat bigint, tahsilat_adet integer, bekleyen bigint, bekleyen_adet integer, proforma bigint, proforma_adet integer)
language sql
stable
set search_path to ''
as $function$
  with aylar as (
    select (date_trunc('month', timezone('Europe/Istanbul', now())) - make_interval(months => g))::date as ay
    from generate_series(0, greatest(least(coalesce(p_ay, 12), 36), 1) - 1) g
  ),
  musteri as (
    select id from public.organizations
    where coalesce(kind, 'customer') <> 'internal' and not grup_markasi
  ),
  gelen as (
    select r.amount, date_trunc('month', timezone('Europe/Istanbul', r.reviewed_at))::date as ay
    from public.organization_payment_requests r
    join musteri m on m.id = r.organization_id
    where r.status = 'approved' and r.reviewed_at is not null
    union all
    select s.amount, date_trunc('month', timezone('Europe/Istanbul', s.paid_at))::date
    from public.subscriber_payments s
    where s.paid_at is not null
  ),
  bekleyen as (
    select r.amount, date_trunc('month', timezone('Europe/Istanbul', r.created_at))::date as ay
    from public.organization_payment_requests r
    join musteri m on m.id = r.organization_id
    where r.status = 'pending'
  ),
  proforma as (
    select p.toplam as amount, date_trunc('month', p.duzenleme_tarihi)::date as ay
    from public.platform_proformalari p
    where p.durum = 'bekliyor'
      and p.gecerlilik_tarihi >= timezone('Europe/Istanbul', now())::date
      and (p.organization_id is null or p.organization_id in (select id from musteri))
  )
  select a.ay,
    coalesce((select sum(amount) from gelen g where g.ay = a.ay), 0)::bigint,
    (select count(*) from gelen g where g.ay = a.ay)::integer,
    coalesce((select sum(amount) from bekleyen b where b.ay = a.ay), 0)::bigint,
    (select count(*) from bekleyen b where b.ay = a.ay)::integer,
    coalesce((select sum(amount) from proforma p where p.ay = a.ay), 0)::bigint,
    (select count(*) from proforma p where p.ay = a.ay)::integer
  from aylar a
  order by a.ay
$function$;

revoke all on function public.platform_tahsilat_aylik(integer) from public, anon, authenticated;
grant execute on function public.platform_tahsilat_aylik(integer) to service_role;
