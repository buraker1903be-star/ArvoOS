/*
  KULLANIM SÖZLEŞMESİ ONAY KAYDI (29.10.2026, kurum sahibinin isteği:
  "ArvoLab'daki gibi ArvoOS'ta da panele giren herkes önce sözleşmeyi
  okuyup kabul etsin; IP, cihaz ve konum bilgisi hukuki geçerlilik için
  önemli").

  ArvoLab'daki kaydın (ArvoLab 20261029153742) ArvoOS'taki ikizi; iki
  ürün ayrı veritabanında olduğu için tablo ikisinde ayrı. Kullanıcının
  ArvoOS Kullanım Sözleşmesi'ni (lib/sozlesme/kullanim-sozlesmesi.ts)
  gördüğünün, sonuna kadar kaydırdığının ve onayladığının DELİLİ.

  Kurallar (ArvoLab'dakiyle aynı):
   * Yalnızca SUNUCU yazar (service_role). IP, cihaz ve konum isteğin
     başlıklarından sunucuda okunur; istemci yazabilseydi kayıt delil
     olmazdı.
   * DEĞİŞTİRİLEMEZ: hiçbir rol güncelleyemez ya da silemez (service_role
     dâhil). Tek istisna, hesap silinince yabancı anahtarın user_id'yi
     NULL'a çekmesi; e-posta ve ad o anki hâliyle satırda kalır.
   * Kullanıcı yalnızca KENDİ onaylarını okur; kurucu konsolu kişi
     sayfasında sunucu anahtarıyla okur.
   * Metnin kendisi değil SHA-256 özeti tutulur; metin sürümüyle birlikte
     depoda (git geçmişi).

  KONUM (ArvoLab'da yok, burada ilk kez): barındırıcının (Vercel) IP
  adresinden çıkardığı yaklaşık konum — ülke, bölge, şehir, enlem/boylam,
  saat dilimi. Tarayıcıdan GPS konumu İSTENMİYOR: izin penceresi
  reddedilebilir (onay kapısı kilitlenirdi) ve kesin konum, KVKK
  bakımından amaçla ölçülü olmayan bir veri. IP'den çıkan konum hangi
  ağdan ve şehirden onay verildiğini gösteriyor; delilin amacı bu.
*/
create table if not exists public.sozlesme_onaylari (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  belge text not null check (belge in ('kullanim_sozlesmesi')),
  surum text not null check (char_length(surum) between 1 and 40),
  dil text not null check (dil in ('tr', 'en')),
  metin_ozeti text not null check (metin_ozeti ~ '^[0-9a-f]{64}$'),
  kaydirma_tamamlandi boolean not null,
  ip text check (ip is null or char_length(ip) <= 100),
  kullanici_araci text check (kullanici_araci is null or char_length(kullanici_araci) <= 1000),
  tarayici_dili text check (tarayici_dili is null or char_length(tarayici_dili) <= 200),
  ulke text check (ulke is null or char_length(ulke) <= 10),
  bolge text check (bolge is null or char_length(bolge) <= 100),
  sehir text check (sehir is null or char_length(sehir) <= 120),
  enlem numeric check (enlem is null or enlem between -90 and 90),
  boylam numeric check (boylam is null or boylam between -180 and 180),
  saat_dilimi text check (saat_dilimi is null or char_length(saat_dilimi) <= 60),
  -- Hangi adresten girildi: kiracı paneli, kurumun kendi alan adı ya da kurucu konsolu.
  adres text check (adres is null or char_length(adres) <= 255),
  eposta text check (eposta is null or char_length(eposta) <= 320),
  ad_soyad text check (ad_soyad is null or char_length(ad_soyad) <= 200),
  -- Onay anında açık olan çalışma alanı. Kurum silinse de kayıt kalsın diye yabancı anahtar YOK.
  organization_id uuid,
  kurum_adi text check (kurum_adi is null or char_length(kurum_adi) <= 200),
  onaylandi timestamptz not null default now()
);

create index if not exists sozlesme_onaylari_kullanici_idx
  on public.sozlesme_onaylari (user_id, belge, surum, onaylandi desc);

alter table public.sozlesme_onaylari enable row level security;

revoke all on public.sozlesme_onaylari from public, anon, authenticated;
grant select on public.sozlesme_onaylari to authenticated;
revoke all on public.sozlesme_onaylari from service_role;
grant select, insert on public.sozlesme_onaylari to service_role;

drop policy if exists "Kendi sözleşme onaylarını görür" on public.sozlesme_onaylari;
create policy "Kendi sözleşme onaylarını görür"
  on public.sozlesme_onaylari
  for select
  to authenticated
  using (user_id = (select auth.uid()));

/*
  Değişmezlik tetikleyicisi. Yetkiler zaten UPDATE/DELETE vermiyor; bu
  ikinci kat, tablo sahibinin (SQL Editor) yanlışlıkla yapacağı bir
  değişikliği de durdurur. "on delete set null" bir UPDATE olarak çalıştığı
  için yalnızca user_id'nin NULL'a çekilmesine izin verilir.
*/
create or replace function public.sozlesme_onayi_degismez()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_beklenen public.sozlesme_onaylari;
begin
  if tg_op = 'DELETE' then
    raise exception 'Sözleşme onay kaydı silinemez.' using errcode = 'insufficient_privilege';
  end if;
  v_beklenen := old;
  v_beklenen.user_id := null;
  if new.user_id is not null or new is distinct from v_beklenen then
    raise exception 'Sözleşme onay kaydı değiştirilemez.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function public.sozlesme_onayi_degismez() from public, anon, authenticated;

drop trigger if exists sozlesme_onayi_degismez on public.sozlesme_onaylari;
create trigger sozlesme_onayi_degismez
  before update or delete on public.sozlesme_onaylari
  for each row execute function public.sozlesme_onayi_degismez();

notify pgrst, 'reload schema';
