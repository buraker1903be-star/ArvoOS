/*
  DOÇENTLİK: ŞEMA VE RLS (F6 PR3, 14.11.2026).

  ArvoLab'daki Doçentlik puanlama ArvoOS'a taşınıyor. Bu migration yalnızca
  veri katmanını kurar: tablolar, kısıtlar, puanın veritabanında
  hesaplanması ve RLS. Belgelerin kovası ve kova politikaları ayrı
  migration'da (20261114201157_docentlik_belge_kovasi): test düzeneği depo şemasını yalnızca o
  testte kuruyor, bu dosya ise bütün akış testlerinin önüne uygulanıyor.

  BAĞIMLILIK: 20261114190657 (özel modül izin listesi, PR #317) ve
  lib/docentlik (puan çekirdeği, PR #318). İkisi de bu daldan önce main'e
  girmeli.

  KARARLAR (kurum sahibinin 14.11.2026 tarihli onayı):
   1. Modül kodu `docentlik`; yalnızca AkademikMerkez'e özel. Kurum SLUG
      ile bulunur (`akademikmerkez`, birebir eşleşme). Bulunamazsa izin
      listesi boş kalır: modül HİÇBİR kurumda açılamaz (fail-closed);
      benzer adlı başka bir kurum sessizce izin almaz.
   2. Modül bu migration'la HİÇBİR kurumda açılmaz. organization_modules'a
      satır yazılmıyor; kurucu konsoldan açar.
   3. Her üye kendi faaliyetini ve profilini yönetir. Bütün faaliyetleri
      yalnızca `docentlik.tumunu_gor` yetkisi olan ve Kurum Sahibi görür.
      Kriter ve hedef yönetimi `docentlik.kriter_yonet`, ÜAK tabloları
      `docentlik.uak_yonet`.
   4. Gözetim yetkisi doktora tarihini AÇMAZ (veri en aza indirme). Profil
      tablosu yalnızca sahibine açık. Gözetim ekranının ihtiyacı olan
      "doktora sonrası mı" bilgisi faaliyet başına, tarih gösterilmeden
      docentlik_faaliyet_donemleri'nden gelir.
   5. Puan istemciden ALINMAZ (ArvoLab'daki K1 açığı). computed_points,
      paylasim_katsayisi ve kural_surumu tetikleyicide, ArvoLab kural
      sürümü `arvolab-2026-10-27` ile birebir hesaplanır.

  YETKİ ANAHTARLARI ve VARSAYILAN. Yetkilerin varsayılanı lib/yetkiler.ts'te
  duruyor ve RLS onu okuyamıyor. Bu üç anahtarın varsayılanı BOŞ (yalnızca
  Kurum Sahibi), bu yüzden veritabanının bilmesi gereken tek şey kurumun
  açıkça verdiği izin (role_capability_permissions /
  member_capability_permissions). Böylece varsayılan iki yerde yazılmıyor.
  Anahtarlar panelin Yetkilendirme ekranına bu PR'da EKLENMEDİ: ekran her
  kurumda bütün grupları gösteriyor, modüle göre süzmüyor. Ekran PR'ında
  gelecek.

  MODÜL KAPISI İKİ KAT. Her politika private.modul_kurumda_acik(...,
  'docentlik') ile başlıyor (PR #317 sözleşmesi). Ayrıca her tabloda bir
  RESTRICTIVE politika var: Postgres izin veren politikaları VEYA ile
  birleştirir, yani ileride kapıyı unutan tek bir politika bütün kapıyı
  açardı. Kısıtlayıcı politika diğerleriyle VE ile birleşir; testte
  `using (true)` yazan sahte bir politikayla sınanıyor.
*/

-- ---------- 1. Modül ve özel statü ----------

insert into public.arvo_modules (code, name, description, sort_order, is_active)
values ('docentlik', 'Doçentlik', 'Doçentlik başvurusu için akademik faaliyet puanlaması', 900, true)
on conflict (code) do nothing;

insert into public.ozel_moduller (module_code, aciklama)
values ('docentlik', 'Yalnızca AkademikMerkez (slug: akademikmerkez). F6 PR3.')
on conflict (module_code) do nothing;

do $$
declare
  v_kurum uuid;
begin
  /* Birebir slug. like / regexp yok: "akademikmerkez-test" gibi bir kurum izin almamalı. */
  select o.id into v_kurum from public.organizations o where o.slug = 'akademikmerkez';
  if v_kurum is null then
    raise notice 'docentlik: akademikmerkez slug''ı bulunamadı; izin listesi boş, modül hiçbir kurumda açılamaz.';
  else
    insert into public.ozel_modul_kurumlari (module_code, organization_id)
    values ('docentlik', v_kurum)
    on conflict do nothing;
  end if;
end $$;

-- ---------- 2. Yardımcılar ----------

/*
  Kurumun açıkça verdiği yetki. Kurum Sahibi her zaman yetkilidir
  (lib/yetkiler.ts kuralı 1). Kişi kuralı rol kuralını ezer (kural 3). Hiç
  kural yoksa HAYIR: bu anahtarların varsayılanı boş. Üyelik etkin olmalı;
  iptal edilmiş üye hiçbir şey yapamaz.

  YALNIZCA ÜÇ ANAHTAR. İşlev başka bir anahtarla çağrılırsa (başka modülün
  yeteneği, yazım hatası, büyük harf, boşluk) Kurum Sahibi için bile HAYIR
  döner. Eskiden (PR #319'un ilk commit'i) anahtar süzülmüyordu: bir
  politika yanlışlıkla 'crm.kayit.ata' ile yazılsa, o yeteneği taşıyan
  herkes Doçentlik verisine erişirdi; Kurum Sahibi istisnası da bilinmeyen
  anahtarı "evet"e çeviriyordu (güvenlik incelemesi, 14.11.2026). Yeni bir
  Doçentlik yeteneği eklemek bu listeyi değiştirmeyi gerektirir — bilerek.
*/
create or replace function private.docentlik_yetkisi(p_org uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(p_key in ('docentlik.tumunu_gor', 'docentlik.kriter_yonet', 'docentlik.uak_yonet'), false)
  and exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = p_org
      and m.user_id = (select auth.uid())
      and m.is_active
      and (
        m.role::text = 'owner'
        or coalesce(
          (select mc.allowed from public.member_capability_permissions mc
            where mc.organization_id = p_org and mc.user_id = m.user_id and mc.capability_key = p_key),
          (select rc.allowed from public.role_capability_permissions rc
            where rc.organization_id = p_org and rc.role = m.role::text and rc.capability_key = p_key),
          false
        )
      )
  )
$$;

revoke all on function private.docentlik_yetkisi(uuid, text) from public, anon, authenticated, service_role;
grant execute on function private.docentlik_yetkisi(uuid, text) to authenticated;

/*
  JavaScript'in Math.round'u: en yakın tamsayı, eşitlikte +∞ yönüne.
  Postgres'in round(double) işlevi eşitlikte çifte yuvarlıyor (rint) ve
  floor(x + 0.5) de 0.49999999999999994'te 1 veriyor; ikisi de çekirdekle
  farklı sonuç üretirdi. x − floor(x) |x| < 2^52 için kayan noktada kesin.
*/
create or replace function private.docentlik_js_round(x double precision)
returns double precision
language sql
immutable
set search_path to ''
as $$
  select case
    when x is null or x = 'NaN'::double precision or x in ('Infinity'::double precision, '-Infinity'::double precision) then x
    when x - floor(x) >= 0.5 then floor(x) + 1
    else floor(x)
  end
$$;

/* lib/docentlik/kural-surumu.ts → yuvarla, sürüm arvolab-2026-10-27 (çarpan 1e6). */
create or replace function private.docentlik_yuvarla(x double precision)
returns double precision
language sql
immutable
set search_path to ''
as $$ select private.docentlik_js_round(x * 1e6::double precision) / 1e6::double precision $$;

/* lib/docentlik/puan.ts → paylasimKatsayisi. Yazar sayısı tabloda 1..500 tamsayı. */
create or replace function private.docentlik_paylasim(
  p_baslica_k numeric, p_diger_k numeric, p_esit boolean, p_yazar integer, p_baslica boolean)
returns double precision
language plpgsql
immutable
set search_path to ''
as $$
declare
  k numeric := case when p_baslica then p_baslica_k else p_diger_k end;
begin
  if p_yazar is null or p_yazar <= 1 then return 1; end if;
  if coalesce(p_esit, false) then return 1::double precision / p_yazar::double precision; end if;
  if k is null or k <= 0 or k > 1 then return 1; end if;
  return k::double precision;
end $$;

/*
  Kayan noktayı numeric'e METİN üzerinden çeviriyoruz. Doğrudan
  float8 → numeric dönüşümü 15 anlamlı basamakla yuvarlıyor; metin çıktısı
  ise en kısa geri dönüşlü gösterim (JavaScript'in String(sayı)'sı ile aynı
  değer), yani kayda yazılan sayı çekirdeğin hesapladığıyla aynı.
*/
create or replace function private.docentlik_sayi(x double precision)
returns numeric
language sql
immutable
set search_path to ''
as $$ select (x::text)::numeric $$;

revoke all on function private.docentlik_js_round(double precision) from public, anon, authenticated, service_role;
revoke all on function private.docentlik_yuvarla(double precision) from public, anon, authenticated, service_role;
revoke all on function private.docentlik_paylasim(numeric, numeric, boolean, integer, boolean) from public, anon, authenticated, service_role;
revoke all on function private.docentlik_sayi(double precision) from public, anon, authenticated, service_role;

-- ---------- 3. Tablolar ----------

/*
  Kurum kimliği HER tabloda NOT NULL. ArvoLab'da NULL kurum "genel liste"
  demekti (bireysel aboneler için); ArvoOS'ta bireysel abone yok ve NULL
  kurum, eşleşmeyen bir satırın en kolay sızma yolu.
*/
create table if not exists public.docentlik_kriterleri (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (char_length(btrim(code)) between 1 and 40),
  label text not null check (char_length(btrim(label)) between 1 and 300),
  category_group text check (category_group is null or char_length(category_group) <= 120),
  points_per_unit numeric not null default 0 check (points_per_unit >= 0 and points_per_unit <= 100000),
  notes text check (notes is null or char_length(notes) <= 2000),
  is_active boolean not null default true,
  baslica_yazar_katsayisi numeric check (baslica_yazar_katsayisi is null or (baslica_yazar_katsayisi > 0 and baslica_yazar_katsayisi <= 1)),
  diger_yazar_katsayisi numeric check (diger_yazar_katsayisi is null or (diger_yazar_katsayisi > 0 and diger_yazar_katsayisi <= 1)),
  esit_bolusum boolean not null default false,
  temel_alan text check (temel_alan is null or char_length(btrim(temel_alan)) between 1 and 120),
  alt_alan text check (alt_alan is null or char_length(btrim(alt_alan)) between 1 and 160),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  /* Faaliyetin kriteri AYNI kurumdan olmalı: bileşik yabancı anahtarın hedefi. */
  unique (id, organization_id)
);

/* ArvoLab'daki kural: kod kurum + temel alan içinde benzersiz. */
create unique index if not exists docentlik_kriterleri_kod_key
  on public.docentlik_kriterleri (organization_id, temel_alan, code) nulls not distinct;

create table if not exists public.docentlik_hedefleri (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  temel_alan text check (temel_alan is null or char_length(btrim(temel_alan)) between 1 and 120),
  alt_alan text check (alt_alan is null or char_length(btrim(alt_alan)) between 1 and 160),
  grup text check (grup is null or char_length(btrim(grup)) between 1 and 120),
  asgari_puan numeric check (asgari_puan is null or (asgari_puan > 0 and asgari_puan <= 100000)),
  azami_puan numeric check (azami_puan is null or (azami_puan > 0 and azami_puan <= 100000)),
  doktora_sonrasi boolean not null default false,
  notlar text check (notlar is null or char_length(notlar) <= 1000),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint docentlik_hedefleri_sinir_var check (asgari_puan is not null or azami_puan is not null),
  /* Tavan dönemden bağımsız (lib/docentlik/ozet.ts → tavanUygula): doktora sonrası satırına yazılmaz. */
  constraint docentlik_hedefleri_doktora_tavansiz check (not doktora_sonrasi or azami_puan is null)
);

create unique index if not exists docentlik_hedefleri_kapsam_key
  on public.docentlik_hedefleri (organization_id, temel_alan, alt_alan, grup, doktora_sonrasi) nulls not distinct;

create table if not exists public.docentlik_profilleri (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doktora_tarihi date,
  temel_alan text check (temel_alan is null or char_length(btrim(temel_alan)) between 1 and 120),
  alt_alan text check (alt_alan is null or char_length(btrim(alt_alan)) between 1 and 160),
  updated_at timestamptz not null default now(),
  primary key (organization_id, owner_id)
);

create table if not exists public.docentlik_faaliyetleri (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criteria_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 500),
  unit_count numeric not null default 1 check (unit_count > 0 and unit_count <= 100000),
  yazar_sayisi integer not null default 1 check (yazar_sayisi between 1 and 500),
  baslica_yazar boolean not null default true,
  faaliyet_tarihi date,
  notes text check (notes is null or char_length(notes) <= 2000),
  /* Aşağıdaki üçünü yalnızca tetikleyici yazar (docentlik_faaliyet_puani). */
  computed_points numeric not null default 0,
  paylasim_katsayisi numeric not null default 1 check (paylasim_katsayisi > 0 and paylasim_katsayisi <= 1),
  kural_surumu text not null default 'arvolab-2026-10-27',
  /* Belge yolu kurum + sahip + faaliyet kimliğine bağlı (K3). */
  belge_yolu text check (
    belge_yolu is null
    or (belge_yolu like organization_id::text || '/faaliyet/' || owner_id::text || '/' || id::text || '/%'
        and belge_yolu not like '%..%' and char_length(belge_yolu) <= 500)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  /* Silinmeye çalışılan kriterin faaliyeti varsa silme düşer (NO ACTION); veri korunur. */
  foreign key (criteria_id, organization_id) references public.docentlik_kriterleri (id, organization_id)
);

create index if not exists docentlik_faaliyetleri_sahip on public.docentlik_faaliyetleri (organization_id, owner_id, created_at desc);
create index if not exists docentlik_faaliyetleri_kriter on public.docentlik_faaliyetleri (criteria_id, organization_id);

create table if not exists public.docentlik_uak_tablolari (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  temel_alan text not null check (char_length(btrim(temel_alan)) between 1 and 120),
  donem text not null check (char_length(btrim(donem)) between 1 and 40),
  depo_yolu text not null check (
    depo_yolu like organization_id::text || '/uak/%' and depo_yolu not like '%..%' and char_length(depo_yolu) <= 500
  ),
  dosya_adi text check (dosya_adi is null or char_length(dosya_adi) <= 300),
  durum text not null default 'yuklendi' check (durum in ('yuklendi', 'oneri_hazir', 'onaylandi')),
  oneri jsonb,
  yukleyen uuid default auth.uid() references auth.users(id) on delete set null,
  yuklendi_at timestamptz not null default now(),
  onaylayan uuid references auth.users(id) on delete set null,
  onaylandi_at timestamptz,
  unique (organization_id, temel_alan)
);

-- ---------- 4. Tetikleyiciler ----------

/*
  KURUM VE SAHİP DEĞİŞMEZ (K2). RLS yalnızca "kim yazabilir"i söyler; UPDATE
  hakkı olan sahip satırın organization_id'sini başka bir kuruma, owner_id'sini
  başka birine çevirebilirdi. Kriter, hedef ve ÜAK satırları da kurum
  değiştiremez: başka kurumun listesine sızmanın en kısa yolu.
*/
create or replace function private.docentlik_kimlik_koru()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Doçentlik kaydının kurumu değiştirilemez.' using errcode = '42501';
  end if;
  if tg_table_name in ('docentlik_faaliyetleri', 'docentlik_profilleri')
     and (to_jsonb(new) ->> 'owner_id') is distinct from (to_jsonb(old) ->> 'owner_id') then
    raise exception 'Doçentlik kaydının sahibi değiştirilemez.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function private.docentlik_kimlik_koru() from public, anon, authenticated, service_role;

drop trigger if exists docentlik_kriterleri_kimlik on public.docentlik_kriterleri;
create trigger docentlik_kriterleri_kimlik before update on public.docentlik_kriterleri
  for each row execute function private.docentlik_kimlik_koru();
drop trigger if exists docentlik_hedefleri_kimlik on public.docentlik_hedefleri;
create trigger docentlik_hedefleri_kimlik before update on public.docentlik_hedefleri
  for each row execute function private.docentlik_kimlik_koru();
drop trigger if exists docentlik_profilleri_kimlik on public.docentlik_profilleri;
create trigger docentlik_profilleri_kimlik before update on public.docentlik_profilleri
  for each row execute function private.docentlik_kimlik_koru();
drop trigger if exists docentlik_faaliyetleri_kimlik on public.docentlik_faaliyetleri;
create trigger docentlik_faaliyetleri_kimlik before update on public.docentlik_faaliyetleri
  for each row execute function private.docentlik_kimlik_koru();
drop trigger if exists docentlik_uak_kimlik on public.docentlik_uak_tablolari;
create trigger docentlik_uak_kimlik before update on public.docentlik_uak_tablolari
  for each row execute function private.docentlik_kimlik_koru();

/*
  PUAN VERİTABANINDA HESAPLANIR (K1). ArvoLab'da computed_points istemciden
  geliyordu ve INSERT/UPDATE politikası yalnızca owner_id'ye bakıyordu:
  oturum jetonu olan kullanıcı API'den istediği puanı yazabiliyordu
  (ArvoLab 20260924100023 bunu yorumunda kabul ediyor).

  Hesap lib/docentlik/puan.ts ile BİREBİR (kural sürümü arvolab-2026-10-27):
   - Ekleme: faaliyetPuani → birim × kriter puanı × paylaşım katsayısı.
   - Düzenleme: duzenlemePuani → kriter aynıysa birim puan kaydın kendisinden
     geri türetilir (korunanBirimPuan); yazar bilgisi de aynıysa katsayı
     korunur. Kriter sonradan değişse de eski kayıt yeniden fiyatlanmaz.
  Eşdeğerlik tests/db/docentlik-puan-tetikleyicisi.test.mjs'te çekirdeğin
  kendisine karşı sınanıyor. Hesap kayan noktada (double) yapılıyor, çünkü
  çekirdek JavaScript sayısıyla çalışıyor; numeric'te yapmak eşitlikte
  farklı yuvarlardı.

  Tek fark, bilerek: hesabın girdileri (birim, kriter, yazar sayısı,
  başlıca yazar) değişmediyse UPDATE puana DOKUNMAZ. ArvoLab'da başlığı
  düzelten kullanıcının puanı korunanBirimPuan üzerinden yeniden
  hesaplanıyordu; bu bazen son basamakta 1e-6 kayma üretebiliyordu.
  Belge eklemek ya da başlık düzeltmek puanı değiştirmemeli.

  İstemcinin gönderdiği computed_points / paylasim_katsayisi / kural_surumu
  her durumda yok sayılır.
*/
create or replace function private.docentlik_faaliyet_puani()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  k public.docentlik_kriterleri%rowtype;
  v_birim_puan double precision;
  v_katsayi double precision;
  v_eski_birim double precision;
  v_eski_puan double precision;
  v_eski_katsayi double precision;
  v_girdi_ayni boolean;
begin
  -- Tek yazarlı faaliyette yazar her zaman başlıcadır (ArvoLab formu: yazarSayisi === 1 || …).
  if new.yazar_sayisi = 1 then
    new.baslica_yazar := true;
  end if;
  new.kural_surumu := 'arvolab-2026-10-27';
  new.updated_at := now();

  if tg_op = 'UPDATE' then
    v_girdi_ayni := new.unit_count = old.unit_count
      and new.criteria_id = old.criteria_id
      and new.yazar_sayisi = old.yazar_sayisi
      and new.baslica_yazar = old.baslica_yazar;
    if v_girdi_ayni then
      new.computed_points := old.computed_points;
      new.paylasim_katsayisi := old.paylasim_katsayisi;
      new.kural_surumu := old.kural_surumu;
      return new;
    end if;

    -- korunanBirimPuan: kriter aynıysa birim puan kayıttan geri türetilir.
    if new.criteria_id = old.criteria_id then
      v_eski_birim := old.unit_count::double precision;
      v_eski_puan := old.computed_points::double precision;
      v_eski_katsayi := coalesce(old.paylasim_katsayisi, 1)::double precision;
      if v_eski_birim > 0 and v_eski_katsayi > 0 then
        v_birim_puan := private.docentlik_yuvarla(v_eski_puan / (v_eski_birim * v_eski_katsayi));
      end if;
    end if;
    -- duzenlemePuani: yazar bilgisi de aynıysa katsayı korunur.
    if v_birim_puan is not null
       and new.yazar_sayisi = old.yazar_sayisi and new.baslica_yazar = old.baslica_yazar then
      v_katsayi := old.paylasim_katsayisi::double precision;
    end if;
  end if;

  if v_birim_puan is null or v_katsayi is null then
    select * into k from public.docentlik_kriterleri c
     where c.id = new.criteria_id and c.organization_id = new.organization_id;
    /* Yeni kriter etkin olmalı (ArvoLab: .eq("is_active", true)). Düzenlemede
       kriter değişmediyse pasife alınmış kriterin kaydı düzenlenebilir kalır. */
    if not found or (not k.is_active and (tg_op = 'INSERT' or new.criteria_id <> old.criteria_id)) then
      raise exception 'Seçilen kriter bulunamadı.' using errcode = '23503';
    end if;
    if v_birim_puan is null then
      v_birim_puan := k.points_per_unit::double precision;
    end if;
    v_katsayi := private.docentlik_paylasim(
      k.baslica_yazar_katsayisi, k.diger_yazar_katsayisi, k.esit_bolusum, new.yazar_sayisi, new.baslica_yazar);
  end if;

  new.paylasim_katsayisi := private.docentlik_sayi(v_katsayi);
  new.computed_points := private.docentlik_sayi(
    private.docentlik_yuvarla(new.unit_count::double precision * v_birim_puan * v_katsayi));
  return new;
end $$;

revoke all on function private.docentlik_faaliyet_puani() from public, anon, authenticated, service_role;

drop trigger if exists docentlik_faaliyet_puani on public.docentlik_faaliyetleri;
create trigger docentlik_faaliyet_puani
  before insert or update on public.docentlik_faaliyetleri
  for each row execute function private.docentlik_faaliyet_puani();

/*
  ÜAK önerisi ve onayı yalnızca sunucudan (K5). ArvoLab'da yönetici UPDATE
  hakkıyla `oneri` ve `durum`u doğrudan yazabiliyordu: asistan
  doğrulamasından (önerideki her sayı PDF'te geçmeli) geçmemiş bir öneri
  "onaylandı" görünebilirdi. Oturum jetonuyla gelen istek (authenticated)
  bu sütunlara dokunamaz; öneriyi doğrulayan sunucu yolu service_role ile
  yazar ve yetkiyi kendisi denetler.
*/
create or replace function private.docentlik_uak_koru()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.durum <> 'yuklendi' or new.oneri is not null or new.onaylayan is not null or new.onaylandi_at is not null then
      raise exception 'ÜAK önerisi ve onayı yalnızca sunucu tarafından yazılır.' using errcode = '42501';
    end if;
    new.yukleyen := (select auth.uid());
    return new;
  end if;
  if new.durum is distinct from old.durum or new.oneri is distinct from old.oneri
     or new.onaylayan is distinct from old.onaylayan or new.onaylandi_at is distinct from old.onaylandi_at
     or new.yukleyen is distinct from old.yukleyen then
    raise exception 'ÜAK önerisi ve onayı yalnızca sunucu tarafından yazılır.' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function private.docentlik_uak_koru() from public, anon, authenticated, service_role;

drop trigger if exists docentlik_uak_koru on public.docentlik_uak_tablolari;
create trigger docentlik_uak_koru before insert or update on public.docentlik_uak_tablolari
  for each row execute function private.docentlik_uak_koru();

-- ---------- 5. Yetkiler (GRANT) ----------

revoke all on public.docentlik_kriterleri, public.docentlik_hedefleri, public.docentlik_profilleri,
  public.docentlik_faaliyetleri, public.docentlik_uak_tablolari from public, anon, authenticated;

grant select, insert, update, delete on public.docentlik_kriterleri to authenticated;
grant select, insert, update, delete on public.docentlik_hedefleri to authenticated;
grant select, insert, update, delete on public.docentlik_profilleri to authenticated;
grant select, insert, update, delete on public.docentlik_uak_tablolari to authenticated;
/*
  Faaliyette hesaplanan sütunlar istemcinin YAZMA listesinde yok: tetikleyici
  zaten eziyor, ama sütun düzeyinde yetki niyeti şemada da gösteriyor ve
  tetikleyici bir gün düşerse ikinci kat olarak kalıyor.
*/
grant select, delete on public.docentlik_faaliyetleri to authenticated;
grant insert (organization_id, owner_id, criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi, notes)
  on public.docentlik_faaliyetleri to authenticated;
grant update (criteria_id, title, unit_count, yazar_sayisi, baslica_yazar, faaliyet_tarihi, notes, belge_yolu)
  on public.docentlik_faaliyetleri to authenticated;

-- ---------- 6. RLS ----------

alter table public.docentlik_kriterleri enable row level security;
alter table public.docentlik_hedefleri enable row level security;
alter table public.docentlik_profilleri enable row level security;
alter table public.docentlik_faaliyetleri enable row level security;
alter table public.docentlik_uak_tablolari enable row level security;

-- Kısıtlayıcı modül kapısı: izin veren politikalarla VE ile birleşir.
drop policy if exists docentlik_kriterleri_modul_kapisi on public.docentlik_kriterleri;
create policy docentlik_kriterleri_modul_kapisi on public.docentlik_kriterleri as restrictive for all to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik'));
drop policy if exists docentlik_hedefleri_modul_kapisi on public.docentlik_hedefleri;
create policy docentlik_hedefleri_modul_kapisi on public.docentlik_hedefleri as restrictive for all to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik'));
drop policy if exists docentlik_profilleri_modul_kapisi on public.docentlik_profilleri;
create policy docentlik_profilleri_modul_kapisi on public.docentlik_profilleri as restrictive for all to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik'));
drop policy if exists docentlik_faaliyetleri_modul_kapisi on public.docentlik_faaliyetleri;
create policy docentlik_faaliyetleri_modul_kapisi on public.docentlik_faaliyetleri as restrictive for all to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik'));
drop policy if exists docentlik_uak_modul_kapisi on public.docentlik_uak_tablolari;
create policy docentlik_uak_modul_kapisi on public.docentlik_uak_tablolari as restrictive for all to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik'));

/* Kriterler: kurumun her üyesi okur (kendi faaliyetini girmek için); yalnızca kriter_yonet yazar. */
drop policy if exists docentlik_kriterleri_okur on public.docentlik_kriterleri;
create policy docentlik_kriterleri_okur on public.docentlik_kriterleri for select to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik'));
drop policy if exists docentlik_kriterleri_ekler on public.docentlik_kriterleri;
create policy docentlik_kriterleri_ekler on public.docentlik_kriterleri for insert to authenticated
  with check (private.modul_kurumda_acik(organization_id, 'docentlik')
              and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'));
drop policy if exists docentlik_kriterleri_duzenler on public.docentlik_kriterleri;
create policy docentlik_kriterleri_duzenler on public.docentlik_kriterleri for update to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik')
              and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'));
drop policy if exists docentlik_kriterleri_siler on public.docentlik_kriterleri;
create policy docentlik_kriterleri_siler on public.docentlik_kriterleri for delete to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'));

/* Hedefler kriterlerle aynı kişilerce yönetilir (ArvoLab'da da öyle). */
drop policy if exists docentlik_hedefleri_okur on public.docentlik_hedefleri;
create policy docentlik_hedefleri_okur on public.docentlik_hedefleri for select to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik'));
drop policy if exists docentlik_hedefleri_ekler on public.docentlik_hedefleri;
create policy docentlik_hedefleri_ekler on public.docentlik_hedefleri for insert to authenticated
  with check (private.modul_kurumda_acik(organization_id, 'docentlik')
              and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'));
drop policy if exists docentlik_hedefleri_duzenler on public.docentlik_hedefleri;
create policy docentlik_hedefleri_duzenler on public.docentlik_hedefleri for update to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik')
              and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'));
drop policy if exists docentlik_hedefleri_siler on public.docentlik_hedefleri;
create policy docentlik_hedefleri_siler on public.docentlik_hedefleri for delete to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and private.docentlik_yetkisi(organization_id, 'docentlik.kriter_yonet'));

/* Profil: YALNIZCA sahibi. tumunu_gor da açmaz (karar 4). */
drop policy if exists docentlik_profilleri_okur on public.docentlik_profilleri;
create policy docentlik_profilleri_okur on public.docentlik_profilleri for select to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()));
drop policy if exists docentlik_profilleri_ekler on public.docentlik_profilleri;
create policy docentlik_profilleri_ekler on public.docentlik_profilleri for insert to authenticated
  with check (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()));
drop policy if exists docentlik_profilleri_duzenler on public.docentlik_profilleri;
create policy docentlik_profilleri_duzenler on public.docentlik_profilleri for update to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()));
drop policy if exists docentlik_profilleri_siler on public.docentlik_profilleri;
create policy docentlik_profilleri_siler on public.docentlik_profilleri for delete to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()));

/* Faaliyet: sahibi yönetir; tumunu_gor (ve Kurum Sahibi) yalnızca OKUR. */
drop policy if exists docentlik_faaliyetleri_okur on public.docentlik_faaliyetleri;
create policy docentlik_faaliyetleri_okur on public.docentlik_faaliyetleri for select to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and (owner_id = (select auth.uid())
              or private.docentlik_yetkisi(organization_id, 'docentlik.tumunu_gor')));
drop policy if exists docentlik_faaliyetleri_ekler on public.docentlik_faaliyetleri;
create policy docentlik_faaliyetleri_ekler on public.docentlik_faaliyetleri for insert to authenticated
  with check (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()));
drop policy if exists docentlik_faaliyetleri_duzenler on public.docentlik_faaliyetleri;
create policy docentlik_faaliyetleri_duzenler on public.docentlik_faaliyetleri for update to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()));
drop policy if exists docentlik_faaliyetleri_siler on public.docentlik_faaliyetleri;
create policy docentlik_faaliyetleri_siler on public.docentlik_faaliyetleri for delete to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik') and owner_id = (select auth.uid()));

/* ÜAK tabloları: yalnızca uak_yonet. Faaliyet belgelerinden ayrı izin. */
drop policy if exists docentlik_uak_okur on public.docentlik_uak_tablolari;
create policy docentlik_uak_okur on public.docentlik_uak_tablolari for select to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and private.docentlik_yetkisi(organization_id, 'docentlik.uak_yonet'));
drop policy if exists docentlik_uak_ekler on public.docentlik_uak_tablolari;
create policy docentlik_uak_ekler on public.docentlik_uak_tablolari for insert to authenticated
  with check (private.modul_kurumda_acik(organization_id, 'docentlik')
              and private.docentlik_yetkisi(organization_id, 'docentlik.uak_yonet'));
drop policy if exists docentlik_uak_duzenler on public.docentlik_uak_tablolari;
create policy docentlik_uak_duzenler on public.docentlik_uak_tablolari for update to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and private.docentlik_yetkisi(organization_id, 'docentlik.uak_yonet'))
  with check (private.modul_kurumda_acik(organization_id, 'docentlik')
              and private.docentlik_yetkisi(organization_id, 'docentlik.uak_yonet'));
drop policy if exists docentlik_uak_siler on public.docentlik_uak_tablolari;
create policy docentlik_uak_siler on public.docentlik_uak_tablolari for delete to authenticated
  using (private.modul_kurumda_acik(organization_id, 'docentlik')
         and private.docentlik_yetkisi(organization_id, 'docentlik.uak_yonet'));

-- ---------- 7. Gözetim için en az veri ----------

/*
  Gözetim ekranı kişinin temel/alt alanını ve doktora tarihinin GİRİLİP
  GİRİLMEDİĞİNİ bilmeli (alan seçilmemişse yalnızca genel hedefler sayılır;
  tarih yoksa doktora sonrası şartı ölçülemez). Tarihin kendisi dönmez.
  Profil tablosu RLS'te yalnızca sahibine açık; bu işlev o kuralı bilerek
  dar bir pencereyle aşıyor, bu yüzden aynı kapıları kendisi sınıyor.
*/
create or replace function public.docentlik_profil_ozetleri(p_org uuid)
returns table (owner_id uuid, temel_alan text, alt_alan text, doktora_tarihi_girildi boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select p.owner_id, p.temel_alan, p.alt_alan, p.doktora_tarihi is not null
  from public.docentlik_profilleri p
  where p.organization_id = p_org
    and private.modul_kurumda_acik(p_org, 'docentlik')
    and private.docentlik_yetkisi(p_org, 'docentlik.tumunu_gor')
$$;

/*
  Faaliyet başına dönem — lib/docentlik/ozet.ts → faaliyetDonemi ile aynı
  kural: aynı gün "sonra" sayılmaz, tarihlerden biri yoksa "bilinmiyor".
  Gözetimci doktora sonrası toplamını tarihi görmeden hesaplayabilsin.
*/
create or replace function public.docentlik_faaliyet_donemleri(p_org uuid)
returns table (faaliyet_id uuid, owner_id uuid, donem text)
language sql
stable
security definer
set search_path to ''
as $$
  select f.id, f.owner_id,
         case
           when f.faaliyet_tarihi is null or p.doktora_tarihi is null then 'bilinmiyor'
           when f.faaliyet_tarihi > p.doktora_tarihi then 'sonra'
           else 'once'
         end
  from public.docentlik_faaliyetleri f
  left join public.docentlik_profilleri p
    on p.organization_id = f.organization_id and p.owner_id = f.owner_id
  where f.organization_id = p_org
    and private.modul_kurumda_acik(p_org, 'docentlik')
    and (f.owner_id = (select auth.uid()) or private.docentlik_yetkisi(p_org, 'docentlik.tumunu_gor'))
$$;

revoke all on function public.docentlik_profil_ozetleri(uuid) from public, anon, authenticated, service_role;
revoke all on function public.docentlik_faaliyet_donemleri(uuid) from public, anon, authenticated, service_role;
grant execute on function public.docentlik_profil_ozetleri(uuid) to authenticated;
grant execute on function public.docentlik_faaliyet_donemleri(uuid) to authenticated;

notify pgrst, 'reload schema';
