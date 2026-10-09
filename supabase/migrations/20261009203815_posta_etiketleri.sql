-- ============================================================
-- POSTA: ETİKETLER (KLASÖRLER)
--
-- Ortak kutuda yazışmaları ayırmanın tek yolu durum (açık/yanıtlandı)
-- ve arama idi. Kurumun kendi düzeni — "Faturalar", "Bayiler", "İade" —
-- Gmail'de duruyor ama panelde hiç görünmüyordu; etikete göre bakmak
-- için Gmail'e geçmek gerekiyordu.
--
-- GMAIL KAYNAK: etiketleri biz üretmiyoruz, Gmail'den okuyoruz. Panelde
-- açılan bir etiket Gmail'de olmayacağı için iki taraf hemen ayrışırdı;
-- kurum etiketi Gmail'de açıyor, panel gösteriyor ve yazışmaya
-- uyguluyor.
--
-- SİSTEM ETİKETLERİ SAKLANMIYOR (INBOX, SENT, UNREAD, TRASH…): gelen,
-- giden, okunmamış ve çöp zaten kendi sütunlarında. Aynı bilgiyi iki
-- yerde tutmak, ikisinin ayrışması demek.
-- ============================================================

create table if not exists public.mail_labels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Gmail'in kendi kimliği ("Label_12"); ad değişince bağ kopmasın diye anahtar bu.
  label_id text not null,
  ad text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_labels_kurum_etiket_uidx unique (organization_id, label_id)
);

comment on table public.mail_labels is 'Ortak posta kutusunun Gmail etiketleri (kurumun kendi klasörleri). Eşitleme doldurur.';

/*
  Etiketler mesajda da, konuşmada da duruyor. Mesajdaki ham veri;
  konuşmadaki, o konuşmanın mesajlarının BİRLEŞİMİ (gelen_var/giden_var
  ile aynı kalıp). Listeyi çizerken her satır için mesajlara bakmak yüz
  satırda yüz alt sorgu demekti, PostgREST tarafında gömülü süzme de
  kurulamıyor: iki tablo arasında yabancı anahtar yok.
*/
alter table public.mail_messages
  add column if not exists etiketler text[] not null default '{}';
alter table public.mail_threads
  add column if not exists etiketler text[] not null default '{}';

comment on column public.mail_threads.etiketler is
  'Konuşmanın Gmail etiket kimlikleri (mesajlarının birleşimi). Liste süzgeci bunu okur.';

-- Etikete göre süzme: dizi üyeliği GIN ile.
create index if not exists mail_threads_etiket_idx on public.mail_threads using gin (etiketler);

alter table public.mail_labels enable row level security;

grant select on public.mail_labels to authenticated;
grant select, insert, update, delete on public.mail_labels to service_role;

/*
  Okuma posta modülünün kapısından geçiyor (diğer posta tabloları gibi).
  Yazma yalnızca eşitlemede (service_role): etiket kataloğu Gmail'in
  kopyası, panelden yazılması onu kaynaktan ayırırdı.
*/
drop policy if exists "posta modulu acik olanlar etiketleri okur" on public.mail_labels;
create policy "posta modulu acik olanlar etiketleri okur" on public.mail_labels
  as permissive for select to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

/*
  Konuşmanın etiketleri de panelden değiştirilemiyor: etiket uygulama
  önce Gmail'e gidiyor, sonra bu sütun yazılıyor (çöp işaretiyle aynı
  kural). Panelden yazılabilseydi Gmail'de olmayan bir etiket panelde
  görünür, bir sonraki eşitleme onu sessizce silerdi.
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
     or new.silen_user_id is distinct from old.silen_user_id
     or new.etiketler is distinct from old.etiketler then
    raise exception 'Konuşmanın posta bilgileri panelden değiştirilemez; yalnızca durum ve ilgilenen kişi güncellenebilir.';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

notify pgrst, 'reload schema';
