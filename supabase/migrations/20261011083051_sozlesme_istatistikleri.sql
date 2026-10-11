/*
  SÖZLEŞME İSTATİSTİKLERİ VERİTABANINDA.

  Teklif tarafıyla aynı gerekçe (bkz. 20261010213839): sağdaki kart
  (son 30 gün, imzalanma oranı, ortalama imza süresi, imza bekleyen,
  son 6 ayın imzalanan değeri, hizmet dağılımı) tüm sözleşmeleri
  okumayı gerektiriyordu; liste sayfalandıktan sonra geriye kalan tek
  sınırsız okuma bu olurdu.

  İMZA SÜRESİ gün KESİRLİ: çoğu sözleşme gönderildiği gün
  imzalanıyor, tam güne yuvarlanınca kart "0 gün" yazıyordu.

  GÜVENLİK: security invoker; crm_sozlesme_liste görünümü de invoker,
  yani çağıranın göremediği sözleşme sayıya girmiyor.

  SAAT: ay sınırı Türkiye saatiyle (UTC'de ayın son gecesi 21:00
  sonrası imzalanan sözleşme bir sonraki aya düşer).
*/

create or replace function public.crm_sozlesme_istatistikleri(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with hepsi as (
    select
      l.amount, l.created_at, l.sent_at, l.signed_at, l.sozlesme_grubu, l.assigned_employee_id,
      nullif(btrim(coalesce(l.request_details ->> 'service_type', '')), '') as hizmet,
      to_char(timezone('Europe/Istanbul', l.signed_at), 'YYYY-MM') as imza_ayi
    from public.crm_sozlesme_liste l
    where l.organization_id = p_organization_id
  ),
  imzalanan as (
    select * from hepsi where sozlesme_grubu in ('imzali', 'operasyonda', 'tamam')
  ),
  aylik as (
    select imza_ayi as ay, count(*) as adet, sum(amount) as toplam
    from imzalanan
    where signed_at >= timezone(
      'Europe/Istanbul',
      date_trunc('month', timezone('Europe/Istanbul', now())) - interval '5 months'
    )
    group by imza_ayi
  ),
  hizmetler as (
    select coalesce(hizmet, 'Belirtilmedi') as ad, count(*) as adet
    from hepsi group by 1 order by adet desc, ad limit 5
  )
  select jsonb_build_object(
    'toplam', (select count(*) from hepsi),
    'son30', (select count(*) from hepsi where created_at >= now() - interval '30 days'),
    'onceki30', (select count(*) from hepsi
                 where created_at >= now() - interval '60 days'
                   and created_at < now() - interval '30 days'),
    'imzalanan', (select count(*) from imzalanan),
    'kapanan', (select count(*) from hepsi where sozlesme_grubu in ('rejected', 'cancelled')),
    'imza_suresi_gun', (select avg(greatest(0, extract(epoch from (signed_at - sent_at)) / 86400.0))
                        from imzalanan where sent_at is not null and signed_at is not null),
    'imza_suresi_adet', (select count(*) from imzalanan where sent_at is not null and signed_at is not null),
    'imza_bekleyen', (select count(*) from hepsi where sozlesme_grubu = 'sent'),
    'imza_bekleyen_gec', (select count(*) from hepsi
                          where sozlesme_grubu = 'sent' and sent_at is not null
                            and sent_at <= now() - interval '7 days'),
    'aktif_deger', coalesce((select sum(amount) from hepsi
                             where sozlesme_grubu in ('draft', 'sent', 'imzali')), 0),
    'aylik', coalesce((select jsonb_agg(jsonb_build_object('ay', ay, 'adet', adet, 'toplam', toplam) order by ay)
                       from aylik), '[]'::jsonb),
    'hizmetler', coalesce((select jsonb_agg(jsonb_build_object('ad', ad, 'adet', adet)) from hizmetler), '[]'::jsonb),
    'temsilciler', coalesce((select jsonb_agg(distinct assigned_employee_id)
                             from hepsi where assigned_employee_id is not null), '[]'::jsonb)
  )
$$;

revoke all on function public.crm_sozlesme_istatistikleri(uuid) from public, anon;
grant execute on function public.crm_sozlesme_istatistikleri(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
