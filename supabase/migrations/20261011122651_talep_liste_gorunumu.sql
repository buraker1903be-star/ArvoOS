/*
  TALEP LİSTESİ: GÖRÜNÜM VE ÖZET.

  Dört büyük listeden sonuncusu (teklif 20261010210835, sözleşme
  20261011081708, iş 20261011085634). Talepler sayfası kurumun bütün
  fırsat kayıtlarını çekip bellekte süzüyor; kart da aynı diziden
  sayıyor. Talep tablosu dördünün en çok büyüyeni: her gelen istek bir
  satır.

  GÖRÜNÜM arama için: telefon rakam anahtarı, hizmet türü (JSON
  içinden) ve TEMSİLCİ ADI tek düz yüzeyde. Ad fırsat kaydında değil
  personel tablosunda; PostgREST tek bir `or` içinde iki tabloyu
  birleştiremiyor.

  SON YORUM ZAMANI yan sorguyla: "notsuz aktif talep" sayacı bunu
  istiyor ve yorum tablosunu listeyle birlikte okumak, kayıt sayısı
  büyüdükçe en pahalı adım oluyordu.

  AŞAMA KÜMELERİ PARAMETRE: "aktif" (lead, qualified) ve "ilerleyen"
  (proposal, contract, won) kuralı TypeScript'te yaşıyor. SQL'e
  kopyalamak, iki yerde iki ayrı tanım demekti; işlev kümeleri
  çağırandan alıyor.

  GÜVENLİK: security_invoker; RLS çağıranın kendi yetkisiyle işliyor.
*/

create or replace view public.crm_talep_liste
with (security_invoker = true, security_barrier = true) as
  select
    o.id,
    o.organization_id,
    o.title,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    private.arvo_search_digits(o.contact_phone) as telefon_rakamlari,
    o.stage,
    o.estimated_value,
    o.expected_close_date,
    o.source,
    o.notes,
    o.request_details,
    nullif(btrim(coalesce(o.request_details ->> 'service_type', '')), '') as hizmet_turu,
    o.assigned_employee_id,
    p.full_name as temsilci_adi,
    o.lost_reason,
    o.created_at,
    o.updated_at,
    y.son_yorum_at
  from public.crm_opportunities o
  left join public.hr_employees p on p.id = o.assigned_employee_id
  left join lateral (
    select max(c.created_at) as son_yorum_at
    from public.crm_internal_comments c
    where c.opportunity_id = o.id
  ) y on true;

revoke all on public.crm_talep_liste from public, anon;
grant select on public.crm_talep_liste to authenticated, service_role;

create or replace function public.crm_talep_istatistikleri(
  p_organization_id uuid,
  p_aktif text[],
  p_ilerleyen text[]
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with hepsi as (
    select * from public.crm_talep_liste where organization_id = p_organization_id
  ),
  aktif as (
    select * from hepsi where stage = any(p_aktif)
  ),
  hizmetler as (
    select coalesce(hizmet_turu, 'Belirtilmedi') as ad, count(*) as adet
    from hepsi group by 1 order by adet desc, ad limit 5
  ),
  kaynaklar as (
    select coalesce(nullif(btrim(source), ''), 'belirtilmedi') as ad, count(*) as adet
    from hepsi group by 1 order by adet desc, ad limit 4
  )
  select jsonb_build_object(
    'toplam', (select count(*) from hepsi),
    'son30', (select count(*) from hepsi where created_at >= now() - interval '30 days'),
    'onceki30', (select count(*) from hepsi
                 where created_at >= now() - interval '60 days'
                   and created_at < now() - interval '30 days'),
    'ilerleyen', (select count(*) from hepsi where stage = any(p_ilerleyen)),
    'kaybedilen', (select count(*) from hepsi where stage = 'lost'),
    'aktif', (select count(*) from aktif),
    'atanmamis', (select count(*) from aktif where assigned_employee_id is null),
    /* Notsuz aktif talep: hiç iç yorum girilmemiş olan. Asıl sinyal
       yorumun YOKLUĞU — kimsenin takip etmediği kayıt. */
    'notsuz', (select count(*) from aktif where son_yorum_at is null),
    /* Aktif taleplerin ortalama yaşı, GÜN. Türkiye saatiyle: UTC'ye
       göre hesaplanan gün farkı gece yarısından sonra bir gün
       kayıyordu. */
    'ortalama_yas', coalesce((
      select round(avg(
        (timezone('Europe/Istanbul', now()))::date - (timezone('Europe/Istanbul', created_at))::date
      )) from aktif), 0),
    'hizmetler', coalesce((select jsonb_agg(jsonb_build_object('ad', ad, 'adet', adet)) from hizmetler), '[]'::jsonb),
    'kaynaklar', coalesce((select jsonb_agg(jsonb_build_object('ad', ad, 'adet', adet)) from kaynaklar), '[]'::jsonb),
    'temsilciler', coalesce((select jsonb_agg(distinct assigned_employee_id)
                             from hepsi where assigned_employee_id is not null), '[]'::jsonb)
  )
$$;

revoke all on function public.crm_talep_istatistikleri(uuid, text[], text[]) from public, anon;
grant execute on function public.crm_talep_istatistikleri(uuid, text[], text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
