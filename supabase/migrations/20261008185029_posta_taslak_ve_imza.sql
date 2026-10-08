-- ============================================================
-- POSTA: TASLAK VE KURUM İMZASI
--
-- İMZA kutu ayarında, mesajda değil: her personelin her yanıta elle
-- imza yazması hem unutuluyor hem her seferinde biraz farklı çıkıyordu.
-- Giden her mesajın sonuna sunucu ekliyor; böylece yanıt, yeni posta ve
-- ileride eklenecek her gönderim yolu aynı imzayı taşıyor.
--
-- TASLAKLAR ORTAK, KİŞİSEL DEĞİL. Ortak kutunun tamamı ekibin; yarım
-- kalmış bir cevabı başlatanın dışındaki biri de sürdürebilmeli.
-- Kimin başlattığı yazılıyor ama erişimi kısıtlamıyor — izinli ama
-- bilgilendirilmiş.
--
-- Taslaklar Gmail'in kendi taslaklarına YAZILMIYOR. Gmail taslağı tek
-- bir hesabın; ortak kutuda "bunu kim yazmış, kim devam edecek"
-- sorusunun cevabı Gmail'de yok. Ayrıca taslak gönderilene kadar
-- dışarıya çıkmayan bir metin: onu Google'a taşımak için sebep yok.
-- ============================================================

alter table public.mail_accounts
  add column if not exists imza text;

comment on column public.mail_accounts.imza is
  'Giden mesajların sonuna eklenen kurum imzası. Boşsa imza eklenmez.';

create table if not exists public.mail_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  /* Bir yanıt taslağı mı, sıfırdan yeni posta mı. Yanıt taslağında
     konuşma başına tek taslak var: aynı yazışmaya iki kişinin iki ayrı
     yarım cevap bırakması, ortak kutuda çakışmanın en sık biçimi. */
  thread_id text,
  alici text,
  konu text,
  govde text not null default '',
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,
  olusturan uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mail_drafts_konusma_uidx
  on public.mail_drafts (organization_id, thread_id)
  where thread_id is not null;
create index if not exists mail_drafts_kurum_idx
  on public.mail_drafts (organization_id, updated_at desc);

alter table public.mail_drafts enable row level security;
grant select, insert, update, delete on public.mail_drafts to authenticated;
grant select, insert, update, delete on public.mail_drafts to service_role;

/*
  Kapı posta modülü: okuma, yazma ve silme aynı kuralı kullanıyor.
  "Taslak yazabilme" ayrıca sunucu işleminde posta.yanitla yetkisiyle
  denetleniyor — RLS modülü, yetenek eylemi söyler.
*/
drop policy if exists "posta modulu acik olanlar taslaklari okur" on public.mail_drafts;
create policy "posta modulu acik olanlar taslaklari okur" on public.mail_drafts
  as permissive for select to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

drop policy if exists "posta modulu acik olanlar taslak yazar" on public.mail_drafts;
create policy "posta modulu acik olanlar taslak yazar" on public.mail_drafts
  as permissive for insert to authenticated
  with check (private.arvo_modul_acik(organization_id, 'posta'));

drop policy if exists "posta modulu acik olanlar taslak gunceller" on public.mail_drafts;
create policy "posta modulu acik olanlar taslak gunceller" on public.mail_drafts
  as permissive for update to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'))
  with check (private.arvo_modul_acik(organization_id, 'posta'));

drop policy if exists "posta modulu acik olanlar taslak siler" on public.mail_drafts;
create policy "posta modulu acik olanlar taslak siler" on public.mail_drafts
  as permissive for delete to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

/*
  Taslak yalnızca kurumun KENDİ kaydına bağlanabilir; posta
  konuşmalarındaki kuralın aynısı (20261006193918). RLS yazarın
  yetkisini denetliyor ama hedefi denetlemiyor.
*/
drop trigger if exists mail_drafts_firsat_kurumu on public.mail_drafts;
create trigger mail_drafts_firsat_kurumu
  before insert or update on public.mail_drafts
  for each row execute function private.arvo_posta_firsat_kurumu();

comment on table public.mail_drafts is
  'Ortak kutunun taslakları. Ekipten biri başlatır, başkası sürdürebilir; Gmail taslaklarına yazılmaz.';

notify pgrst, 'reload schema';
