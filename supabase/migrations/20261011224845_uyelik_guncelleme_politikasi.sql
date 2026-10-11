/*
  ÜYELİK TABLOSU: YÖNETİCİ OKUYAMIYOR, KİMSE YAZAMIYORDU.

  organization_memberships'te RLS açıktı ama yalnızca iki SELECT
  politikası vardı: "kendi satırını oku" ve "platform kurucusu hepsini
  okur". UPDATE politikası ise hiç yoktu. Sonuçları (12.10.2026'da
  PGlite'ta ölçüldü):

  1. Kurum Sahibi ya da Yönetici, BAŞKA personelin üyelik satırını
     okuyamıyordu. Yetkilendirme ekranının kişi listesi, ekip
     ekranındaki "Panel erişimi" sayısı ve kişi yetkileri sayfası bu
     yüzden yalnızca bakan kişinin kendi satırını görüyordu.
  2. Rol değiştirmek ve "erişimi kapat" demek HİÇBİR satıra
     dokunmuyordu — Kurum Sahibi'nin oturumunda bile. Panel
     "yetkiniz yok veya kayıt bulunamadı" diyordu; kurum personelini
     müdür yapamıyordu.

  Kural service_role'e değil POLİTİKAYA yazılıyor: paneli servis
  anahtarıyla yazdırmak da çözerdi ama RLS'i tamamen atlar ve kuralı
  tek bir dosyanın dikkatine bırakırdı. Bu depoda yetki üç yerde
  birden duruyor (AGENTS.md "Yetki üç yerdedir").

  Politikalar yetki tablolarının konvansiyonunu izliyor
  (member_module_permissions: `private.arvo_is_org_admin`), ekip
  ekranındaki TypeScript korumalarının birebir ikizi:

    - Yönetici/Kurum Sahibi kendi kurumunun üyeliklerini OKUR.
    - Kurum Sahibi satırına yalnızca bir Kurum Sahibi dokunabilir
      (using: eski satır) — Yönetici sahibi düşüremez.
    - owner rolünü yalnızca bir Kurum Sahibi verebilir (with check:
      yeni satır) — Yönetici kendini de yükseltemez.

  POLİTİKA KENDİ TABLOSUNU SORGULAMAZ: ilk hâli üyelikleri alt
  sorguyla okuyordu ve Postgres "infinite recursion detected in policy"
  dedi. Karar bu yüzden private şemasındaki SECURITY DEFINER
  yardımcılara soruluyor (arvo_is_org_admin'in kalıbı); definer olduğu
  için RLS'e takılmıyor.

  Yönetim departmanı kuralı yerinde: o departmandaki kişinin rolü
  tetikleyiciyle owner'a dönüyor (private.arvo_sync_management_owner);
  panel bunu önceden söyleyip rol değişimini reddediyor.
*/

/* Sahiplik sorusunun definer ikizi (arvo_is_org_admin zaten var). */
create or replace function private.arvo_is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text = 'owner'
  );
$$;

revoke all on function private.arvo_is_org_owner(uuid) from public;
grant execute on function private.arvo_is_org_owner(uuid) to authenticated, service_role;

drop policy if exists "admins read organization memberships" on public.organization_memberships;

create policy "admins read organization memberships"
  on public.organization_memberships
  as permissive for select to authenticated
  using (private.arvo_is_org_admin(organization_id));

drop policy if exists "owners admins update organization memberships" on public.organization_memberships;

create policy "owners admins update organization memberships"
  on public.organization_memberships
  as permissive for update to authenticated
  using (
    private.arvo_is_org_owner(organization_id)
    or (private.arvo_is_org_admin(organization_id) and role::text <> 'owner')
  )
  with check (
    private.arvo_is_org_owner(organization_id)
    or (private.arvo_is_org_admin(organization_id) and role::text <> 'owner')
  );

notify pgrst, 'reload schema';
