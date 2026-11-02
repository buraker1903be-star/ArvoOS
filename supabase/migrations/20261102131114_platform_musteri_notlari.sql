/*
  KONSOLUN MÜŞTERİ NOTLARI VE TAKİP HATIRLATMASI (02.11.2026).

  Konsol bir müşteri hakkında her şeyi gösteriyordu ama "aradım, ödemeyi
  haftaya yapacak" diye yazacak bir yer ve onu hatırlatan bir şey yoktu:
  not kurucunun kendi defterinde, hatırlatma hafızasındaydı.

  takip_tarihi verilen not, o gün geldiğinde konsolun "Bugünün işleri"ne
  düşer; tamamlandi_at yazılınca düşer. Notun METNİ sonradan
  değiştirilmez (tetikleyici): müşteriyle konuşmanın kaydı — yanlışsa
  silinip yenisi yazılır. Değiştirilebilenler yalnızca takip tarihi ve
  tamamlandı işareti.

  Yalnızca kurucu (private.is_arvoos_founder) okur ve yazar; kiracıya
  tamamen kapalı — bu Arvo'nun müşteri hakkındaki iç notu.
*/
create table if not exists public.platform_musteri_notlari (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  metin text not null check (char_length(btrim(metin)) between 2 and 2000),
  takip_tarihi date,
  tamamlandi_at timestamptz,
  yazan uuid references auth.users(id) on delete set null,
  olusturuldu timestamptz not null default now()
);

create index if not exists platform_musteri_notlari_kurum_idx on public.platform_musteri_notlari (organization_id, olusturuldu desc);
/* "Bugünün işleri": açık takipler tarihe göre. */
create index if not exists platform_musteri_notlari_takip_idx on public.platform_musteri_notlari (takip_tarihi) where takip_tarihi is not null and tamamlandi_at is null;

alter table public.platform_musteri_notlari enable row level security;
revoke all on public.platform_musteri_notlari from public, anon;
grant select, insert, update, delete on public.platform_musteri_notlari to authenticated;

drop policy if exists "Notları kurucu okur" on public.platform_musteri_notlari;
create policy "Notları kurucu okur" on public.platform_musteri_notlari for select to authenticated
  using ((select private.is_arvoos_founder()));
drop policy if exists "Notu kurucu yazar" on public.platform_musteri_notlari;
create policy "Notu kurucu yazar" on public.platform_musteri_notlari for insert to authenticated
  with check ((select private.is_arvoos_founder()) and yazan = (select auth.uid()));
drop policy if exists "Notu kurucu günceller" on public.platform_musteri_notlari;
create policy "Notu kurucu günceller" on public.platform_musteri_notlari for update to authenticated
  using ((select private.is_arvoos_founder())) with check ((select private.is_arvoos_founder()));
drop policy if exists "Notu kurucu siler" on public.platform_musteri_notlari;
create policy "Notu kurucu siler" on public.platform_musteri_notlari for delete to authenticated
  using ((select private.is_arvoos_founder()));

/* Metin, kurum, yazan ve zaman değişmez; yalnızca takip ve tamamlandı. */
create or replace function private.musteri_notu_degismez()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.metin is distinct from old.metin
     or new.organization_id is distinct from old.organization_id
     or new.yazan is distinct from old.yazan
     or new.olusturuldu is distinct from old.olusturuldu then
    raise exception 'Notun metni değiştirilemez; yanlışsa silip yenisini yazın.';
  end if;
  return new;
end;
$$;

revoke all on function private.musteri_notu_degismez() from public, anon, authenticated;

drop trigger if exists musteri_notu_degismez on public.platform_musteri_notlari;
create trigger musteri_notu_degismez before update on public.platform_musteri_notlari
  for each row execute function private.musteri_notu_degismez();
