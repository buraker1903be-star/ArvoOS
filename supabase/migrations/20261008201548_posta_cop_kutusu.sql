-- ============================================================
-- POSTA: PANELDE ÇÖP KUTUSU VE GERİ ALMA
--
-- Silme şimdiye kadar Gmail'in çöp kutusuna taşıyıp BİZİM satırlarımızı
-- siliyordu. Sonuç: panelde silinen yazışmanın izi kalmıyordu, geri
-- almak için Gmail'e geçmek gerekiyordu — ortak kutunun amacı tam da
-- bunu gerektirmemekti. Üstelik "kim sildi" sorusunun cevabı da yoktu.
--
-- Satır artık duruyor, yalnızca işaretleniyor: listeler çöptekileri
-- dışarıda bırakıyor, Çöp kutusu yalnızca onları gösteriyor, geri alma
-- işareti kaldırıp Gmail'de de çöpten çıkarıyor.
--
-- KALICI SİLME YOK: Gmail çöpü otuz günde kendisi boşaltıyor. Panelden
-- kalıcı silme eklemek, ortak kutuda tek tıkla geri alınamaz bir kayıp
-- demek olurdu.
-- ============================================================

alter table public.mail_threads
  add column if not exists silindi_at timestamptz,
  add column if not exists silen_user_id uuid references auth.users(id) on delete set null;

comment on column public.mail_threads.silindi_at is
  'Dolu ise yazışma çöp kutusunda. Listeler bunu null olanlarla süzüyor.';
comment on column public.mail_threads.silen_user_id is
  'Çöpe atan personel. Ortak kutuda "bunu kim sildi" sorusunun cevabı.';

/*
  Asıl liste sorgusu (kurum + çöpte olmayanlar + tarih sırası) kısmi
  indeksle karşılanıyor. Çöp kutusu küçük kalacağı için ona ayrı indeks
  yazılmadı.
*/
create index if not exists mail_threads_kutuda_idx
  on public.mail_threads (organization_id, son_mesaj_at desc)
  where silindi_at is null;

/*
  Silme artık satırı kaldırmıyor; bir önceki migration'da verilen DELETE
  yetkisi geri alınıyor. Açık bırakmak, API'den doğrudan DELETE çağıran
  bir oturumun yazışmayı geri alınamaz biçimde yok etmesi demekti —
  panelin kendi akışında artık silme yok.
*/
drop policy if exists "posta modulu acik olanlar konusmayi siler" on public.mail_threads;
revoke delete on public.mail_threads from authenticated;

/*
  ÇÖP İŞARETİ DE GMAİL'DEN GELEN BİR BİLGİ: yazışmayı çöpe atan sunucu
  işlemi önce Gmail'e gidiyor, sonra bu sütunu yazıyor. Panelden (yani
  authenticated oturumdan) doğrudan yazılabilseydi, Gmail'de kutuda duran
  bir yazışma panelde çöpte görünürdü — üstelik bir sonraki eşitleme onu
  geri getirir, kullanıcı "sildim, geri geldi" ile kalırdı. Korunan sütun
  listesine ekleniyor; eşitleme service_role ile yazdığı için etkilenmez.
*/
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
     or new.silindi_at is distinct from old.silindi_at
     or new.silen_user_id is distinct from old.silen_user_id then
    raise exception 'Konuşmanın posta bilgileri panelden değiştirilemez; yalnızca durum ve ilgilenen kişi güncellenebilir.';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

notify pgrst, 'reload schema';
