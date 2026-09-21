-- ============================================================
-- WhatsApp: gelen mesaj ve durum bildirimi (Meta webhook)
--
-- Gönderim kapısı (app/api/bridge/whatsapp) giden mesajı zaten
-- whatsapp_messages'a yazıyor. Bu migration gelen tarafı açar:
--
--   1. Müşterinin yazdığı mesaj (direction = 'inbound').
--   2. Gönderdiğimiz mesajın akıbeti (sent → delivered → read, ya da failed).
--
-- Tablo değişmiyor; eksik olan tekillik ve sohbet görünümünün indeksi.
--
-- Neden tekillik: Meta 200 dönmeyen bildirimi yeniden dener ve aynı mesajı
-- birden çok kez yollayabilir. Tekilliği uygulamada "önce bak sonra yaz" ile
-- kurmak iki eşzamanlı bildirimde aynı mesajı iki kez yazardı; kararı
-- veritabanı versin. Kısmi indeks yalnızca gelen mesajı kapsar: giden
-- mesajın kimliği Meta'dan yanıtla gelir ve aynı kimlik gelen tarafta
-- tekrarlanmaz.
-- ============================================================

create unique index if not exists whatsapp_messages_inbound_uniq
  on public.whatsapp_messages (wa_message_id)
  where direction = 'inbound' and wa_message_id is not null;

-- Gelen kutusu numaraya göre sohbet gösteriyor; sıralama son mesajdan.
create index if not exists whatsapp_messages_sohbet_idx
  on public.whatsapp_messages (organization_id, counterpart_phone, created_at desc);

-- Meta'nın profil adı: kurumun rehberinde olmayan numarada tek ipucu.
-- Gelen mesajda dolar, gidende boş kalır.
alter table public.whatsapp_messages
  add column if not exists profile_name text;

comment on column public.whatsapp_messages.profile_name is
  'Gelen mesajda Meta''nın bildirdiği WhatsApp profil adı; giden mesajda boş.';

notify pgrst, 'reload schema';
