/*
  BİLDİRİM LİSTESİ SUNUCUDA (13.10.2026).

  Bildirimler sayfası kişinin son 100 bildirimini çekip başlıkları,
  "okunmamış" süzgecini ve başlık sayılarını bellekte hesaplıyordu. 100'ü
  geçen biri eski bildirimlerine hiç ulaşamıyor, başlık çiplerindeki
  sayılar "son 100'ün içinden" kalıyordu (sayfa bunu "son 100 bildirimde"
  diye itiraf ediyordu). Listeler 11.10'da sunucuya geçmişti; bildirimler
  geride kalmıştı.

  arvo_bildirimler: kişinin gördüğü bildirimler, okunma bilgisi KİŞİYE
  göre (toplu bildirimde notification_user_reads), kaldırdıkları hariç.
  Başlık süzgeci kategori listesiyle PARAMETRE olarak geliyor
  (app/panel/notifications/filters.ts) — liste SQL'e kopyalanmıyor;
  p_diger = "listedekilerin dışındakiler". Sayfalama ve sıralama
  PostgREST'ten (.order/.range) işleve itiliyor: SET satırı yok, işlev
  satır içi açılabiliyor.

  arvo_bildirim_ozeti: kategori başına toplam / okunmamış / bugün gelen.
  AYNI işlevin üstünden — şerit ve çipler listeyle aynı kümeyi sayıyor.
  Okunmamış tanımı rozetin işleviyle (arvo_unread_notification_count)
  birebir; test ikisinin eşitliğini sabitliyor.

  İkisi de SECURITY INVOKER: notifications RLS'i (kurum üyesi, kendi ya da
  toplu bildirim) çağıranın yetkisiyle işliyor.
*/

create or replace function public.arvo_bildirimler(
  p_org uuid, p_kurucu boolean, p_kategoriler text[], p_diger boolean, p_okunmamis boolean
)
returns table (
  id uuid, title text, message text, category text, action_url text, user_id uuid,
  read_at timestamptz, created_at timestamptz, metadata jsonb
)
language sql
stable
security invoker
as $$
  select x.id, x.title, x.message, x.category, x.action_url, x.user_id, x.read_at, x.created_at, x.metadata
  from (
    select
      n.id, n.title, n.message, n.category, n.action_url, n.user_id,
      -- Toplu bildirimde (user_id boş) okundu bilgisi kişiye özel.
      case when n.audience = 'organization' and n.user_id is null
        then (select r.read_at from public.notification_user_reads r
              where r.notification_id = n.id and r.user_id = (select auth.uid()))
        else n.read_at end as read_at,
      n.created_at, n.metadata
    from public.notifications n
    where (
        (p_kurucu and n.audience = 'founder')
        or (not p_kurucu and n.audience = 'organization' and n.organization_id = p_org
            and (n.user_id is null or n.user_id = (select auth.uid())))
      )
      and not exists (
        select 1 from public.notification_user_dismissals d
        where d.notification_id = n.id and d.user_id = (select auth.uid())
      )
      and (
        p_kategoriler is null
        or (not p_diger and n.category = any (p_kategoriler))
        or (p_diger and n.category <> all (p_kategoriler))
      )
  ) x
  where not p_okunmamis or x.read_at is null
$$;

create or replace function public.arvo_bildirim_ozeti(p_org uuid, p_kurucu boolean, p_bugun timestamptz)
returns jsonb
language sql
stable
security invoker
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'kategori', s.category, 'adet', s.adet, 'okunmamis', s.okunmamis, 'bugun', s.bugun
  )), '[]'::jsonb)
  from (
    select b.category,
      count(*) as adet,
      count(*) filter (where b.read_at is null) as okunmamis,
      count(*) filter (where b.created_at >= p_bugun) as bugun
    from public.arvo_bildirimler(p_org, p_kurucu, null, false, false) b
    group by b.category
  ) s
$$;

revoke all on function public.arvo_bildirimler(uuid, boolean, text[], boolean, boolean) from public, anon;
grant execute on function public.arvo_bildirimler(uuid, boolean, text[], boolean, boolean) to authenticated;
revoke all on function public.arvo_bildirim_ozeti(uuid, boolean, timestamptz) from public, anon;
grant execute on function public.arvo_bildirim_ozeti(uuid, boolean, timestamptz) to authenticated;
