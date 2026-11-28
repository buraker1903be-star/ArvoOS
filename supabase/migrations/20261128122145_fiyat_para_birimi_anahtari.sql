/*
  İKİNCİ AŞAMA — YENİ UYGULAMA YAYINA ALINDIKTAN SONRA (28.11.2026).

  Birinci aşama (20261128114027) yalnızca sütun ekledi ve eski
  uygulamayı hiç etkilemedi. Bu dosya anahtarı ve yayım sözleşmesini
  değiştiriyor; ikisi de eski uygulamayla UYUMSUZ:

   - `on conflict (kod)` ile yazan eski taslak yolu düşer,
   - `kod:tutar` biçimindeki eski onay imzası eşleşmez ve yayım
     reddedilir.

  Bu yüzden sıra: (1) birinci aşama migration → (2) yeni sürümün
  dağıtımı → (3) bu migration. Ölçüm ve geri dönüş yordamı
  tests/db/fiyat-eski-uygulama-uyumu.test.mjs ve PR'da.
*/

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

/*
  ÖNCE DÜŞÜRÜLÜYOR: dönüş tipi değişiyor (iki sütundan üçe) ve Postgres
  `create or replace` ile dönüş tipi değişikliğini kabul etmiyor
  ("cannot change return type of existing function"). Gövdeleri çalışma
  anında çözüldüğü için bu işlevi çağıran iki plpgsql işlevi
  etkilenmiyor; ikisi de aşağıda yeniden yazılıyor.
*/
drop function if exists private.fiyat_kapsam_cozumle(text);

create function private.fiyat_kapsam_cozumle(p_kapsam text)
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
