-- ============================================================
-- POSTA: "okunmamis" KORUMASI GERİ GETİRİLDİ
--
-- 20261006193918 bu sütunu korunanlara eklemişti: okundu/okunmadı
-- durumu Gmail'in UNREAD etiketinin kopyası, panelden doğrudan
-- yazılırsa panel "okundu" derken kutu "okunmamış" kalır ve ilk
-- eşitlemede geri döner — kullanıcı "okudum, yine okunmamış göründü"
-- ile kalır.
--
-- 08.10.2026'da çöp kutusu migration'ı (20261008201548) işlevi
-- 20261006190207'deki ESKİ gövdeden türeterek yeniden yazdı ve bu satır
-- düştü; 20261009203815 (etiketler) da aynı eksik gövdenin üstüne
-- yazdığı için koruma canlıda iki gündür yoktu. Kimsenin fark
-- etmemesinin sebebi, tests/db'nin eski migration dosyalarını yeniden
-- uygulayıp gövdeyi her koşuda eskiye döndürmesiydi: test geçen gövdeyi
-- değil, dosyadaki gövdeyi ölçüyordu (AGENTS.md · "Eski bir migration'ı
-- yeniden uygulamak yeni korumayı düşürebilir").
--
-- Korunan sütunların TAMAMI burada; bundan sonra bu işlevi değiştiren
-- her migration listeyi buradan kopyalamalı.
-- ============================================================

create or replace function private.arvo_posta_konusma_korumasi()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $fn$
begin
  -- Sunucu tarafı (service_role) eşitlemeyi yazıyor; istek bağlamı yoksa dokunma.
  if private.arvo_request_role() is distinct from 'authenticated' then
    return new;
  end if;
  if new.thread_id is distinct from old.thread_id
     or new.organization_id is distinct from old.organization_id
     or new.konu is distinct from old.konu
     or new.son_gonderen_adres is distinct from old.son_gonderen_adres
     or new.son_mesaj_at is distinct from old.son_mesaj_at
     or new.ozet is distinct from old.ozet
     or new.mesaj_sayisi is distinct from old.mesaj_sayisi
     or new.okunmamis is distinct from old.okunmamis
     or new.silindi_at is distinct from old.silindi_at
     or new.silen_user_id is distinct from old.silen_user_id
     or new.etiketler is distinct from old.etiketler then
    raise exception 'Konuşmanın posta bilgileri panelden değiştirilemez; yalnızca durum ve ilgilenen kişi güncellenebilir.';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

notify pgrst, 'reload schema';
