-- ============================================================
-- POSTA: GEÇMİŞ EŞİTLEME VE CRM BAĞI
--
-- İki eksik kapanıyor.
--
-- 1) GEÇMİŞ POSTALAR. İlk sürüm her turda yalnızca son 60 mesaja
--    bakıyordu; yıllardır kullanılan bir kutuda ekip "eski yazışma nerede"
--    diye soruyor. Kutunun tamamını tek seferde indirmek ise sunucu
--    zaman sınırına takılıyor (her mesaj için ayrı istek) ve ilk
--    eşitlemeyi dakikalarca kilitliyor.
--
--    Çözüm turlara yayılmış geçmiş tarama: her tur önce yeni mesajları
--    alıyor, sonra geçmişten bir sayfa daha ilerliyor ve kaldığı yeri
--    (Gmail'in sayfa belirteci) buraya yazıyor. Bittiğinde bir daha
--    taranmıyor.
--
-- 2) CRM BAĞI. Ortak kutuya gelen posta çoğu zaman var olan bir müşteriye
--    ait ama panelde iki ayrı yerde duruyordu: yazışma postada, kayıt
--    CRM'de. "Bu müşteriye ne yazmıştık" sorusunun cevabı yoktu.
--
--    Konuşma artık bir fırsata bağlanabiliyor. Bağ İSTEĞE BAĞLI ve
--    silinirse konuşma kalıyor (on delete set null): fırsatın silinmesi
--    yazışmayı yok etmemeli.
-- ============================================================

alter table public.mail_accounts
  add column if not exists gecmis_belirteci text,
  add column if not exists gecmis_bitti boolean not null default false,
  add column if not exists gecmis_mesaj_sayisi integer not null default 0;

comment on column public.mail_accounts.gecmis_belirteci is
  'Gmail sayfa belirteci: geçmiş tarama kaldığı yerden devam eder. null + gecmis_bitti=false ise taramaya baştan başlar.';
comment on column public.mail_accounts.gecmis_bitti is
  'Geçmiş tarama tamamlandı; sonraki turlar yalnızca yeni mesajlara bakar.';

alter table public.mail_threads
  add column if not exists opportunity_id uuid references public.crm_opportunities(id) on delete set null;

create index if not exists mail_threads_firsat_idx
  on public.mail_threads (organization_id, opportunity_id)
  where opportunity_id is not null;

comment on column public.mail_threads.opportunity_id is
  'Konuşmanın bağlandığı CRM fırsatı. Fırsat silinirse bağ kopar, yazışma kalır.';

/*
  BAĞ KURUMUN KENDİ FIRSATINA OLMALI.

  RLS yazarın yetkisini denetliyor ama hedefi denetlemiyor: posta
  modülüne erişebilen biri, başka bir kurumun fırsat kimliğini yazarak
  o fırsata bağlanmış görünen bir konuşma bırakabilirdi. Satır kendi
  kurumunda görünmez ama bağ kaydı kalır ve müşteri sorgulamada
  karşılığı olmayan satırlar üretir.
*/
create or replace function private.arvo_posta_firsat_kurumu()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if new.opportunity_id is not null and not exists (
    select 1 from public.crm_opportunities o
    where o.id = new.opportunity_id
      and o.organization_id = new.organization_id
  ) then
    raise exception 'Konuşma yalnızca kendi kurumunuzun bir kaydına bağlanabilir.';
  end if;
  return new;
end;
$fn$;

revoke all on function private.arvo_posta_firsat_kurumu() from public, anon;
grant execute on function private.arvo_posta_firsat_kurumu() to authenticated, service_role;

drop trigger if exists mail_threads_firsat_kurumu on public.mail_threads;
create trigger mail_threads_firsat_kurumu
  before insert or update on public.mail_threads
  for each row execute function private.arvo_posta_firsat_kurumu();

/*
  Sütun koruması güncelleniyor: opportunity_id personelin
  değiştirebileceği alanlar arasına giriyor (konuşmayı müşteriye bağlamak
  ekibin işi), posta alanları kapalı kalmaya devam ediyor.

  Eski gövde opportunity_id'yi tanımıyordu; yeni sütun eklenince
  "değişmemiş olanlar" listesine girmediği için zaten serbest kalıyordu,
  ama bunu açıkça yazmak gerekiyor — bir sonraki sütun eklendiğinde aynı
  soru yeniden sorulsun diye kural açık: İZİN VERİLENLER sayılı.
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
  /*
    Panelden değiştirilebilen ÜÇ alan var: durum, ilgilenen kişi ve CRM
    bağı. Geri kalan her sütun Gmail'den geliyor; listeyi kaynağından
    ayırmak, ekranda duran bilgiyi sessizce yanlış yapardı.
  */
  if new.thread_id is distinct from old.thread_id
     or new.organization_id is distinct from old.organization_id
     or new.konu is distinct from old.konu
     or new.son_gonderen_ad is distinct from old.son_gonderen_ad
     or new.son_gonderen_adres is distinct from old.son_gonderen_adres
     or new.son_mesaj_at is distinct from old.son_mesaj_at
     or new.ozet is distinct from old.ozet
     or new.mesaj_sayisi is distinct from old.mesaj_sayisi
     or new.okunmamis is distinct from old.okunmamis then
    raise exception 'Konuşmanın posta bilgileri panelden değiştirilemez; yalnızca durum, ilgilenen kişi ve müşteri bağı güncellenebilir.';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

notify pgrst, 'reload schema';
