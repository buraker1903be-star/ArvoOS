/*
  FİYAT LİSTESİ ÇOK PARA BİRİMLİ (28.11.2026).

  ArvoLab'ın yeni satışları USD'ye geçiyor, öteki ürünler de yönetici
  isterse USD fiyatlandırılabilecek. Bugünkü liste bunu taşıyamıyor:
  `platform_fiyat_listesi`in birincil anahtarı yalnızca `kod` ve para
  birimi diye bir sütunu yok — yani bir planın TRY ve USD fiyatı aynı
  anda duramıyor.

  DÖNÜŞÜM DEĞİL, GENİŞLETME. Var olan 16 satırın tamamı TRY'dir ve öyle
  kalıyor: sütun `default 'TRY'` ile ekleniyor, hiçbir tutar
  çevrilmiyor, hiçbir tarihsel kayıt varsayımla USD'ye alınmıyor.
  Kur çevrimi bu işin dışında (kurum sahibinin kararı).

  Beş parça:

   1. `para_birimi` sütunu + ISO kısıtı (TRY/USD) ve birincil anahtarın
      `(kod, para_birimi)` olması. Aynı plan iki birimde yaşayabilsin.
   2. Fiyat geçmişi de para birimini yazsın — yoksa "4.990 → 5.490"
      satırı hangi birimde olduğunu söylemiyor.
   3. Kapsam imzası `kod:para:tutar`. PR #335'in kapsam kilidi çok para
      birimine uyumlu hâle geliyor: önizlemeden sonra USD ya da TRY
      taslağı değişirse eski onay düşüyor. İmza biçimi arayüzdeki
      ikiziyle (lib/fiyat-dogrulama → kapsamImzasi) birebir aynı.
   4. Yayım yalnızca onaylanan (kod, para birimi, tutar) üçlülerini
      yazıyor; kısmi yayım yok (20261127191104'teki kuralın aynısı,
      para birimi eklenmiş hâli).
   5. ESKİ İSTEMCİ UYUMU: imzasız `platform_fiyatlari_yayimla()`
      değişmedi, bekleyen her taslağı yayımlamaya devam ediyor; eski
      imza biçimiyle (`kod:tutar`) gelen bir çağrı ise artık eşleşmiyor
      ve "önizlemeden sonra değişti" ile reddediliyor — sessizce yanlış
      satırı yayımlamaktansa reddetmek doğru.
*/

alter table public.platform_fiyat_listesi
  add column if not exists para_birimi text not null default 'TRY';

alter table public.platform_fiyat_listesi
  drop constraint if exists platform_fiyat_listesi_para_birimi_check;
alter table public.platform_fiyat_listesi
  add constraint platform_fiyat_listesi_para_birimi_check
  check (para_birimi in ('TRY', 'USD'));

/*
  Birincil anahtar genişliyor. `kod` tek başına benzersiz kalamaz:
  arvolab-arastirmaci hem TRY hem USD satırı taşıyacak. Başka tablo bu
  anahtara yabancı anahtarla bağlı değil (kontrol edildi), bu yüzden
  düşürüp yeniden kurmak güvenli.
*/
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.platform_fiyat_listesi'::regclass
       and conname = 'platform_fiyat_listesi_pkey'
       and (select count(*) from unnest(conkey)) = 1
  ) then
    alter table public.platform_fiyat_listesi drop constraint platform_fiyat_listesi_pkey;
    alter table public.platform_fiyat_listesi add constraint platform_fiyat_listesi_pkey primary key (kod, para_birimi);
  end if;
end
$$;

alter table public.platform_fiyat_gecmisi
  add column if not exists para_birimi text not null default 'TRY';
alter table public.platform_fiyat_gecmisi
  drop constraint if exists platform_fiyat_gecmisi_para_birimi_check;
alter table public.platform_fiyat_gecmisi
  add constraint platform_fiyat_gecmisi_para_birimi_check
  check (para_birimi in ('TRY', 'USD'));

/*
  Geçmiş tetikleyicisi: gövde 20261014064505'teki hâlin aynısı, tek
  fark her satıra `para_birimi` yazması. Gövde anlık görüntüden değil
  o migration'dan türetildi; arada başka bir değişiklik olmadı
  (canlı döküm 28.11.2026 ile karşılaştırıldı).
*/
create or replace function private.arvo_fiyat_gecmisi_yaz()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_kim uuid := coalesce((select auth.uid()), new.updated_by);
  v_eski_yayimli boolean := tg_op = 'UPDATE' and old.yayimlandi_at is not null;
begin
  -- Yayım: yayım anı değişti ve satır yayında.
  if new.yayimlandi_at is not null
     and (tg_op = 'INSERT' or old.yayimlandi_at is distinct from new.yayimlandi_at) then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'yayim', case when v_eski_yayimli then old.aylik_kurus end, v_eski_yayimli, new.aylik_kurus, v_kim);
  -- Koda dönüş: yayındaydı, artık değil.
  elsif v_eski_yayimli and new.yayimlandi_at is null then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'koda_donus', old.aylik_kurus, true, null, v_kim);
  -- Taslak kaydı: bekleyen taslak açıldı ya da tutarı değişti.
  elsif new.taslak_bekliyor
     and (tg_op = 'INSERT' or not old.taslak_bekliyor or old.taslak_kurus is distinct from new.taslak_kurus) then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'taslak', new.aylik_kurus, new.yayimlandi_at is not null, new.taslak_kurus, v_kim);
  -- Taslak geri alındı (yayımlanmadan kapandı).
  elsif tg_op = 'UPDATE' and old.taslak_bekliyor and not new.taslak_bekliyor then
    insert into public.platform_fiyat_gecmisi (kod, para_birimi, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, new.para_birimi, 'taslak_iptal', old.taslak_kurus, false, new.aylik_kurus, v_kim);
  end if;
  return new;
end
$$;

revoke all on function private.arvo_fiyat_gecmisi_yaz() from public, anon, authenticated;

/*
  KAPSAM İMZASI ARTIK PARA BİRİMİNİ TAŞIYOR: "kod:para:tutar", teklif
  için "kod:para:teklif", artan sırada "|" ile birleşik. Biçim
  değişikliği bilinçli ve geri uyumsuz: eski biçimle (kod:tutar) gelen
  bir onay eşleşmez ve yayım reddedilir. Sessizce kabul etmek, USD
  satırını TRY onayıyla yayımlamak demekti.
*/
create or replace function public.platform_fiyat_kapsam_imzasi()
returns text
language sql
stable
set search_path to ''
as $$
  select coalesce(string_agg(parca, '|' order by parca), '')
  from (
    select kod || ':' || para_birimi || ':' || coalesce(taslak_kurus::text, 'teklif') as parca
    from public.platform_fiyat_listesi
    where taslak_bekliyor
  ) as parcalar;
$$;

revoke all on function public.platform_fiyat_kapsam_imzasi() from public, anon;
grant execute on function public.platform_fiyat_kapsam_imzasi() to authenticated, service_role;

create or replace function private.fiyat_kapsam_cozumle(p_kapsam text)
returns table (kod text, para_birimi text, taslak_kurus bigint)
language sql
immutable
set search_path to ''
as $$
  select
    split_part(parca, ':', 1) as kod,
    split_part(parca, ':', 2) as para_birimi,
    case
      when split_part(parca, ':', 3) = 'teklif' then null
      else split_part(parca, ':', 3)::bigint
    end as taslak_kurus
  from unnest(string_to_array(coalesce(p_kapsam, ''), '|')) as parca
  /* Üç parçası olmayan girdi (eski "kod:tutar" biçimi) hiç satır
     üretmiyor: imza karşılaştırması zaten uyuşmayacak, ama yazma
     yoluna yanlış bir çift sızmasın. */
  where parca <> '' and split_part(parca, ':', 3) <> '';
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
  /* Yazma ONAYLANAN üçlülerle sınırlı: kod + para birimi + tutar.
     `is not distinct from` teklif satırı için gerekiyor (taslak NULL). */
  update public.platform_fiyat_listesi f
  set aylik_kurus = f.taslak_kurus,
      yayimlandi_at = p_an,
      taslak_bekliyor = false,
      updated_by = (select auth.uid()),
      updated_at = p_an
  from private.fiyat_kapsam_cozumle(p_kapsam) k
  where f.taslak_bekliyor
    and f.kod = k.kod
    and f.para_birimi = k.para_birimi
    and f.taslak_kurus is not distinct from k.taslak_kurus;
  get diagnostics v_sayi = row_count;
  return v_sayi;
end
$$;

revoke all on function private.fiyat_kapsam_yayimla(text, timestamptz) from public, anon;
grant execute on function private.fiyat_kapsam_yayimla(text, timestamptz) to authenticated, service_role;
