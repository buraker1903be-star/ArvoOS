/*
  KONSOLDAN KURUMLARA DUYURU (02.11.2026). Kural lib/platform-duyuru.ts.

  Duyurunun kendisi her kurumun bildirimlerine yazılıyor
  (notifications, kategori platform_duyurusu). Bu tablo GEÇMİŞ: ne,
  kime, kaç kuruma, kim tarafından gönderildi. Bildirim satırları
  kurumlar okuyup kaldırdıkça değişiyor; "bakım duyurusunu gönderdik
  mi, kaç kuruma gitti" sorusunun yanıtı onlardan okunamaz.

  Yalnızca kurucu (private.is_arvoos_founder) okur ve yazar; kiracıya
  kapalı. Silme ve güncelleme yok: gönderilmiş duyuru geri alınamaz,
  kayıt da değiştirilmez — yalnızca alıcı sayısı gönderim bitince
  sunucu anahtarıyla yazılıyor.
*/
create table if not exists public.platform_duyurulari (
  id uuid primary key default gen_random_uuid(),
  baslik text not null check (char_length(baslik) between 3 and 120),
  metin text not null check (char_length(metin) between 3 and 2000),
  baglanti text check (baglanti is null or baglanti like '/panel%'),
  hedef text not null check (hedef in ('tum', 'arvoos', 'arvolab', 'arc', 'randevu')),
  alici_sayisi integer not null default 0 check (alici_sayisi >= 0),
  gonderen uuid references auth.users(id) on delete set null,
  olusturuldu timestamptz not null default now()
);

create index if not exists platform_duyurulari_tarih_idx on public.platform_duyurulari (olusturuldu desc);

alter table public.platform_duyurulari enable row level security;
revoke all on public.platform_duyurulari from public, anon;
grant select, insert on public.platform_duyurulari to authenticated;

drop policy if exists "Duyuruları kurucu okur" on public.platform_duyurulari;
create policy "Duyuruları kurucu okur" on public.platform_duyurulari for select to authenticated
  using ((select private.is_arvoos_founder()));
drop policy if exists "Duyuruyu kurucu yazar" on public.platform_duyurulari;
create policy "Duyuruyu kurucu yazar" on public.platform_duyurulari for insert to authenticated
  with check ((select private.is_arvoos_founder()) and gonderen = (select auth.uid()));
