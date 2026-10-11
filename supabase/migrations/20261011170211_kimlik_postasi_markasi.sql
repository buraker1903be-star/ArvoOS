/*
  KİMLİK POSTASININ MARKASI KİME AİT — KARAR BURADA.

  Kimlik e-postaları (davet, şifre yenileme, giriş bağlantısı) kurumun
  adı, logosu, rengi ve iletişim bilgisiyle gidiyor
  (supabase/functions/send-auth-email). Kancadaki eski kod kurumu
  kullanıcının METADATA'sından okuyordu:

    metadata = { ...user_metadata, ...app_metadata }
    organizationId = metadata.arvoos_organization_id ?? …

  `user_metadata` KULLANICININ KENDİ YAZABİLDİĞİ bir alan
  (auth.updateUser({ data: … })). Yani panele girmiş biri oraya BAŞKA
  bir kurumun kimliğini yazıp "şifremi unuttum" diyebilir; gelen posta
  o kurumun adı, logosu, iletişim e-postası ve telefonuyla hazırlanır.
  Hem başka kiracının iletişim bilgisi sızar hem de markası izinsiz
  kullanılır.

  Karar artık veritabanında ve DOĞRULANIYOR: iddia edilen kurum, ancak
  kullanıcının aktif üyeliği varsa ya da o kuruma ait bekleyen bir
  daveti varsa kabul edilir. Davet şartı gerekli — davet sırasında
  henüz üyelik yoktur, ikisi de (ekip daveti ve kurum kurulumu) önce
  organization_invitations satırını yazıyor.

  İddia doğrulanmazsa kullanıcının KENDİ en eski aktif üyeliğine
  düşülür; o da yoksa null döner ve kanca Arvo markasını kullanır.

  GÜVENLİK: security definer (üyelik ve davet tablolarını okuması
  gerekiyor) ama yalnızca service_role çağırabilir — kanca servis
  anahtarıyla işliyor. Tarayıcıdan çağrılamaz: parametresi kullanıcı
  kimliği, yani açık olsaydı herkes herkesin kurumunu sorabilirdi.
*/

create or replace function public.arvo_kimlik_postasi_markasi(
  p_user_id uuid,
  p_email text,
  p_claimed_org uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  with dogrulanmis as (
    select p_claimed_org as id
    where p_claimed_org is not null
      and (
        exists (
          select 1 from public.organization_memberships m
          where m.organization_id = p_claimed_org
            and m.user_id = p_user_id
            and m.is_active = true
        )
        or exists (
          select 1 from public.organization_invitations d
          where d.organization_id = p_claimed_org
            and lower(btrim(d.email)) = lower(btrim(coalesce(p_email, '')))
            and d.status in ('pending', 'sent')
        )
      )
  ),
  kendi as (
    select m.organization_id as id
    from public.organization_memberships m
    where m.user_id = p_user_id and m.is_active = true
    order by m.joined_at nulls last
    limit 1
  ),
  kurum as (
    select id from dogrulanmis
    union all
    select id from kendi where not exists (select 1 from dogrulanmis)
    limit 1
  )
  select jsonb_build_object(
    'id', o.id,
    'name', o.name,
    'logo_url', o.logo_url,
    'primary_color', o.primary_color,
    'contact_email', o.contact_email,
    'contact_phone', o.contact_phone,
    'website_url', o.website_url
  )
  from kurum k join public.organizations o on o.id = k.id
$$;

revoke all on function public.arvo_kimlik_postasi_markasi(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.arvo_kimlik_postasi_markasi(uuid, text, uuid) to service_role;

notify pgrst, 'reload schema';
