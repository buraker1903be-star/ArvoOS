/*
  DESTEK HAZIR YANITLARI VE SEÇİLİ KURUMLARA DUYURU (02.11.2026).

  1) platform_hazir_yanitlar: kurucunun destek taleplerinde sık yazdığı
     yanıtlar ("şifre sıfırlama adımları", "fatura ayın 1'inde kesilir").
     Talep ekranında tek tıkla yanıt kutusuna ekleniyor; {kurum}
     yer tutucusu kurumun adıyla doluyor (ekranda, gönderilmeden önce —
     kurucu metni yine okuyup düzeltebiliyor). Yalnızca kurucu okur ve
     yazar; kiracıya kapalı.

  2) Duyuru geçmişine "secili" hedefi: Müşteriler listesinde seçilen
     kurumlara gönderilen duyuru. Eskiden hedef yalnızca "bütün kurumlar"
     ya da "bir ürünün kullanıcıları"ydı; birkaç kuruma özel bir duyuru
     için tek tek e-posta yazmak gerekiyordu.
*/
create table if not exists public.platform_hazir_yanitlar (
  id uuid primary key default gen_random_uuid(),
  baslik text not null check (char_length(btrim(baslik)) between 2 and 80),
  metin text not null check (char_length(btrim(metin)) between 2 and 3000),
  olusturan uuid references auth.users(id) on delete set null,
  olusturuldu timestamptz not null default now()
);

alter table public.platform_hazir_yanitlar enable row level security;
revoke all on public.platform_hazir_yanitlar from public, anon;
grant select, insert, update, delete on public.platform_hazir_yanitlar to authenticated;

drop policy if exists "Hazır yanıtları kurucu okur" on public.platform_hazir_yanitlar;
create policy "Hazır yanıtları kurucu okur" on public.platform_hazir_yanitlar for select to authenticated
  using ((select private.is_arvoos_founder()));
drop policy if exists "Hazır yanıtı kurucu yazar" on public.platform_hazir_yanitlar;
create policy "Hazır yanıtı kurucu yazar" on public.platform_hazir_yanitlar for insert to authenticated
  with check ((select private.is_arvoos_founder()) and olusturan = (select auth.uid()));
drop policy if exists "Hazır yanıtı kurucu günceller" on public.platform_hazir_yanitlar;
create policy "Hazır yanıtı kurucu günceller" on public.platform_hazir_yanitlar for update to authenticated
  using ((select private.is_arvoos_founder())) with check ((select private.is_arvoos_founder()));
drop policy if exists "Hazır yanıtı kurucu siler" on public.platform_hazir_yanitlar;
create policy "Hazır yanıtı kurucu siler" on public.platform_hazir_yanitlar for delete to authenticated
  using ((select private.is_arvoos_founder()));

alter table public.platform_duyurulari drop constraint if exists platform_duyurulari_hedef_check;
alter table public.platform_duyurulari add constraint platform_duyurulari_hedef_check
  check (hedef in ('tum', 'arvoos', 'arvolab', 'arc', 'randevu', 'secili'));
