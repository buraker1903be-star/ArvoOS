-- Bildirim rozeti canlı güncellensin.
--
-- Sorun: notifications tablosu supabase_realtime yayınında değildi; yeni
-- bildirim geldiğinde rozet ancak sayfa yenilenince artıyordu.
--
-- Çözüm: notifications ve notification_user_reads yayına eklenir. Tarayıcı
-- (app/panel/notifications/live.ts) şunları dinler:
--   * notifications INSERT  -> rozet anında +1, açık çekmece yenilenir
--   * notifications UPDATE  -> kişisel bildirim başka sekmede/cihazda okundu:
--                              kesin sayı yeniden sorulur
--   * notification_user_reads INSERT (user_id = kendisi)
--                           -> toplu bildirim başka sekmede okundu: aynı
--
-- Güvenlik: Realtime postgres_changes her abone için tablonun SELECT
-- politikasını uygular. notifications okuma politikası
-- ("members_read_own_notifications") yalnızca alıcıya (user_id boş = kurumun
-- aktif üyeleri, dolu = yalnızca o kişi; founder bildirimleri yalnızca
-- kurucuya) izin veriyor; notification_user_reads okuma politikası
-- user_id = auth.uid(). Politika değişikliği gerekmedi.
--
-- Replica identity: varsayılan (birincil anahtar) yeterli. INSERT ve UPDATE
-- olaylarında yeni satırın tamamı gelir ve istemci filtresi
-- (organization_id / audience / user_id) yeni satıra uygulanır; eski satır
-- değerlerine ihtiyaç yok. DELETE dinlenmiyor.
--
-- Tekrar çalıştırılabilir: tablo zaten yayındaysa atlanır; yayın yoksa
-- (yerel/test veritabanı) hiçbir şey yapmaz.

do $publication$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['notifications', 'notification_user_reads'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$publication$;
