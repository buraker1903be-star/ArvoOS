/*
  KURUMA ÖZEL MODÜLLER: İZİN LİSTESİ (14.11.2026).

  Bazı modüller tek bir kuruma yapılıyor (ilk örnek: AkademikMerkez'e özel
  Doçentlik Puanı, ArvoLab'den taşınıyor). Bugünkü modül altyapısı bunu
  korumuyor, iki yerden:

   1. provision_customer_organization yeni ENTERPRISE kurumda
      arvo_modules.is_active = true olan BÜTÜN modülleri açıyor. Kuruma
      özel bir modül katalogda etkin olduğu an, sonradan açılan her
      enterprise kuruma kendiliğinden açılırdı.
   2. Kurucu Platform → kiracı dosyasından katalogdaki HER modülü HER
      kurumda açabiliyor (toggleOrganizationModule yalnızca kodun
      katalogda olup olmadığına bakıyor).

  Menüde gizlemek ya da TS'te kontrol etmek yetmez: satır açıksa panel
  bağlamı modülü listeler (arvo_panel_baglami yalnızca
  organization_modules.is_enabled'a bakıyor) ve o modülün RLS'i
  "kurumda açık" koşuluyla veriyi açar.

  Bu migration karar noktasını VERİTABANINA koyuyor:
   - public.ozel_moduller: hangi modül kuruma özel.
   - public.ozel_modul_kurumlari: özel bir modülün hangi kurumlarda
     açılabileceği (izin listesi). Yalnızca migration ve service_role
     yazar; kurucu dahil panel kullanıcısı yazamaz.
   - organization_modules koruması: izin listesinde olmayan kurumda özel
     modül AÇILAMAZ. INSERT'te sessizce kapalıya çevrilir (kurum açma
     işlevi ve toplu satır ekleyen migration'lar kırılmasın), UPDATE'te
     açık bir hatayla reddedilir (kurucu neden açılmadığını görsün).
     Satırın kurumu ve modül kodu hiçbir koşulda değişmez.
   - Eşitleme: kurum izin listesinden çıkarılınca ya da açık olan bir
     modül sonradan "özel" ilan edilince, izinsiz kurumlardaki satır
     kapatılır.
   - FAIL-CLOSED özel statü: ozel_moduller satırı doğrudan silinemez ve
     değiştirilemez (katalogdan modül silinmesiyle gelen kaskat dahil).
     Bir modülü herkese açmak yalnızca açık ve gerekçeli bir süreçle
     olur: private.ozel_modul_statusunu_kaldir(kod, gerekçe). İşlevi
     yalnızca veritabanı sahibi (migration) çalıştırabilir.
   - public.ozel_modul_gecmisi: özel ilan, statü kaldırma, izin ekleme ve
     kaldırma — kim (veritabanı rolü), ne zaman, hangi gerekçeyle.

  RLS YARDIMCISI BİR SÖZLEŞMEDİR, KENDİ BAŞINA KORUMA DEĞİLDİR.
  private.modul_kurumda_acik(org, modül), bir özel modülün VERİSİNİ ancak
  o modülün tablolarındaki ve Storage kovasındaki RLS politikaları onu
  çağırırsa korur. Bu migration yalnızca organization_modules satırını
  koruyor (modülün menüde görünmesi ve kurumda "açık" sayılması). Özel
  modül ekleyen her migration (ilki Doçentlik, PR3) okuma ve yazma
  politikalarının HEPSİNDE bu yardımcıyı çağırmak zorunda; yalnızca
  "kurumun üyesi mi" diye bakan bir politika, modülü izin listesi
  olmadan herkese açar. tests/db/ozel-modul-izin-listesi.test.mjs bunu
  sabitliyor: özel ilan edilmiş her modül için bu yardımcıyı ve modül
  kodunu birlikte anan en az bir politika arıyor, bulamazsa düşüyor.

  Bu migration HİÇBİR modülü özel ilan etmiyor: var olan modüllerin
  davranışı değişmez.

  Koruma kimliğe bakmıyor (current_user'a değil, izin listesine): kurucu,
  service_role ve migration için aynı kural geçerli. "Hiçbir yoldan" ancak
  böyle sağlanır; tek istisna tetikleyicileri kapatabilen süper kullanıcı
  (ona karşı ikinci katman RLS yardımcısıdır).
*/

-- ---------- 1. Özel modül kaydı ----------

/*
  arvo_modules'a "on delete cascade" bilerek duruyor: katalogdan özel bir
  modül silinmek istenirse kaskat aşağıdaki silme korumasına çarpar ve
  işlem DÜŞER. Kaskat yerine "restrict" yazmak da düşürürdü, ama hatası
  sebebi söylemezdi.
*/
create table if not exists public.ozel_moduller (
  module_code text primary key references public.arvo_modules(code) on delete cascade,
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  created_at timestamptz not null default now()
);

alter table public.ozel_moduller enable row level security;

-- ---------- 2. İzin listesi ----------

create table if not exists public.ozel_modul_kurumlari (
  module_code text not null references public.ozel_moduller(module_code) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  aciklama text check (aciklama is null or char_length(aciklama) <= 300),
  eklendi_at timestamptz not null default now(),
  primary key (module_code, organization_id)
);

create index if not exists ozel_modul_kurumlari_kurum on public.ozel_modul_kurumlari (organization_id);

alter table public.ozel_modul_kurumlari enable row level security;

-- ---------- 3. Geçmiş ----------

/*
  Yabancı anahtar YOK: kayıt, modül ya da kurum silindikten sonra da
  durmalı. Satırları yalnızca bu migration'ın tetikleyicileri ve statü
  kaldırma işlevi yazar.
*/
create table if not exists public.ozel_modul_gecmisi (
  id bigint generated always as identity primary key,
  module_code text not null,
  organization_id uuid,
  islem text not null check (islem in ('ozel_ilan', 'ozel_kaldirildi', 'izin_eklendi', 'izin_kaldirildi')),
  gerekce text check (gerekce is null or char_length(gerekce) <= 500),
  /*
    Çağıranın rolü. current_user DEĞİL: satırı security definer
    tetikleyiciler yazıyor ve orada current_user her zaman sahip
    (postgres) görünür — kimin yaptığı kaybolurdu (ilk denemede testte
    yakalandı). SET ROLE ile kurulan "role" ayarı definer içinde de
    çağıranı gösteriyor; PostgREST rolü böyle kuruyor.
  */
  veritabani_rolu text not null default coalesce(nullif(current_setting('role', true), 'none'), session_user),
  kullanici_id uuid default auth.uid(),
  at timestamptz not null default now()
);

create index if not exists ozel_modul_gecmisi_modul on public.ozel_modul_gecmisi (module_code, at desc);

alter table public.ozel_modul_gecmisi enable row level security;

/*
  Okuma yalnızca kurucuya (Platform ekranında hangi kurumun izinli olduğunu
  ve geçmişi görebilsin). Yazma politikası YOK ve yetkisi verilmiyor: izin
  listesi ürün kararıdır, migration ya da service_role ile değişir.
  Kurucunun panelden kendine izin yazabildiği bir liste, kurucunun modül
  anahtarından farksız olurdu.
*/
drop policy if exists ozel_moduller_kurucu_okur on public.ozel_moduller;
create policy ozel_moduller_kurucu_okur on public.ozel_moduller
  for select to authenticated
  using (private.is_arvoos_founder());

drop policy if exists ozel_modul_kurumlari_kurucu_okur on public.ozel_modul_kurumlari;
create policy ozel_modul_kurumlari_kurucu_okur on public.ozel_modul_kurumlari
  for select to authenticated
  using (private.is_arvoos_founder());

drop policy if exists ozel_modul_gecmisi_kurucu_okur on public.ozel_modul_gecmisi;
create policy ozel_modul_gecmisi_kurucu_okur on public.ozel_modul_gecmisi
  for select to authenticated
  using (private.is_arvoos_founder());

revoke all on public.ozel_moduller from public, anon, authenticated, service_role;
revoke all on public.ozel_modul_kurumlari from public, anon, authenticated, service_role;
revoke all on public.ozel_modul_gecmisi from public, anon, authenticated, service_role;
grant select on public.ozel_moduller to authenticated;
grant select on public.ozel_modul_kurumlari to authenticated;
grant select on public.ozel_modul_gecmisi to authenticated;
/*
  service_role: özel ilan edebilir ve izin ekleyip kaldırabilir. Özel
  statüyü KALDIRAMAZ (ozel_moduller'de DELETE/UPDATE yok): o, modülü
  herkese açmak demektir ve yalnızca gerekçeli işlevden geçer.
*/
grant select, insert on public.ozel_moduller to service_role;
grant select, insert, delete on public.ozel_modul_kurumlari to service_role;
grant select on public.ozel_modul_gecmisi to service_role;

-- ---------- 4. Yardımcılar ----------

/* Modül kuruma özel değilse her kurumda serbest; özelse yalnızca izin listesindeki kurumda. */
create or replace function private.ozel_modul_izinli(p_org uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select not exists (select 1 from public.ozel_moduller o where o.module_code = p_module)
    or exists (select 1 from public.ozel_modul_kurumlari k
               where k.module_code = p_module and k.organization_id = p_org)
$$;

/*
  Özel modüllerin RLS'i bunu kullanır (sözleşme: başlıktaki not). Üç
  koşul birlikte: izin listesi, kurumda açık, kişinin rolünde/kendisinde
  gizli değil (private.arvo_modul_acik yalnızca sonuncusuna bakıyor;
  analitik modülünde de bu yüzden ikisi birlikte yazıldı).
*/
create or replace function private.modul_kurumda_acik(p_org uuid, p_module text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select private.ozel_modul_izinli(p_org, p_module)
    and exists (select 1 from public.organization_modules om
                where om.organization_id = p_org and om.module_code = p_module and om.is_enabled)
    and private.arvo_modul_acik(p_org, p_module)
$$;

comment on function private.modul_kurumda_acik(uuid, text) is
  'Özel modül erişim sözleşmesi: modülün tablolarındaki ve Storage kovasındaki HER okuma/yazma politikası bunu çağırmalı. Çağırmayan politika, izin listesini atlar. Bkz. 20261114190657.';

revoke all on function private.ozel_modul_izinli(uuid, text) from public, anon;
revoke all on function private.modul_kurumda_acik(uuid, text) from public, anon;
grant execute on function private.ozel_modul_izinli(uuid, text) to authenticated, service_role;
grant execute on function private.modul_kurumda_acik(uuid, text) to authenticated, service_role;

-- ---------- 5. organization_modules koruması ----------

/*
  security definer: tetikleyici kurucunun (authenticated) UPDATE'inde de
  çalışıyor ve izin listesini okuyabilmeli; kurucunun izin listesine
  doğrudan erişimi yalnızca okuma ve yalnızca RLS ile.

  KİMLİK: satırın kurumu ve modül kodu değişmez. Kurucunun güncelleme
  politikası her sütunu açıyor; satırı başka kuruma ya da başka modüle
  taşımak, açık bir satırı izin listesini sormadan başka yere götürmenin
  yolu olurdu. Panelin tek yazması is_enabled; meşru bir taşıma yok.
*/
create or replace function private.ozel_modul_koru()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE'
     and (new.organization_id is distinct from old.organization_id
          or new.module_code is distinct from old.module_code) then
    raise exception 'Modül satırının kurumu ve modül kodu değiştirilemez.' using errcode = '42501';
  end if;
  if new.is_enabled and not private.ozel_modul_izinli(new.organization_id, new.module_code) then
    if tg_op = 'INSERT' then
      -- Kurum açma işlevi (enterprise: bütün etkin modüller) ve toplu satır
      -- ekleyen migration'lar düşmesin: satır kapalı olarak yazılır.
      new.is_enabled := false;
    else
      raise exception 'Bu modül kuruma özeldir ve bu kurum için izin verilmemiştir.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

revoke all on function private.ozel_modul_koru() from public, anon, authenticated, service_role;

drop trigger if exists ozel_modul_koru on public.organization_modules;
create trigger ozel_modul_koru
  before insert or update on public.organization_modules
  for each row execute function private.ozel_modul_koru();

-- ---------- 6. Eşitleme ----------

/* Bir modül özel ilan edilince, izin listesinde olmayan kurumlarda açık satırlar kapanır. */
create or replace function private.ozel_modul_ilan_edildi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.ozel_modul_gecmisi (module_code, islem) values (new.module_code, 'ozel_ilan');
  update public.organization_modules om
     set is_enabled = false
   where om.module_code = new.module_code
     and om.is_enabled
     and not exists (select 1 from public.ozel_modul_kurumlari k
                     where k.module_code = new.module_code and k.organization_id = om.organization_id);
  return null;
end $$;

create or replace function private.ozel_modul_izni_eklendi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.ozel_modul_gecmisi (module_code, organization_id, islem)
  values (new.module_code, new.organization_id, 'izin_eklendi');
  return null;
end $$;

/*
  Kurum izin listesinden çıkarılınca modül o kurumda kapanır. Statü
  kaldırma işlevinin kaskatında (aşağıda) modül artık özel olmadığından
  dokunulmaz: o süreç bilerek "açık olduğu yerde açık kalsın" diyor.
  Kurum silinirken gelen kaskatta organization_modules satırları da
  kaskatla gidiyor; güncelleme boşa düşer, hata vermez.
*/
create or replace function private.ozel_modul_izni_kaldirildi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.ozel_modul_gecmisi (module_code, organization_id, islem)
  values (old.module_code, old.organization_id, 'izin_kaldirildi');
  if exists (select 1 from public.ozel_moduller o where o.module_code = old.module_code) then
    update public.organization_modules
       set is_enabled = false
     where organization_id = old.organization_id
       and module_code = old.module_code
       and is_enabled;
  end if;
  return null;
end $$;

/*
  İzin satırı güncellenemez: kurumu ya da modülü değiştirilen bir satır
  "kaldır + ekle" demektir ve kaldırmanın kapatma etkisini atlardı.
*/
create or replace function private.ozel_modul_izni_degismez()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  raise exception 'İzin satırı değiştirilemez; silip yeniden ekleyin.' using errcode = '42501';
end $$;

-- ---------- 7. Fail-closed özel statü ----------

/*
  ÖZEL STATÜ DOĞRUDAN KALDIRILAMAZ. Eskiden (bu PR'ın ilk sürümünde)
  ozel_moduller satırını silmek yetiyordu: izin satırları kaskatla
  gidiyor, modül herkese açık bir modüle dönüşüyor ve kurucu onu her
  kurumda açabiliyordu — erişimi GENİŞLETEN bir işlem tek bir DELETE'le,
  gerekçesiz ve izsiz yapılabiliyordu (güvenlik incelemesi, 14.11.2026).

  Silme yalnızca private.ozel_modul_statusunu_kaldir içinden geçer: işlev
  işlem süresince bir işaret koyar, koruma o işareti arar. İşareti başka
  bir rolün kendisi koyması işe yaramaz, çünkü ozel_moduller'de DELETE
  yetkisi yalnızca veritabanı sahibinde. Katalogdan modül silinmesiyle
  gelen kaskat da bu korumaya çarpar.
*/
create or replace function private.ozel_modul_kaydi_koru()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Özel modül kaydı değiştirilemez.' using errcode = '42501';
  end if;
  if coalesce(current_setting('arvo.ozel_modul_kaldirma', true), '') is distinct from old.module_code then
    raise exception 'Özel modül statüsü doğrudan kaldırılamaz; private.ozel_modul_statusunu_kaldir(kod, gerekçe) kullanın.'
      using errcode = '42501';
  end if;
  return old;
end $$;

/*
  Modülü herkese açmanın TEK yolu. Yalnızca veritabanı sahibi (migration)
  çalıştırır; gerekçe zorunlu ve geçmişe yazılır. Var olan
  organization_modules satırlarına dokunulmaz: açık olduğu yerde açık
  kalır, artık her kurumda da açılabilir — kaldırmanın anlamı bu.
*/
create or replace function private.ozel_modul_statusunu_kaldir(p_module text, p_gerekce text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_gerekce is null or char_length(btrim(p_gerekce)) < 20 then
    raise exception 'Özel statüyü kaldırmak için en az 20 karakterlik gerekçe gerekir.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.ozel_moduller where module_code = p_module) then
    raise exception 'Modül özel değil: %', p_module using errcode = '22023';
  end if;
  insert into public.ozel_modul_gecmisi (module_code, islem, gerekce)
  values (p_module, 'ozel_kaldirildi', left(btrim(p_gerekce), 500));
  perform set_config('arvo.ozel_modul_kaldirma', p_module, true);
  delete from public.ozel_moduller where module_code = p_module;
  perform set_config('arvo.ozel_modul_kaldirma', '', true);
end $$;

revoke all on function private.ozel_modul_ilan_edildi() from public, anon, authenticated, service_role;
revoke all on function private.ozel_modul_izni_eklendi() from public, anon, authenticated, service_role;
revoke all on function private.ozel_modul_izni_kaldirildi() from public, anon, authenticated, service_role;
revoke all on function private.ozel_modul_izni_degismez() from public, anon, authenticated, service_role;
revoke all on function private.ozel_modul_kaydi_koru() from public, anon, authenticated, service_role;
revoke all on function private.ozel_modul_statusunu_kaldir(text, text) from public, anon, authenticated, service_role;

drop trigger if exists ozel_modul_ilan_edildi on public.ozel_moduller;
create trigger ozel_modul_ilan_edildi
  after insert on public.ozel_moduller
  for each row execute function private.ozel_modul_ilan_edildi();

drop trigger if exists ozel_modul_kaydi_koru on public.ozel_moduller;
create trigger ozel_modul_kaydi_koru
  before update or delete on public.ozel_moduller
  for each row execute function private.ozel_modul_kaydi_koru();

drop trigger if exists ozel_modul_izni_eklendi on public.ozel_modul_kurumlari;
create trigger ozel_modul_izni_eklendi
  after insert on public.ozel_modul_kurumlari
  for each row execute function private.ozel_modul_izni_eklendi();

drop trigger if exists ozel_modul_izni_kaldirildi on public.ozel_modul_kurumlari;
create trigger ozel_modul_izni_kaldirildi
  after delete on public.ozel_modul_kurumlari
  for each row execute function private.ozel_modul_izni_kaldirildi();

drop trigger if exists ozel_modul_izni_degismez on public.ozel_modul_kurumlari;
create trigger ozel_modul_izni_degismez
  before update on public.ozel_modul_kurumlari
  for each row execute function private.ozel_modul_izni_degismez();
