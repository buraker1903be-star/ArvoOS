-- ana ekran anlik yayin
--
-- Ana ekran (app/panel/page.tsx) 2026-10'da dört listeye döndü: son
-- operasyonlar, yaklaşan aşama tarihleri, müşteri mesajları, gelen
-- postalar. Ekran bu tablolardaki değişiklikte kendiliğinden tazeleniyor
-- (app/panel/os/os-canli-yenile.tsx); bunun için tabloların anlık yayında
-- olması gerekiyor. Diğer tablolar 20261008073550_canli_panel_anlik_yayin'da.
--
-- Güvenlik: postgres_changes her abonenin RLS'ini uygular; yeni bir yetki
-- açılmıyor. Yayın yoksa (yerel/test) hiçbir şey yapmaz.

do $publication$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['operation_steps', 'customer_file_messages', 'mail_threads'] loop
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
