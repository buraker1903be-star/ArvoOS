/*
  FİNANS GENEL BAKIŞ: GÜNLÜK TAHSİLAT VE SÖZLEŞME MALİYETİ.

  Sayfada iki sınırsız okuma kalmıştı:

  1. Son 14 günün tahsilatı KAYIT KAYIT çekiliyordu; grafik gün gün
     çizdiği için. Gün toplamı artık burada: cari_tahsilat_ozeti'ne
     `gunluk` eklendi (son 2×14 gün). Pencere iki haftalık olsa da
     yoğun bir kurumda satır tavanına çarpabilir ve çubuklar sessizce
     eksilir (AGENTS.md "Rakam denetimi").

  2. Maliyet kalemleri kurumun TAMAMI için çekilip bellekte sözleşme
     başına toplanıyordu (ortalama kâr oranı için). Kalem sayısı
     sözleşme sayısının katı; toplama artık veritabanında, sonuç
     sözleşme başına tek satır.

  Taksitler bilerek DOKUNULMADI: tahsilat merdiveni ilk taksitten
  başlayarak dağıtılıyor (lib taksitleriDagit), yani ödenmiş taksitler
  de gerekiyor. "Ödenmişleri süzelim" demek, kalan tutarları ve vadesi
  geçen toplamını sessizce yanlış hesaplamak olurdu.

  DURUM KÜMESİ PARAMETRE: "imzalı sayılan sözleşme" kuralı
  TypeScript'te yaşıyor; SQL'e kopyalanmadı.

  GÜVENLİK: ikisi de invoker. Maliyet kalemleri RLS'te yetkiye bağlı;
  sayfa da yalnızca maliyeti görebilene soruyor (finance.maliyet.yonet).
*/

create or replace function public.cari_tahsilat_ozeti(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with tahsilat as (
    select e.amount, e.transaction_date
    from public.account_entries e
    where e.organization_id = p_organization_id and e.entry_type = 'credit'
  ),
  aylik as (
    select to_char(transaction_date, 'YYYY-MM') as ay, count(*) as adet, sum(amount) as toplam
    from tahsilat
    where transaction_date >= (date_trunc('month', timezone('Europe/Istanbul', now())) - interval '5 months')::date
    group by 1
  ),
  /* Günlük: grafiğin penceresi 14 gün, önceki dönem kıyası için 28.
     transaction_date bir TARİH (saat yok), bu yüzden gün dönüşümü
     gerekmiyor — kayıt hangi güne yazıldıysa o güne düşüyor. */
  gunluk as (
    select transaction_date as gun, count(*) as adet, sum(amount) as toplam
    from tahsilat
    where transaction_date > (timezone('Europe/Istanbul', now()))::date - 28
    group by 1
  )
  select jsonb_build_object(
    'son30', coalesce((select sum(amount) from tahsilat
                       where transaction_date > (timezone('Europe/Istanbul', now()))::date - 30), 0),
    'onceki30', coalesce((select sum(amount) from tahsilat
                          where transaction_date > (timezone('Europe/Istanbul', now()))::date - 60
                            and transaction_date <= (timezone('Europe/Istanbul', now()))::date - 30), 0),
    'aylik', coalesce((select jsonb_agg(jsonb_build_object('ay', ay, 'adet', adet, 'toplam', toplam) order by ay)
                       from aylik), '[]'::jsonb),
    'gunluk', coalesce((select jsonb_agg(jsonb_build_object(
                          'gun', to_char(gun, 'YYYY-MM-DD'), 'adet', adet, 'toplam', toplam) order by gun)
                        from gunluk), '[]'::jsonb)
  )
$$;

revoke all on function public.cari_tahsilat_ozeti(uuid) from public, anon;
grant execute on function public.cari_tahsilat_ozeti(uuid) to authenticated, service_role;

create or replace function public.sozlesme_maliyet_toplamlari(
  p_organization_id uuid,
  p_durumlar text[]
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'maliyet', maliyet)), '[]'::jsonb)
  from (
    select c.id, sum(k.amount) as maliyet
    from public.crm_contracts c
    join public.contract_cost_items k on k.contract_id = c.id
    where c.organization_id = p_organization_id and c.status = any(p_durumlar)
    group by c.id
  ) t
$$;

revoke all on function public.sozlesme_maliyet_toplamlari(uuid, text[]) from public, anon;
grant execute on function public.sozlesme_maliyet_toplamlari(uuid, text[]) to authenticated, service_role;

notify pgrst, 'reload schema';
