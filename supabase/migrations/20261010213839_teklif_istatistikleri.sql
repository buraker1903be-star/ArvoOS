/*
  TEKLİF İSTATİSTİKLERİ VERİTABANINDA.

  Teklifler ekranının sağındaki kart (son 30 gün, kabul oranı, tipik
  tutar, yanıt bekleyen, son 6 ayın değeri, hizmet dağılımı) tüm
  teklifleri okumayı gerektiriyordu. Liste sayfalandıktan sonra geriye
  kalan tek sınırsız okuma buydu; PostgREST'in satır tavanına takılırsa
  sayılar sessizce eksiliyor (bu depoda üç ekranda yaşandı, bkz.
  npm run check:rakamlar). Sayım veritabanında yapılırsa tavan diye bir
  şey kalmıyor.

  Dönüş jsonb: ham sayılar. Etiketleme (ay adları, yüzde biçimi)
  TypeScript tarafında kalıyor — orada test ediliyor ve başka listeler
  de aynı biçimi kullanıyor.

  GÜVENLİK: security invoker. Fonksiyon crm_teklif_liste görünümünü
  okuyor, o da invoker; yani RLS çağıranın kendi yetkisiyle işliyor ve
  kullanıcı zaten göremediği bir teklifi sayıya katamıyor. İşlev
  public'ten alınıp yalnızca panelin ve sunucunun rolüne veriliyor.

  SAAT: ay sınırı Türkiye saatiyle. UTC'ye göre gruplayınca ayın son
  gecesi 21:00'den sonra açılan teklif bir sonraki aya düşüyor.
*/

create or replace function public.crm_teklif_istatistikleri(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with gecerli as (
    select
      l.amount,
      l.created_at,
      l.sent_at,
      l.teklif_grubu,
      l.assigned_employee_id,
      nullif(btrim(coalesce(l.request_details ->> 'service_type', '')), '') as hizmet,
      to_char(timezone('Europe/Istanbul', l.created_at), 'YYYY-MM') as ay
    from public.crm_teklif_liste l
    where l.organization_id = p_organization_id
      and l.teklif_grubu <> 'eski'
  ),
  aylik as (
    select ay, count(*) as adet, sum(amount) as toplam
    from gecerli
    where created_at >= timezone(
      'Europe/Istanbul',
      date_trunc('month', timezone('Europe/Istanbul', now())) - interval '5 months'
    )
    group by ay
  ),
  hizmetler as (
    select coalesce(hizmet, 'Belirtilmedi') as ad, count(*) as adet
    from gecerli
    group by 1
    order by adet desc, ad
    limit 5
  )
  select jsonb_build_object(
    'toplam', (select count(*) from gecerli),
    'son30', (select count(*) from gecerli where created_at >= now() - interval '30 days'),
    'onceki30', (select count(*) from gecerli
                 where created_at >= now() - interval '60 days'
                   and created_at < now() - interval '30 days'),
    'kabul', (select count(*) from gecerli where teklif_grubu = 'accepted'),
    'karara', (select count(*) from gecerli where teklif_grubu in ('accepted', 'rejected', 'expired')),
    /* Ortanca, ortalama DEĞİL: canlıda tek bir hatalı kayıt (₺5,4
       milyonluk teklif) ortalamayı ₺36 binden ₺121 bine çekmişti. */
    'ortanca', coalesce((select round(percentile_cont(0.5) within group (order by amount)) from gecerli), 0),
    'bekleyen', (select count(*) from gecerli where teklif_grubu = 'sent'),
    'bekleyen_gec', (select count(*) from gecerli
                     where teklif_grubu = 'sent' and sent_at is not null
                       and sent_at <= now() - interval '7 days'),
    'aktif_deger', coalesce((select sum(amount) from gecerli where teklif_grubu in ('draft', 'sent')), 0),
    'aylik', coalesce((select jsonb_agg(jsonb_build_object('ay', ay, 'adet', adet, 'toplam', toplam) order by ay)
                       from aylik), '[]'::jsonb),
    'hizmetler', coalesce((select jsonb_agg(jsonb_build_object('ad', ad, 'adet', adet)) from hizmetler), '[]'::jsonb),
    /* Temsilci süzgecinin seçenekleri: listede adı geçen herkes.
       Ayrı bir "distinct" sorgusu PostgREST'te yok. */
    'temsilciler', coalesce((select jsonb_agg(distinct assigned_employee_id)
                             from gecerli where assigned_employee_id is not null), '[]'::jsonb)
  )
$$;

revoke all on function public.crm_teklif_istatistikleri(uuid) from public, anon;
grant execute on function public.crm_teklif_istatistikleri(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
