/*
  PANEL KABUĞU TEK ÇAĞRIDA (13.10.2026, hızlandırma).

  Ölçüm (yavaş sorgu günlüğü, lib/supabase/zamanli-fetch): kendi başına
  milisaniyeler sürmesi gereken TEK SATIRLIK okumalar (kendi personel
  kaydım, çevrimiçi ekip, lisanslar) canlıda ortalama 0,5–0,8 sn, en
  kötü 4,5 sn sürüyordu. Sorgular yavaş değildi, SIRADAYDI: panel
  yerleşimi her sayfa açılışında veritabanına aynı anda 14 ayrı istek
  atıyordu (bildirim sayısı, personel kaydı, gizlilik sözleşmesi,
  lisanslar, okunmamış posta, çevrimiçi ekip, ekip adları, kendi
  görünürlük tercihim ve mesaj çekmecesinin dört okuması); sayfanın
  kendi sorgularıyla birlikte 25'i buluyor, bağlantı havuzu dar olduğu
  için kuyruğa giriyordu.

  Bu işlev aynı okumaları TEK gidiş-dönüşte yapar. SECURITY INVOKER:
  her parça çağıranın yetkisiyle, bugünkü RLS kurallarıyla çalışır —
  sonuç ayrı ayrı istekle alınanla birebir aynı, yalnızca gidiş-dönüş
  sayısı düşüyor. Çağıran (app/panel/layout.tsx) işlev yoksa eski yoldan
  devam eder.

  p_kurucu: platform sahibi (arvo-os owner) — bildirim sayısı kurucu
  kitlesinden. p_posta: ortak kutuyu görme yetkisi (posta.gor; karar
  sunucuda, yetenek kataloğunda). p_mesaj: Mesajlar modülü açık.
  p_esik: "çevrimiçi" sayılmak için son görülme sınırı.
*/

create or replace function public.arvo_panel_kabugu(
  p_org uuid, p_kurucu boolean, p_posta boolean, p_mesaj boolean, p_esik timestamptz
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ben uuid := (select auth.uid());
  v jsonb;
begin
  if v_ben is null then
    return null;
  end if;

  v := jsonb_build_object(
    'bildirim', case
      when p_kurucu then (select count(*) from public.notifications n where n.read_at is null and n.audience = 'founder')
      else public.arvo_unread_notification_count(p_org)
    end,
    'personel', (
      select jsonb_build_object('id', e.id, 'full_name', e.full_name)
      from public.hr_employees e where e.organization_id = p_org and e.user_id = v_ben limit 1
    ),
    'gizlilik', (
      select a.id from public.hr_confidentiality_agreements a
      join public.hr_employees e on e.id = a.employee_id
      where a.organization_id = p_org and e.user_id = v_ben and a.status = 'pending'
      order by a.created_at desc limit 1
    ),
    'lisanslar', coalesce((
      select jsonb_agg(l.product) from public.organization_product_licenses l
      where l.organization_id = p_org and l.status in ('active', 'trialing', 'past_due')
    ), '[]'::jsonb),
    'posta_okunmamis', case when p_posta then (
      select count(*) from public.mail_threads t
      where t.organization_id = p_org and t.okunmamis and t.silindi_at is null
    ) else 0 end,
    'varlik', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'last_seen_at', u.last_seen_at))
      from public.user_presence u
      where u.organization_id = p_org and u.last_seen_at >= p_esik and not u.gizli
    ), '[]'::jsonb),
    'ekip', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', x.user_id, 'full_name', x.full_name))
      from (
        select e.user_id, e.full_name from public.hr_employees e
        where e.organization_id = p_org and e.user_id is not null limit 300
      ) x
    ), '[]'::jsonb),
    'kendi_gizli', coalesce((
      select u.gizli from public.user_presence u where u.organization_id = p_org and u.user_id = v_ben limit 1
    ), false)
  );

  if p_mesaj then
    v := v || jsonb_build_object('mesaj', jsonb_build_object(
      'kisiler', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', e.user_id, 'full_name', e.full_name, 'job_title', e.job_title) order by e.full_name)
        from public.hr_employees e
        where e.organization_id = p_org and e.employment_status = 'active' and e.user_id is not null
      ), '[]'::jsonb),
      'kanallar', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id, 'name', c.name, 'channel_type', c.channel_type, 'direct_key', c.direct_key,
          'is_private', c.is_private, 'created_by', c.created_by, 'last_message_at', c.last_message_at,
          'last_message_preview', c.last_message_preview, 'last_message_sender', c.last_message_sender
        ) order by c.last_message_at desc nulls last)
        from public.message_channels c where c.organization_id = p_org
      ), '[]'::jsonb),
      'varlik', coalesce((
        select jsonb_agg(jsonb_build_object('user_id', u.user_id, 'last_seen_at', u.last_seen_at))
        from public.user_presence u where u.organization_id = p_org and not u.gizli
      ), '[]'::jsonb),
      'okunmamis', coalesce((
        select jsonb_agg(jsonb_build_object('channel_id', r.channel_id, 'unread', r.unread))
        from public.arvo_message_unread_counts(p_org) r
      ), '[]'::jsonb)
    ));
  end if;

  return v;
end $$;

revoke all on function public.arvo_panel_kabugu(uuid, boolean, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.arvo_panel_kabugu(uuid, boolean, boolean, boolean, timestamptz) to authenticated;
