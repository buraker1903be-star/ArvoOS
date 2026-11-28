/*
  BİLEŞİK ANAHTARI GERİ AL — HAZIRLANMIŞ GERİ DÖNÜŞ BETİĞİ.

  BU BİR MIGRATION DEĞİL ve `supabase/migrations/` altında DURMAZ.
  Numaralı bir dosya olsaydı her dağıtımda ve her akış testinde sırayla
  uygulanır, yani geçişi kendiliğinden geri alırdı. Buradaki dosya elle,
  yalnızca karar verilirse çalıştırılır (SQL Editor). Sınanıyor:
  tests/db/para-birimi-geri-donus.test.mjs.

  NE İŞE YARIYOR. 20261128122145 uygulandıktan sonra uygulamanın ESKİ
  sürümü (main @ 5ef77c8e) fiyat taslağı KAYDEDEMİYOR: `on conflict
  (kod)` bileşik anahtarla eşleşmediği için "no unique or exclusion
  constraint" veriyor. Bu, satırların içeriğiyle ilgili DEĞİL; USD
  satırı hiç olmasa bile düşüyor. Yani Vercel'den bir önceki dağıtıma
  dönmek tek başına bir geri dönüş değil — şema de geri alınmalı.

  ÖNCE OKUNACAK UYARI. Varsayılan yol GERİ DÖNÜŞ DEĞİL, İLERİ YÖNLÜ
  DÜZELTMEDİR (docs/para-birimi-gecis-plani.md). Bu betik son çare:
  yalnızca uygulamanın yeni sürümü bütünüyle kullanılamaz hâldeyse ve
  USD satışı henüz hiç açılmamışsa.

  VERİ KAYBI YOK, AMA KOŞULLU. Anahtar tek sütuna dönerken aynı kodun
  iki satırı duramaz. Betik bu yüzden ÖNCE sayıyor ve birden çok birimi
  olan bir kod varsa HİÇBİR ŞEY YAPMADAN düşüyor: "USD satırlarını
  topluca sil/yayından kaldır" bir geri dönüş adımı değil (yayından
  kalkan basamak ücretler sayfasında "Teklif"e düşer, kurulumun "liste
  fiyatını uygula" tutarı boşalır — müşteriye görünen bir değişiklik).
  O durumda karar insanın: hangi USD satırının silineceğini kurucu
  söyler.

  GERİ ALINANLAR (20261127182525 + 20261127191104 hâline):
   1. platform_fiyat_listesi birincil anahtarı → (kod)
   2. public.platform_fiyat_kapsam_imzasi()    → "kod:tutar"
   3. private.fiyat_kapsam_cozumle(text)       → (kod, taslak_kurus)
   4. private.fiyat_kapsam_yayimla(text,…)     → kod + tutar eşleşmesi

  GERİ ALINMAYANLAR, BİLEREK:
   - `para_birimi` SÜTUNU ve kısıtı kalıyor. Eski sürüm sütunu hiç
     yazmıyor, varsayılan TRY devreye giriyor; sütunu düşürmek fiyat
     geçmişindeki birim bilgisini de götürürdü.
   - organization_licenses / organization_product_licenses.para_birimi
     ve platform_urun_para_ayarlari kalıyor: ödeme tarafı (20261128122230)
     fiyat anahtarına bağlı değil ve eski sürümle çalışmaya devam ediyor.
*/

do $$
declare
  v_cakisan text;
begin
  select string_agg(kod, ', ' order by kod) into v_cakisan
  from (
    select kod from public.platform_fiyat_listesi group by kod having count(*) > 1
  ) as c;

  if v_cakisan is not null then
    raise exception 'Geri alınamaz: şu kodların birden çok para biriminde satırı var: %', v_cakisan
      using hint = 'Hangi satırın kalacağına kurucu karar verir; betik veri silmez.';
  end if;
end
$$;

alter table public.platform_fiyat_listesi
  drop constraint platform_fiyat_listesi_pkey;
alter table public.platform_fiyat_listesi
  add constraint platform_fiyat_listesi_pkey primary key (kod);

/* 20261127182525'teki gövde: imza "kod:tutar". */
create or replace function public.platform_fiyat_kapsam_imzasi()
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(
    string_agg(parca, '|' order by parca),
    ''
  )
  from (
    select kod || ':' || coalesce(taslak_kurus::text, 'teklif') as parca
    from public.platform_fiyat_listesi
    where taslak_bekliyor
  ) as parcalar;
$$;

revoke all on function public.platform_fiyat_kapsam_imzasi() from public, anon;
grant execute on function public.platform_fiyat_kapsam_imzasi() to authenticated, service_role;

/* Dönüş tipi değişiyor: önce düşürülmesi gerekiyor (Postgres
   "cannot change return type of existing function" diyor). */
drop function if exists private.fiyat_kapsam_cozumle(text);

create function private.fiyat_kapsam_cozumle(p_kapsam text)
returns table (kod text, taslak_kurus bigint)
language sql
immutable
set search_path to ''
as $$
  select
    split_part(parca, ':', 1) as kod,
    case
      when split_part(parca, ':', 2) = 'teklif' then null
      else split_part(parca, ':', 2)::bigint
    end as taslak_kurus
  from unnest(string_to_array(coalesce(p_kapsam, ''), '|')) as parca
  where parca <> '';
$$;

revoke all on function private.fiyat_kapsam_cozumle(text) from public, anon;
grant execute on function private.fiyat_kapsam_cozumle(text) to authenticated, service_role;

create or replace function private.fiyat_kapsam_yayimla(p_kapsam text, p_an timestamptz)
returns integer
language plpgsql
set search_path to ''
as $$
declare
  v_sayi integer;
begin
  update public.platform_fiyat_listesi f
  set aylik_kurus = f.taslak_kurus,
      yayimlandi_at = p_an,
      taslak_bekliyor = false,
      updated_by = (select auth.uid()),
      updated_at = p_an
  from private.fiyat_kapsam_cozumle(p_kapsam) k
  where f.taslak_bekliyor
    and f.kod = k.kod
    and f.taslak_kurus is not distinct from k.taslak_kurus;
  get diagnostics v_sayi = row_count;
  return v_sayi;
end
$$;

revoke all on function private.fiyat_kapsam_yayimla(text, timestamptz) from public, anon;
grant execute on function private.fiyat_kapsam_yayimla(text, timestamptz) to authenticated, service_role;
