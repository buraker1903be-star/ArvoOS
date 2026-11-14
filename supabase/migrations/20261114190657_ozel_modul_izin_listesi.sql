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
   - Eşitleme: kurum izin listesinden çıkarılınca ya da açık olan bir
     modül sonradan "özel" ilan edilince, izinsiz kurumlardaki satır
     kapatılır. İzin listesi tek doğruluk kaynağıdır; bir satırın "eskiden
     açılmıştı" diye açık kalması mümkün değildir.
   - private.modul_kurumda_acik(org, modül): özel modüllerin RLS'inde
     kullanılacak tek erişim yardımcısı (izin listesi + kurumda açık +
     kişinin rolünde gizli değil).

  Bu migration HİÇBİR modülü özel ilan etmiyor: var olan modüllerin
  davranışı değişmez. Doçentlik bir sonraki migration'da eklenecek.

  Koruma kimliğe bakmıyor (current_user'a değil, izin listesine): kurucu,
  service_role ve migration için aynı kural geçerli. "Hiçbir yoldan" ancak
  böyle sağlanır; tek istisna tetikleyicileri kapatabilen süper kullanıcı.
*/

-- ---------- 1. Özel modül kaydı ----------

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

/*
  Okuma yalnızca kurucuya (Platform ekranında hangi kurumun izinli olduğunu
  görebilsin). Yazma politikası YOK ve yetkisi verilmiyor: izin listesi
  ürün kararıdır, migration ya da service_role ile değişir. Kurucunun
  panelden kendine izin yazabildiği bir liste, kurucunun modül anahtarından
  farksız olurdu.
*/
drop policy if exists ozel_moduller_kurucu_okur on public.ozel_moduller;
create policy ozel_moduller_kurucu_okur on public.ozel_moduller
  for select to authenticated
  using (private.is_arvoos_founder());

drop policy if exists ozel_modul_kurumlari_kurucu_okur on public.ozel_modul_kurumlari;
create policy ozel_modul_kurumlari_kurucu_okur on public.ozel_modul_kurumlari
  for select to authenticated
  using (private.is_arvoos_founder());

revoke all on public.ozel_moduller from public, anon, authenticated;
revoke all on public.ozel_modul_kurumlari from public, anon, authenticated;
grant select on public.ozel_moduller to authenticated;
grant select on public.ozel_modul_kurumlari to authenticated;
grant select, insert, update, delete on public.ozel_moduller to service_role;
grant select, insert, delete on public.ozel_modul_kurumlari to service_role;

-- ---------- 3. Yardımcılar ----------

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
  Özel modüllerin RLS'i bunu kullanır. Üç koşul birlikte: izin listesi,
  kurumda açık, kişinin rolünde/kendisinde gizli değil
  (private.arvo_modul_acik yalnızca sonuncusuna bakıyor; analitik
  modülünde de bu yüzden ikisi birlikte yazıldı).
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

revoke all on function private.ozel_modul_izinli(uuid, text) from public, anon;
revoke all on function private.modul_kurumda_acik(uuid, text) from public, anon;
grant execute on function private.ozel_modul_izinli(uuid, text) to authenticated, service_role;
grant execute on function private.modul_kurumda_acik(uuid, text) to authenticated, service_role;

-- ---------- 4. organization_modules koruması ----------

/*
  security definer: tetikleyici kurucunun (authenticated) UPDATE'inde de
  çalışıyor ve izin listesini okuyabilmeli; kurucunun izin listesine
  doğrudan erişimi yalnızca okuma ve yalnızca RLS ile.
*/
create or replace function private.ozel_modul_koru()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
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

revoke all on function private.ozel_modul_koru() from public, anon, authenticated;

drop trigger if exists ozel_modul_koru on public.organization_modules;
create trigger ozel_modul_koru
  before insert or update on public.organization_modules
  for each row execute function private.ozel_modul_koru();

-- ---------- 5. Eşitleme: izin listesi tek doğruluk kaynağı ----------

/* Bir modül özel ilan edilince, izin listesinde olmayan kurumlarda açık satırlar kapanır. */
create or replace function private.ozel_modul_ilan_edildi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.organization_modules om
     set is_enabled = false
   where om.module_code = new.module_code
     and om.is_enabled
     and not exists (select 1 from public.ozel_modul_kurumlari k
                     where k.module_code = new.module_code and k.organization_id = om.organization_id);
  return null;
end $$;

/*
  Kurum izin listesinden çıkarılınca modül o kurumda kapanır. Modül
  özel olmaktan çıkarılıyorsa (ozel_moduller satırı silinip izin satırları
  kaskatla gidiyorsa) dokunulmaz: modül artık herkese açık bir modüldür ve
  açık olduğu yerde açık kalmalı. Kaskatta üst satır bu tetikleyici
  çalıştığında zaten silinmiş olduğundan "hâlâ özel mi" sorusu doğru
  cevabı verir.
*/
create or replace function private.ozel_modul_izni_kaldirildi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
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

revoke all on function private.ozel_modul_ilan_edildi() from public, anon, authenticated;
revoke all on function private.ozel_modul_izni_kaldirildi() from public, anon, authenticated;
revoke all on function private.ozel_modul_izni_degismez() from public, anon, authenticated;

drop trigger if exists ozel_modul_ilan_edildi on public.ozel_moduller;
create trigger ozel_modul_ilan_edildi
  after insert on public.ozel_moduller
  for each row execute function private.ozel_modul_ilan_edildi();

drop trigger if exists ozel_modul_izni_kaldirildi on public.ozel_modul_kurumlari;
create trigger ozel_modul_izni_kaldirildi
  after delete on public.ozel_modul_kurumlari
  for each row execute function private.ozel_modul_izni_kaldirildi();

drop trigger if exists ozel_modul_izni_degismez on public.ozel_modul_kurumlari;
create trigger ozel_modul_izni_degismez
  before update on public.ozel_modul_kurumlari
  for each row execute function private.ozel_modul_izni_degismez();
