-- ============================================================
-- PROJE: ArvoOS (oahshpkgdzrraqdzjqau)
--
-- WhatsApp gelen kutusu sayımı veritabanına taşınıyor.
--
-- lib/whatsapp-inbox.ts listConversations() kurumun SON 300 MESAJINI çekip
-- uygulamada sohbetlere bölüyordu. Üç sonucu vardı:
--
--   1. messageCount, sohbetin mesaj sayısı değil "son 300 mesajın kaçı bu
--      sohbette" oluyordu.
--   2. unread, yalnızca o 300 satırın içindeki okunmamışları sayıyordu.
--   3. En ağırı: 300 mesajdan eskiye kalan bir sohbet listeden TAMAMEN
--      kayboluyordu. Gelen kutusunda bu, müşterinin yazdığı mesajı hiç
--      görmemek demek.
--
-- Sınıra ulaşılana kadar hiçbir belirti yok; AGENTS.md'de yazılı tuzağın
-- (22.09.2026, "Tahsil edildi" son 50 kaydın toplamıydı) aynısı. Orada
-- .reduce() vardı, burada for döngüsü olduğu için check:rakamlar yakalamadı.
--
-- Çözüm aynı: sayımı veritabanı yapar. Sohbet başına TEK satır döner,
-- sayılar tam, sıralama en yeni mesaja göre ve sınır SOHBET sayısına
-- uygulanır (mesaj sayısına değil) — böylece hiçbir sohbet düşmez.
--
-- Yalnızca service_role'a açılıyor: fonksiyon kurum kimliğini PARAMETRE
-- alıyor, authenticated'a açılsa herkes başka kurumun gelen kutusunu
-- okuyabilirdi (AGENTS.md: ai_kredi_durumum bu yüzden parametresiz).
-- Çağıran lib/whatsapp-inbox.ts createAdminClient() kullanıyor ve yetkiyi
-- kendisi doğruluyor.
-- ============================================================

create or replace function public.whatsapp_sohbetler(
  p_organization_id uuid,
  p_limit integer default 300
)
returns table (
  counterpart_phone text,
  profile_name text,
  last_body text,
  last_template text,
  last_direction text,
  last_at timestamptz,
  last_inbound_at timestamptz,
  message_count bigint,
  unread bigint,
  archived_at timestamptz,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with sohbet as (
    select
      m.counterpart_phone,
      count(*)                                                        as message_count,
      max(m.created_at)                                               as last_at,
      max(m.created_at) filter (where m.direction = 'inbound')        as last_inbound_at
    from public.whatsapp_messages m
    where m.organization_id = p_organization_id
    group by m.counterpart_phone
  ),
  -- Son mesajın gövdesi/yönü: aynı ana iki kayıt düşerse id ile kararlı seçim.
  son as (
    select distinct on (m.counterpart_phone)
      m.counterpart_phone, m.body, m.template, m.direction
    from public.whatsapp_messages m
    where m.organization_id = p_organization_id
    order by m.counterpart_phone, m.created_at desc, m.id desc
  ),
  -- Müşteri adı en YENİ gelen mesajdan; giden mesajlarda profile_name yok.
  ad as (
    select distinct on (m.counterpart_phone) m.counterpart_phone, m.profile_name
    from public.whatsapp_messages m
    where m.organization_id = p_organization_id
      and m.direction = 'inbound'
      and m.profile_name is not null
    order by m.counterpart_phone, m.created_at desc, m.id desc
  )
  select
    s.counterpart_phone,
    ad.profile_name,
    son.body,
    son.template,
    son.direction,
    s.last_at,
    s.last_inbound_at,
    s.message_count,
    /*
      Damga yoksa sohbet hiç açılmamıştır ve gelen mesajların HEPSİ
      okunmamıştır: panele ilk kez giren kullanıcı birikmiş yazışmaları
      görmeli. Sıfır saymak onları gizlemek olurdu.
    */
    (
      select count(*) from public.whatsapp_messages g
      where g.organization_id = p_organization_id
        and g.counterpart_phone = s.counterpart_phone
        and g.direction = 'inbound'
        and (d.last_read_at is null or g.created_at > d.last_read_at)
    ) as unread,
    d.archived_at,
    d.last_read_at
  from sohbet s
  join son on son.counterpart_phone = s.counterpart_phone
  left join ad on ad.counterpart_phone = s.counterpart_phone
  left join public.whatsapp_conversation_state d
    on d.organization_id = p_organization_id and d.counterpart_phone = s.counterpart_phone
  order by s.last_at desc
  limit greatest(p_limit, 1)
$$;

revoke all on function public.whatsapp_sohbetler(uuid, integer) from public, anon, authenticated;
grant execute on function public.whatsapp_sohbetler(uuid, integer) to service_role;

-- Sohbet başına gruplama ve "en yeni mesaj" araması bu indeksle çalışır.
create index if not exists whatsapp_messages_kurum_sohbet_idx
  on public.whatsapp_messages (organization_id, counterpart_phone, created_at desc);

notify pgrst, 'reload schema';
