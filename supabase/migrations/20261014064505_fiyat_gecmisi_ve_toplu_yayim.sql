/*
  FİYAT GEÇMİŞİ VE TOPLU YAYIM (14.10.2026, Kurucu Konsolu 2. aşama).

  platform_fiyat_listesi (20261014055432) her satırı ayrı yayımlıyordu ve
  iz bırakmıyordu: updated_by / updated_at her değişiklikte üstüne
  yazılıyor, "bu fiyat ne zaman, kimden, neyden neye değişti" sorusunun
  cevabı hiçbir yerde yoktu. Üç basamaklı bir zam da üç ayrı yayımdı;
  arada site yarı güncel bir liste gösteriyordu (Başlangıç yeni, Kurumsal
  eski — merdiven bir süreliğine ters dönebiliyordu).

  1. taslak_bekliyor: "yayımlanmayı bekleyen bir taslak var" bayrağı.
     Eskiden bu, taslak_kurus ile aylik_kurus'un farkından çıkarılıyordu;
     ama taslak_kurus NULL hem "taslak yok" hem "teklif usulüne çevir"
     demekti ve "koda dön" denen bir satırın eski taslağı, toplu yayımda
     istemeden yeniden yayımlanırdı. Bayrak açık: kaydedince açılır,
     yayımlayınca ya da taslak geri alınınca kapanır.

  2. platform_fiyat_gecmisi: her taslak, yayım, geri alma ve koda dönüş
     bir satır. Tetikleyiciyle yazılıyor — kayıt eylemin kendisinden
     bağımsız olsun, panelden başka bir yoldan yapılan değişiklik de iz
     bıraksın. Silme ve güncelleme kimseye açık değil.

  3. platform_fiyatlari_yayimla(): bekleyen BÜTÜN taslakları tek UPDATE
     ile yayımlar; liste ya tamamen eski ya tamamen yeni. Doğrulama
     (basamak sırası, büyük değişim) panelde yapılıyor ve önizlemede
     gösteriliyor (lib/fiyat-dogrulama.ts); işlev yalnızca yetkiyi ve
     atomikliği sağlıyor.
*/

alter table public.platform_fiyat_listesi
  add column if not exists taslak_bekliyor boolean not null default false;

/* Mevcut satırlar: yayımlanmamış taslak ya da yayındakinden farklı
   taslak "bekliyor" sayılır (eski ekranın "yayım bekliyor" kuralı). */
update public.platform_fiyat_listesi
set taslak_bekliyor = true
where yayimlandi_at is null or taslak_kurus is distinct from aylik_kurus;

create table if not exists public.platform_fiyat_gecmisi (
  id bigint generated always as identity primary key,
  kod text not null,
  islem text not null,
  /* Değişiklikten önceki ve sonraki tutar, kuruş. Yayımda önceki =
     yayındaki tutar; NULL ve onceki_yayimli = false ise koddaki değer
     geçerliydi. */
  onceki_kurus bigint,
  onceki_yayimli boolean not null default false,
  yeni_kurus bigint,
  kim uuid,
  zaman timestamptz not null default now(),
  constraint platform_fiyat_gecmisi_islem_check
    check (islem in ('taslak', 'taslak_iptal', 'yayim', 'koda_donus'))
);

create index if not exists platform_fiyat_gecmisi_zaman_idx on public.platform_fiyat_gecmisi (zaman desc);

alter table public.platform_fiyat_gecmisi enable row level security;

drop policy if exists kurucu_fiyat_gecmisini_okur on public.platform_fiyat_gecmisi;
create policy kurucu_fiyat_gecmisini_okur on public.platform_fiyat_gecmisi
  as permissive for select to authenticated
  using (private.is_arvoos_founder());

/* Geçmiş yalnızca tetikleyiciyle yazılır; kimse elle ekleyemez,
   değiştiremez, silemez. Düzenek her tabloyu anon'a açtığı için
   yetkiler açıkça yazılıyor. */
revoke all on table public.platform_fiyat_gecmisi from anon, authenticated;
grant select on table public.platform_fiyat_gecmisi to authenticated;
grant all on table public.platform_fiyat_gecmisi to service_role;

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
    insert into public.platform_fiyat_gecmisi (kod, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, 'yayim', case when v_eski_yayimli then old.aylik_kurus end, v_eski_yayimli, new.aylik_kurus, v_kim);
  -- Koda dönüş: yayındaydı, artık değil.
  elsif v_eski_yayimli and new.yayimlandi_at is null then
    insert into public.platform_fiyat_gecmisi (kod, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, 'koda_donus', old.aylik_kurus, true, null, v_kim);
  -- Taslak kaydı: bekleyen taslak açıldı ya da tutarı değişti.
  elsif new.taslak_bekliyor
     and (tg_op = 'INSERT' or not old.taslak_bekliyor or old.taslak_kurus is distinct from new.taslak_kurus) then
    insert into public.platform_fiyat_gecmisi (kod, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, 'taslak', new.aylik_kurus, new.yayimlandi_at is not null, new.taslak_kurus, v_kim);
  -- Taslak geri alındı (yayımlanmadan kapandı).
  elsif tg_op = 'UPDATE' and old.taslak_bekliyor and not new.taslak_bekliyor then
    insert into public.platform_fiyat_gecmisi (kod, islem, onceki_kurus, onceki_yayimli, yeni_kurus, kim)
    values (new.kod, 'taslak_iptal', old.taslak_kurus, false, new.aylik_kurus, v_kim);
  end if;
  return new;
end
$$;

revoke all on function private.arvo_fiyat_gecmisi_yaz() from public, anon, authenticated;

drop trigger if exists arvo_fiyat_gecmisi_yaz on public.platform_fiyat_listesi;
create trigger arvo_fiyat_gecmisi_yaz
  after insert or update on public.platform_fiyat_listesi
  for each row execute function private.arvo_fiyat_gecmisi_yaz();

/*
  Toplu yayım. SECURITY INVOKER: yazma yetkisini RLS (kurucu_fiyati_
  gunceller) veriyor; açık kurucu denetimi, yetkisiz çağrının sessizce
  "0 satır" dönmesi yerine hata vermesi için. Tek UPDATE = tek an: bütün
  satırlar aynı yayimlandi_at ile yayına girer.
*/
create or replace function public.platform_fiyatlari_yayimla()
returns integer
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_sayi integer;
  /* Yayım anı bir kez alınıyor: bütün satırlar aynı anla yayına girer.
     now() değil clock_timestamp(): aynı işlem içindeki ikinci yayım da
     yeni bir an olsun, geçmiş onu ayrı bir yayım olarak yazsın. */
  v_an timestamptz := clock_timestamp();
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Bu işlem için kurucu yetkisi gerekiyor.';
  end if;
  update public.platform_fiyat_listesi
  set aylik_kurus = taslak_kurus,
      yayimlandi_at = v_an,
      taslak_bekliyor = false,
      updated_by = (select auth.uid()),
      updated_at = v_an
  where taslak_bekliyor;
  get diagnostics v_sayi = row_count;
  return v_sayi;
end
$$;

revoke all on function public.platform_fiyatlari_yayimla() from public, anon;
grant execute on function public.platform_fiyatlari_yayimla() to authenticated, service_role;
