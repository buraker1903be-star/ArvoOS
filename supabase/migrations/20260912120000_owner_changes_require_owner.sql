-- Kurum Sahibi (owner) yetkisini verme ve geri alma artık veritabanında
-- tek bir kurala bağlı.
--
-- Denetimde bulunan açıklar (20260912100000 sonrası):
--  * invite-team-member edge function servis rolüyle yazıyordu ve önceki
--    korumalar servis rolünü güvenilir sayıyordu. Bir Yönetici (admin)
--    fonksiyonu doğrudan çağırarak kendini veya başkasını owner yapabiliyor,
--    sahibin e-postasını davet ederek onu Satış Personeli'ne düşürebiliyordu.
--  * Yönetim departmanı koruması yalnızca departman değişikliğine bakıyordu;
--    bir Yönetici, departmandaki birini "Pasif" yaparak yetkisini alabiliyor,
--    işten ayrılmış birini "Aktif" yaparak yetki verebiliyordu.
--
-- Kural: bir üyeliğin aktif owner olması veya aktif owner olmaktan çıkması
-- yalnızca şu durumlarda mümkün:
--   1) istek, aktif bir Kurum Sahibi oturumuyla yapılıyorsa;
--   2) istek bir API isteği değilse (SQL Editor, migration, Auth sunucusu);
--   3) kurumun henüz aktif sahibi yoksa ve ilk sahip ekleniyorsa (kurulum).
-- Servis rolü ve anonim istekler kimin adına yapıldığı bilinmediği için
-- sahip sayılmaz. Ek olarak kurumdaki son aktif sahip kaldırılamaz.

-- ---------------------------------------------------------------
-- İsteğin API rolü: 'authenticated', 'service_role', 'anon' ya da
-- API dışı bağlantılarda null.
-- ---------------------------------------------------------------
create or replace function private.arvo_request_role()
returns text
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$function$;

create or replace function private.arvo_caller_is_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when private.arvo_request_role() is null then true
    when auth.uid() is null then false
    else exists (
      select 1
      from public.organization_memberships m
      where m.organization_id = p_organization_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role::text = 'owner'
    )
  end;
$function$;

-- ---------------------------------------------------------------
-- Üyelik: owner verme/alma koruması
-- ---------------------------------------------------------------
create or replace function private.arvo_membership_owner_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_org uuid;
  v_user uuid;
  v_grant boolean := false;
  v_revoke boolean := false;
  v_was_owner boolean := false;
begin
  -- INSERT'te OLD, DELETE'te NEW boş; yalnızca dolu olanı okuyoruz.
  if tg_op = 'DELETE' then
    v_org := old.organization_id;
    v_user := old.user_id;
    v_revoke := old.role::text = 'owner' and old.is_active;
  else
    v_org := new.organization_id;
    v_user := new.user_id;
    v_grant := new.role::text = 'owner' and new.is_active;
    if tg_op = 'UPDATE' then
      v_was_owner := old.role::text = 'owner' and old.is_active;
      v_revoke := v_was_owner and not v_grant;
      v_grant := v_grant and not v_was_owner;
    end if;
  end if;

  if not (v_grant or v_revoke) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if not private.arvo_caller_is_owner(v_org) then
    -- Kurulum: aktif sahibi olmayan kuruma ilk sahip eklenebilir.
    if not (v_grant and not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = v_org
        and m.role::text = 'owner'
        and m.is_active
        and m.user_id <> v_user
    )) then
      raise exception 'Kurum Sahibi yetkisi yalnızca bir Kurum Sahibi tarafından verilebilir veya kaldırılabilir.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  -- Kurum kilitlenmesin: son aktif sahip kaldırılamaz (API istekleri için).
  if v_revoke
     and private.arvo_request_role() is not null
     and not exists (
       select 1 from public.organization_memberships m
       where m.organization_id = v_org
         and m.role::text = 'owner'
         and m.is_active
         and m.user_id <> v_user
     ) then
    raise exception 'Kurumun en az bir aktif Kurum Sahibi olmalı; son sahibin yetkisi kaldırılamaz.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

revoke all on function private.arvo_membership_owner_guard() from public;

drop trigger if exists arvo_membership_owner_guard on public.organization_memberships;
create trigger arvo_membership_owner_guard
  before insert or update of role, is_active or delete on public.organization_memberships
  for each row execute function private.arvo_membership_owner_guard();

-- ---------------------------------------------------------------
-- Davet kabulü (auth.users tetikleyicisi): sahiplik veren davet yalnızca
-- aktif bir Kurum Sahibi göndermişse ya da kurulum davetiyse geçerli.
-- Mevcut üyeliğin rolü artık ezilmez.
-- ---------------------------------------------------------------
create or replace function private.activate_organization_owner_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
  invitation public.organization_invitations%rowtype;
  employee_id uuid;
  v_role public.organization_invitations.role%type;
  v_provisioning boolean;
  v_trusted_inviter boolean;
begin
  if new.email_confirmed_at is null or old.email_confirmed_at is not null then return new; end if;
  invitation_id := nullif(new.raw_user_meta_data ->> 'arvoos_invitation_id', '')::uuid;
  if invitation_id is null then return new; end if;

  select * into invitation from public.organization_invitations
  where id = invitation_id and lower(email) = lower(new.email) and status in ('pending','sent') and expires_at > now()
  for update;
  if not found then return new; end if;

  v_provisioning := not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = invitation.organization_id and m.role::text = 'owner' and m.is_active
  );
  v_trusted_inviter := v_provisioning or exists (
    select 1 from public.organization_memberships m
    where m.organization_id = invitation.organization_id
      and m.user_id = invitation.invited_by
      and m.role::text = 'owner'
      and m.is_active
  );
  v_role := invitation.role;
  if v_role::text = 'owner' and not v_trusted_inviter then
    v_role := 'member';
  end if;

  insert into public.profiles (id, full_name, updated_at)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)), now())
  on conflict (id) do update set updated_at = excluded.updated_at;

  insert into public.organization_memberships (organization_id, user_id, role, is_active)
  values (invitation.organization_id, new.id, v_role, true)
  on conflict (organization_id, user_id) do nothing;

  -- Yönetim departmanındaki bir kaydı bağlamak owner yetkisi verir;
  -- daveti bir Kurum Sahibi göndermediyse bağlanmaz.
  employee_id := nullif(new.raw_user_meta_data ->> 'arvoos_employee_id', '')::uuid;
  if employee_id is not null and (
    v_trusted_inviter or not exists (
      select 1 from public.hr_employees e
      where e.id = employee_id and private.arvo_is_management_department(e.department_id)
    )
  ) then
    update public.hr_employees
    set user_id = new.id
    where id = employee_id and organization_id = invitation.organization_id;
  end if;

  update public.organization_invitations
  set status = 'accepted', auth_user_id = new.id, accepted_at = now(), updated_at = now(), error_message = null
  where id = invitation.id;

  return new;
end;
$$;

revoke all on function private.activate_organization_owner_invitation() from public;
revoke all on function private.activate_organization_owner_invitation() from anon;

-- Kontrol: her kurumun aktif sahip sayısı (0 olmamalı).
select o.slug, count(m.user_id) filter (where m.role::text = 'owner' and m.is_active) as aktif_sahip
from public.organizations o
left join public.organization_memberships m on m.organization_id = o.id
group by o.slug
order by o.slug;
