-- ============================================================
-- POSTA: HAZIR CEVAPLAR
--
-- Ortak kutuda aynı sorular her gün yeniden yazılıyor ("süre ne kadar",
-- "fiyata neler dahil", "dekontu nereye göndereceğim"). Personel ya
-- kendi eski postasını bulup kopyalıyor ya da baştan yazıyor; iki
-- kişinin aynı soruya iki farklı cevabı gidiyor.
--
-- Metin KURUMUN, kişinin değil: ortak kutunun amacı tek ağızdan
-- konuşmak. Kim yazmış bilgisi kütük olarak duruyor ama cevabı herkes
-- kullanıyor.
--
-- Yer tutucular gövdede düz metin olarak saklanıyor ({{musteri}} gibi);
-- doldurma panelde, gönderim anında yapılıyor. Veritabanında
-- çözülseydi aynı şablon iki yazışmada aynı metni üretirdi.
-- ============================================================

create table if not exists public.mail_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  ad text not null,
  govde text not null,
  olusturan uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_templates_ad_bos_degil check (length(btrim(ad)) between 2 and 80),
  constraint mail_templates_govde_bos_degil check (length(btrim(govde)) between 2 and 5000)
);

/*
  Aynı adla iki cevap, seçim kutusunda ayırt edilemeyen iki satır demek.
  Ad büyük/küçük harf duyarsız benzersiz: "Fiyat" ve "fiyat" aynı şey.
*/
create unique index if not exists mail_templates_ad_uidx
  on public.mail_templates (organization_id, lower(btrim(ad)));

comment on table public.mail_templates is
  'Ortak posta kutusunun hazır cevapları. Metin kurumun; yer tutucular gönderim anında panelde doldurulur.';

alter table public.mail_templates enable row level security;

grant select on public.mail_templates to authenticated;
grant insert, update, delete on public.mail_templates to authenticated;
grant select, insert, update, delete on public.mail_templates to service_role;

/*
  OKUMA posta modülünün kapısından: cevabı kullanan herkes görmeli.
  YAZMA aynı kapıdan geçiyor ama asıl yetki sunucuda (posta.yonet):
  RLS "kim yazabilir"i söyler, "hangi yetkiyle"yi söylemez. Kapıyı
  burada da daraltmak, yetkiyi kiracının değiştiremeyeceği bir yere
  gömmek olurdu (AGENTS.md · yetki kararı rol listesiyle verilmez).
*/
drop policy if exists "posta modulu acik olanlar hazir cevaplari okur" on public.mail_templates;
create policy "posta modulu acik olanlar hazir cevaplari okur" on public.mail_templates
  as permissive for select to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

drop policy if exists "posta modulu acik olanlar hazir cevap yazar" on public.mail_templates;
create policy "posta modulu acik olanlar hazir cevap yazar" on public.mail_templates
  as permissive for insert to authenticated
  with check (private.arvo_modul_acik(organization_id, 'posta'));

drop policy if exists "posta modulu acik olanlar hazir cevap gunceller" on public.mail_templates;
create policy "posta modulu acik olanlar hazir cevap gunceller" on public.mail_templates
  as permissive for update to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

drop policy if exists "posta modulu acik olanlar hazir cevap siler" on public.mail_templates;
create policy "posta modulu acik olanlar hazir cevap siler" on public.mail_templates
  as permissive for delete to authenticated
  using (private.arvo_modul_acik(organization_id, 'posta'));

notify pgrst, 'reload schema';
