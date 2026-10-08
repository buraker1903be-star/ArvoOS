-- canli panel anlik yayin
--
-- Şirket işletim sistemi kabuğu (app/panel/os/os-canli-yenile.tsx) ana
-- sayfayı, CRM ve operasyon ekranlarını bir çalışma arkadaşı kayıt girince
-- sayfa yenilemeden tazeliyor. Bunun için ilgili tabloların Supabase anlık
-- yayınında (supabase_realtime) olması gerekiyor; şimdiye kadar yalnızca
-- mesaj, bildirim ve çevrimiçi tabloları vardı.
--
-- Güvenlik: postgres_changes her abonenin RLS'ini uygular; kişi SELECT
-- yetkisi olmadığı satırın olayını almaz. Yeni bir yetki açılmıyor.
--
-- Yayın yoksa (yerel/test veritabanı) hiçbir şey yapmaz; tablo zaten
-- yayındaysa atlanır. Önceki iki yayın migration'ıyla aynı kalıp.

do $publication$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['activity_logs', 'crm_opportunities', 'crm_proposals', 'crm_contracts', 'operation_workflows'] loop
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
