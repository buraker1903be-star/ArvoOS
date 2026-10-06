-- ============================================================
-- ORTAK POSTA KUTUSU — konuşmalar ve mesajlar
--
-- Bağlantı kuruldu (20261006171515); bu migration gelen kutusunun
-- kendisini açıyor.
--
-- NEDEN GÖVDELER BURADA DEĞİL:
--
-- Kurumun posta kutusunun tamamını kopyalamıyoruz. Tabloda yalnızca
-- listeyi çizmeye ve ortak durumu tutmaya yetecek üst veri var: kimden,
-- konu, tarih, Gmail'in kendi özeti. Mesajın gövdesi açıldığı anda
-- Gmail'den okunuyor.
--
-- İki sebep: (1) bir kurumun yıllarca birikmiş yazışmasını ikinci bir
-- veritabanında çoğaltmak, bizim sakladığımız kişisel veriyi gereksiz
-- yere büyütür; (2) liste ekranı zaten gövdeyi göstermiyor, okunmayan
-- bir veriyi senkronda taşımak boşuna. Arama ileride gerekirse Gmail'in
-- kendi arama ucuna sorulur.
--
-- NEDEN İKİ TABLO:
--
-- Ortak kutuda ekibin ilgilendiği şey tek tek mesajlar değil KONUŞMA:
-- "bu müşteriyle kim ilgileniyor", "yanıtlandı mı". Durum mesaj
-- satırında tutulsaydı aynı konuşmanın beş mesajında beş ayrı durum
-- olurdu. Gmail'in thread_id'si zaten bu grubu veriyor.
-- ============================================================

create table if not exists public.mail_threads (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  thread_id text not null,
  konu text,
  son_gonderen_ad text,
  son_gonderen_adres text,
  son_mesaj_at timestamptz,
  ozet text,
  mesaj_sayisi integer not null default 0,
  okunmamis boolean not null default false,
  -- Ortak kutunun asıl sorusu: bu konuşmayla kim ilgileniyor.
  ilgilenen_user_id uuid references auth.users(id) on delete set null,
  durum text not null default 'acik',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, thread_id),
  constraint mail_threads_durum_check check (durum in ('acik', 'yanitlandi', 'kapali'))
);

create table if not exists public.mail_messages (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id text not null,
  thread_id text not null,
  gonderen_ad text,
  gonderen_adres text,
  alici text,
  konu text,
  ozet text,
  tarih timestamptz,
  -- Gelen mi giden mi: ortak kutuda ikisi aynı listede görünüyor ve
  -- "bu konuşmaya cevap verilmiş mi" sorusunun cevabı bu sütunda.
  yon text not null default 'gelen',
  ekli_dosya boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, message_id),
  constraint mail_messages_yon_check check (yon in ('gelen', 'giden'))
);

create index if not exists mail_threads_kurum_tarih_idx
  on public.mail_threads (organization_id, son_mesaj_at desc);
create index if not exists mail_messages_konusma_idx
  on public.mail_messages (organization_id, thread_id, tarih);

/*
  MODÜL KAPISI VERİTABANINDA DA.

  Panelde modülü kapatmak bugün yalnızca uygulama katmanında duruyor:
  oturum jetonu tarayıcıda olduğu için kapatılmış bir modülün tabloları
  API'den doğrudan okunabiliyor. Posta yeni bir tablo olduğu için bu
  açığı devralmak yerine baştan kapatıyoruz.

  Karar sırası panelle birebir aynı (lib/yetkiler.ts · gizliModulleriHesapla):
  kişi satırı varsa o, yoksa rol satırı, o da yoksa açık. Kurum Sahibi
  kısıtlanamaz.
*/
create or replace function private.arvo_modul_acik(p_organization_id uuid, p_module_key text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and (
        m.role::text = 'owner'
        or coalesce(
          (select mm.can_access from public.member_module_permissions mm
            where mm.organization_id = p_organization_id
              and mm.user_id = m.user_id
              and mm.module_key = p_module_key),
          (select rp.can_access from public.role_module_permissions rp
            where rp.organization_id = p_organization_id
              and rp.role = m.role::text
              and rp.module_key = p_module_key),
          true
        )
      )
  )
$fn$;

revoke all on function private.arvo_modul_acik(uuid, text) from public, anon;
grant execute on function private.arvo_modul_acik(uuid, text) to authenticated, service_role;

alter table public.mail_threads enable row level security;
alter table public.mail_messages enable row level security;

grant select on public.mail_threads to authenticated;
grant select on public.mail_messages to authenticated;
-- Konuşmanın ortak durumunu (ilgilenen, durum) personel kendisi değiştiriyor.
grant update on public.mail_threads to authenticated;
grant select, insert, update, delete on public.mail_threads to service_role;
grant select, insert, update, delete on public.mail_messages to service_role;

drop policy if exists "posta modulu acik olanlar konusmalari okur" on public.mail_threads;
create policy "posta modulu acik olanlar konusmalari okur" on public.mail_threads
  as permissive for select to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

drop policy if exists "posta modulu acik olanlar mesajlari okur" on public.mail_messages;
create policy "posta modulu acik olanlar mesajlari okur" on public.mail_messages
  as permissive for select to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

/*
  Ortak durumu personel kendisi yazıyor: konuşmayı üstlenmek ve
  "yanıtlandı" demek ortak kutunun tek anlamlı özelliği. Kapsam yine
  modül kapısı; hangi sütunlara dokunulabileceğini aşağıdaki tetikleyici
  söylüyor.
*/
drop policy if exists "posta modulu acik olanlar konusmayi gunceller" on public.mail_threads;
create policy "posta modulu acik olanlar konusmayi gunceller" on public.mail_threads
  as permissive for update to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'))
  with check (private.arvo_modul_acik(organization_id, 'posta'));

/*
  Yazma yalnızca ORTAK DURUM sütunlarına olmalı; konu, gönderen ve tarih
  Gmail'den geliyor ve personelin değiştirmesi anlamsız. RLS "kim
  yazabilir"i söyler, "neyi"yi söylemez (AGENTS.md): o yüzden kolon
  koruması tetikleyicide.
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
     or new.mesaj_sayisi is distinct from old.mesaj_sayisi then
    raise exception 'Konuşmanın posta bilgileri panelden değiştirilemez; yalnızca durum ve ilgilenen kişi güncellenebilir.';
  end if;
  new.updated_at := now();
  return new;
end;
$fn$;

drop trigger if exists mail_threads_koruma on public.mail_threads;
create trigger mail_threads_koruma
  before update on public.mail_threads
  for each row execute function private.arvo_posta_konusma_korumasi();

comment on table public.mail_threads is 'Ortak posta kutusundaki konuşmalar ve ekibin ortak durumu. Gövdeler burada değil, açıldığında Gmail''den okunur.';
comment on table public.mail_messages is 'Konuşmalardaki mesajların üst verisi. Gövde saklanmaz.';

notify pgrst, 'reload schema';
