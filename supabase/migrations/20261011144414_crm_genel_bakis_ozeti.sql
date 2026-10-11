/*
  CRM GENEL BAKIŞ ÖZETİ.

  Sayfa kurumun BÜTÜN taleplerini, tekliflerini ve sözleşmelerini
  (zaman sınırı olmadan) çekip her sayıyı bellekte hesaplıyordu:
  atanmamış talep, bekleyen teklif değeri, süresi dolan, geciken
  sözleşme, bu ayın imzaları, 14 günlük grafik. Dört kartın her biri de
  aynı diziden ilk altı satırı alıyordu.

  Bu, 22.09.2026'da konsolda yaşanan hatanın sınıfı: PostgREST'in satır
  tavanına çarpıldığı gün sayılar sessizce eksiliyor, hiçbir belirti
  olmuyor (AGENTS.md "Rakam denetimi"). Listeler 11.10.2026'da
  sunucuya taşındı; genel bakış kartları geride kalmıştı.

  KÜMELER PARAMETRE: "teklif öncesi aşamalar" ve "imzalı sayılan
  durumlar" TypeScript'te yaşıyor (sayfanın NEW_STAGES'i, sözleşme
  durumları); SQL'e kopyalamak iki ayrı tanım demekti.

  GÜN VE AY SINIRI TÜRKİYE SAATİYLE: sunucu UTC'de çalışıyor, gece
  00:00–03:00 arası girilen talep aksi hâlde bir önceki güne düşerdi.
  Grafik dilimleri bu yüzden burada, Türkiye gününe göre toplanıyor;
  ekran yalnızca boş günleri dolduruyor (lib/gunluk-seri.ts).

  GÜVENLİK: security invoker — her sayı çağıranın RLS'iyle hesaplanıyor.
  Tutar görmemesi gereken personel zaten satırları göremiyor.
*/

create or replace function public.crm_genel_bakis_ozeti(
  p_organization_id uuid,
  p_yeni_asamalar text[],
  p_imzali text[],
  p_gun int default 14
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  with talepler as (
    select * from public.crm_opportunities where organization_id = p_organization_id
  ),
  teklifler as (
    select * from public.crm_proposals where organization_id = p_organization_id
  ),
  sozlesmeler as (
    select * from public.crm_contracts where organization_id = p_organization_id
  ),
  /* Müşteri yanıtı bekleyen teklif: gönderilmiş ve yerine yenisi
     geçmemiş olan (superseded_by). */
  bekleyen_teklif as (
    select * from teklifler where status = 'sent' and superseded_by is null
  ),
  bekleyen_sozlesme as (
    select * from sozlesmeler where status = 'sent'
  ),
  imzali as (
    select * from sozlesmeler where status = any(p_imzali) and signed_at is not null
  ),
  /* Grafik: son 2×p_gun Türkiye günü. Zaman damgası sınırı dizin
     kullanılsın diye ayrıca var (bir gün pay bırakıyor: Türkiye
     günü UTC'den önce başlıyor). */
  seri as (
    select (timezone('Europe/Istanbul', created_at))::date as gun, count(*) as adet
    from talepler
    where created_at >= now() - ((p_gun * 2 + 2) || ' days')::interval
      and (timezone('Europe/Istanbul', created_at))::date
          > (timezone('Europe/Istanbul', now()))::date - (p_gun * 2)
    group by 1
  )
  select jsonb_build_object(
    'yeni_talep', (select count(*) from talepler where stage = any(p_yeni_asamalar)),
    'atanmamis', (select count(*) from talepler
                  where stage = any(p_yeni_asamalar) and assigned_employee_id is null),
    'bekleyen_teklif', (select count(*) from bekleyen_teklif),
    /* Teklif değeri yalnızca TRY: ekranda tek para birimiyle yazılıyor,
       kurları toplamak yanlış bir tek sayı üretirdi. */
    'bekleyen_teklif_degeri', coalesce((select sum(amount) from bekleyen_teklif where currency = 'TRY'), 0),
    /* Süresi dolan: bugün dahil üç gün içinde biten VE geçmişte
       kalanlar (ekranda "Süresi doldu" rozetiyle ikisi de uyarı). */
    'suresi_dolan', (select count(*) from bekleyen_teklif
                     where valid_until is not null
                       and valid_until <= (timezone('Europe/Istanbul', now()))::date + 3),
    'bekleyen_sozlesme', (select count(*) from bekleyen_sozlesme),
    'geciken_sozlesme', (select count(*) from bekleyen_sozlesme
                         where sent_at is not null and sent_at <= now() - interval '7 days'),
    'imzali_toplam', (select count(*) from imzali),
    'bu_ay_imza', (select count(*) from imzali
                   where (timezone('Europe/Istanbul', signed_at))::date
                         >= date_trunc('month', (timezone('Europe/Istanbul', now()))::date)),
    'bu_ay_imza_degeri', coalesce((select sum(amount) from imzali
                                   where currency = 'TRY'
                                     and (timezone('Europe/Istanbul', signed_at))::date
                                         >= date_trunc('month', (timezone('Europe/Istanbul', now()))::date)), 0),
    'seri', coalesce((select jsonb_agg(jsonb_build_object('gun', to_char(gun, 'YYYY-MM-DD'), 'adet', adet)
                      order by gun) from seri), '[]'::jsonb)
  )
$$;

revoke all on function public.crm_genel_bakis_ozeti(uuid, text[], text[], int) from public, anon;
grant execute on function public.crm_genel_bakis_ozeti(uuid, text[], text[], int) to authenticated, service_role;

notify pgrst, 'reload schema';
