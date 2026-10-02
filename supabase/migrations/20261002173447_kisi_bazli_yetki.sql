-- ============================================================
-- YETENEK VE KİŞİ BAZLI YETKİLENDİRME
--
-- Bugüne kadar bir kurumun personelini sınırlamak için elinde tek araç
-- vardı: role_module_permissions (6 modül × 4 rol, aç/kapa). "Silebilir
-- mi", "atama yapabilir mi", "maliyeti yönetebilir mi" gibi kararların
-- tamamı kodda sabitti; çok kiracılı bir sistemde bu, her kurumu aynı iş
-- bölümüne zorluyordu. Kişi düzeyinde hiçbir ayar yoktu: aynı roldeki iki
-- kişi zorunlu olarak aynı yetkiye sahipti.
--
-- Üç tablo ekleniyor:
--   role_capability_permissions    rol düzeyinde yetenek kuralı
--   member_capability_permissions  tek kişi için yetenek istisnası
--   member_module_permissions      tek kişi için modül istisnası
--
-- Hepsi İSTİSNA tablosu: satır yoksa karar koddaki varsayılandan gelir
-- (lib/yetkiler.ts). Bu migration hiçbir satır yazmıyor, dolayısıyla
-- uygulandığı anda hiçbir kurumun davranışı değişmiyor.
--
-- Kişi satırı rol satırını ezer. Bu bilinçli: rolde kapalı bir modülü tek
-- bir kişiye açmak (operasyon personeli Gizem'in CRM'i görmesi gibi) en
-- sık istenen şey ve rol düzeyinde ifade edilemiyor.
--
-- Kurum Sahibi kısıtlanamaz: 'owner' için satır yazılması check kısıtıyla
-- engellendi. Kod da ayrıca owner'ı atlıyor; kısıt, kodun atlanabildiği
-- yolları (doğrudan API çağrısı) kapatıyor.
-- ============================================================

create table if not exists public.role_capability_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null,
  capability_key text not null,
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (organization_id, role, capability_key),
  -- Kurum Sahibi hiçbir zaman kısıtlanamaz.
  constraint role_capability_permissions_owner_serbest check (role <> 'owner')
);

create table if not exists public.member_capability_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_key text not null,
  allowed boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (organization_id, user_id, capability_key)
);

create table if not exists public.member_module_permissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  module_key text not null,
  can_access boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (organization_id, user_id, module_key)
);

/*
  TABLO YETKİLERİ AÇIKÇA YAZILIYOR.

  Supabase public şemasındaki yeni tablolara varsayılan ayrıcalıklarla
  erişim veriyor, ama buna güvenmek yetkinin nereden geldiğini görünmez
  kılıyor ve şemayı kuran her ortamda (akış testleri PGlite'ta kuruyor)
  aynı sonucu vermiyor: grant olmayınca RLS'e hiç gelinmeden 42501 ile
  düşülüyor. Kapıyı RLS tutuyor, grant sadece masaya oturtuyor.
*/
grant select on public.role_capability_permissions to authenticated;
grant select, insert, update, delete on public.role_capability_permissions to service_role;
grant select on public.member_capability_permissions to authenticated;
grant select, insert, update, delete on public.member_capability_permissions to service_role;
grant select on public.member_module_permissions to authenticated;
grant select, insert, update, delete on public.member_module_permissions to service_role;

/*
  Yazma hakkı da authenticated'a verilir; "kim yazabilir" kararını RLS
  politikaları (aşağıda) veriyor. Grant olmadan Kurum Sahibi bile
  panelden yetki kaydedemez.
*/
grant insert, update, delete on public.role_capability_permissions to authenticated;
grant insert, update, delete on public.member_capability_permissions to authenticated;
grant insert, update, delete on public.member_module_permissions to authenticated;

alter table public.role_capability_permissions enable row level security;
alter table public.member_capability_permissions enable row level security;
alter table public.member_module_permissions enable row level security;

-- ---------- Okuma ----------
-- Rol kuralları kurumun iş bölümü tanımı, veri değil: kurumun her aktif
-- üyesi okuyabilir. Panel her istekte kendi rolünün satırlarını okumak
-- zorunda; daraltmak panelin kendi yetkisini okumasını engellerdi.
drop policy if exists "org members read role capabilities" on public.role_capability_permissions;
create policy "org members read role capabilities" on public.role_capability_permissions
  as permissive for select to authenticated
  using (exists (
    select 1 from public.organization_memberships m
    where m.organization_id = role_capability_permissions.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
  ));

-- Kişi istisnaları: kendi satırını herkes okur (panel bunu okumak
-- zorunda), başkasının satırını yalnızca Kurum Sahibi ve Yönetici.
drop policy if exists "members read own capability overrides" on public.member_capability_permissions;
create policy "members read own capability overrides" on public.member_capability_permissions
  as permissive for select to authenticated
  using (
    (user_id = (select auth.uid()) and exists (
      select 1 from public.organization_memberships m
      where m.organization_id = member_capability_permissions.organization_id
        and m.user_id = (select auth.uid())
        and m.is_active = true
    ))
    or private.arvo_is_org_admin(organization_id)
  );

drop policy if exists "members read own module overrides" on public.member_module_permissions;
create policy "members read own module overrides" on public.member_module_permissions
  as permissive for select to authenticated
  using (
    (user_id = (select auth.uid()) and exists (
      select 1 from public.organization_memberships m
      where m.organization_id = member_module_permissions.organization_id
        and m.user_id = (select auth.uid())
        and m.is_active = true
    ))
    or private.arvo_is_org_admin(organization_id)
  );

-- ---------- Yazma ----------
-- Yalnızca Kurum Sahibi ve Yönetici. Yönetici'nin kendi "Yetkilendirme"
-- yetkisini kapatması uygulama tarafında ayrıca engelleniyor
-- (lib/yetkiler.ts · yetkiDegisikligiEngeli): kapatırsa sayfaya bir daha
-- giremez ve geri açacak tek kişi Kurum Sahibi kalır.
drop policy if exists "admins manage role capabilities" on public.role_capability_permissions;
create policy "admins manage role capabilities" on public.role_capability_permissions
  as permissive for all to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

drop policy if exists "admins manage capability overrides" on public.member_capability_permissions;
create policy "admins manage capability overrides" on public.member_capability_permissions
  as permissive for all to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

drop policy if exists "admins manage module overrides" on public.member_module_permissions;
create policy "admins manage module overrides" on public.member_module_permissions
  as permissive for all to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

/*
  İstisna yalnızca kurumun KENDİ üyesine yazılabilir.

  RLS yazarın yetkisini denetliyor ama hedefi denetlemiyordu: bir kurumun
  yöneticisi, organization_id kendi kurumu olduğu sürece başka kurumun
  kullanıcı kimliğini user_id olarak yazabilirdi. Satır o kurumda hiçbir
  şey yapmaz (panel kendi kurumunu okur) ama kimin hangi kuruma bağlı
  olduğunu sızdıran bir kayıt bırakır ve ekip listesinde karşılığı olmayan
  satırlar birikir.
*/
create or replace function private.arvo_yetki_istisnasi_uyesi()
returns trigger
language plpgsql
security definer
set search_path to ''
as $fn$
begin
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = new.organization_id
      and m.user_id = new.user_id
  ) then
    raise exception 'Yetki istisnası yalnızca kurumun kendi üyesine yazılabilir.';
  end if;
  return new;
end;
$fn$;

revoke all on function private.arvo_yetki_istisnasi_uyesi() from public, anon;
grant execute on function private.arvo_yetki_istisnasi_uyesi() to authenticated, service_role;

drop trigger if exists member_capability_permissions_uye on public.member_capability_permissions;
create trigger member_capability_permissions_uye
  before insert or update on public.member_capability_permissions
  for each row execute function private.arvo_yetki_istisnasi_uyesi();

drop trigger if exists member_module_permissions_uye on public.member_module_permissions;
create trigger member_module_permissions_uye
  before insert or update on public.member_module_permissions
  for each row execute function private.arvo_yetki_istisnasi_uyesi();

/*
  ÖLÜ SÜTUN TEMİZLİĞİ DEĞİL, UYARI.

  organization_memberships.permissions (jsonb) hiçbir kod tarafından
  okunmuyor; adı yüzünden yetkinin orada tutulduğu sanılabiliyor. Sütunu
  düşürmüyoruz (tetikleyiciyle yazılıyor olabilir, not null) ama yorumuna
  gerçeği yazıyoruz.
*/
comment on column public.organization_memberships.permissions is
  'KULLANILMIYOR. Yetki üç yerden okunur: role_module_permissions, role_capability_permissions, member_* istisnaları. Bu sütun hiçbir karara girmez.';

comment on table public.role_capability_permissions is 'Rol düzeyinde yetenek istisnaları. Satır yoksa karar lib/yetkiler.ts varsayılanından gelir.';
comment on table public.member_capability_permissions is 'Tek kişi için yetenek istisnası; rol kuralını ezer.';
comment on table public.member_module_permissions is 'Tek kişi için modül istisnası; role_module_permissions satırını ezer.';

notify pgrst, 'reload schema';
