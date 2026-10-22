/*
  ANALİTİK CANLI EKRANI: HARİTA VE YENİ DÜZEN (22.10.2026).

  Kurum sahibinin isteği: canlı ekranda harita ve daha elverişli bir
  düzen. analitik_canli'ye eklenenler:
    - noktalar: 'dakika' (noktadaki son ziyaretten bu yana; harita yeni
      ziyareti parlak, eskisini soluk çiziyor) ve 'ulke'.
    - sonSaatZiyaretci, sonSaatForm: üst şeritteki sayılar.
    - aktifSayfalar: son 5 dakikada açık olan sayfalar ("şu an ne
      okuyorlar").
    - kaynaklar: son bir saatte gelenlerin kaynağı — ziyaretçinin o
      saatteki İLK sayfa açılışından (özet işleviyle aynı ilke; formun
      ve iç sayfanın yönlendireni sitenin kendisidir).
  Gövde 20261022092820'deki işlevden türetildi; yetki denetimi aynı.
*/
create or replace function public.analitik_canli(p_site uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_org uuid;
begin
  select s.organization_id into v_org from public.analitik_siteler s where s.id = p_site;
  if v_org is null or not private.analitik_erisimi(v_org) then
    raise exception 'Bu sitenin analitiğini görme yetkiniz yok.' using errcode = '42501';
  end if;

  return (
    with saat as (
      select * from public.analitik_olaylar o
      where o.site_id = p_site and o.created_at > now() - interval '1 hour'
    ),
    giris as (
      select distinct on (ziyaretci) ziyaretci, kaynak
      from saat where tur = 'sayfa' order by ziyaretci, created_at
    )
    select jsonb_build_object(
      'suAn', (select count(distinct ziyaretci) from saat where created_at > now() - interval '5 minutes'),
      'sonSaat', (select count(*) from saat where tur = 'sayfa'),
      'sonSaatZiyaretci', (select count(distinct ziyaretci) from saat),
      'sonSaatForm', (select count(*) from saat where tur = 'form'),
      'akis', coalesce((select jsonb_agg(jsonb_build_object(
            'zaman', t.created_at, 'tur', t.tur, 'yol', t.yol, 'kaynak', t.kaynak,
            'ulke', t.ulke, 'sehir', t.sehir, 'cihaz', t.cihaz) order by t.created_at desc)
          from (select * from saat where created_at > now() - interval '30 minutes'
                order by created_at desc limit 50) t), '[]'::jsonb),
      'aktifSayfalar', coalesce((select jsonb_agg(jsonb_build_object('ad', t.yol, 'adet', t.n) order by t.n desc, t.yol)
          from (select yol, count(distinct ziyaretci) as n from saat
                where tur = 'sayfa' and created_at > now() - interval '5 minutes'
                group by yol order by 2 desc, 1 limit 8) t), '[]'::jsonb),
      'kaynaklar', coalesce((select jsonb_agg(jsonb_build_object('ad', t.kaynak, 'adet', t.n) order by t.n desc, t.kaynak)
          from (select kaynak, count(*) as n from giris group by kaynak order by 2 desc, 1 limit 8) t), '[]'::jsonb),
      'noktalar', coalesce((select jsonb_agg(jsonb_build_object(
            'enlem', t.enlem, 'boylam', t.boylam, 'sehir', t.sehir, 'ulke', t.ulke, 'adet', t.n, 'dakika', t.dakika)
            order by t.n desc)
          from (select round(enlem::numeric, 1)::float8 as enlem, round(boylam::numeric, 1)::float8 as boylam,
                       max(sehir) as sehir, max(ulke) as ulke, count(distinct ziyaretci) as n,
                       floor(extract(epoch from now() - max(created_at)) / 60)::int as dakika
                from saat
                where enlem is not null and boylam is not null
                group by 1, 2) t), '[]'::jsonb)
    )
  );
end $$;

revoke all on function public.analitik_canli(uuid) from public, anon;
grant execute on function public.analitik_canli(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
