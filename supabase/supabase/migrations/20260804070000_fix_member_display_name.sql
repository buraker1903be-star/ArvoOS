-- Ekip Yönetimi'nde bazı kullanıcılar (özellikle daveti e-posta yerine
-- doğrudan mevcut hesap eşleştirmesiyle kabul edilenler) profiles.full_name
-- hiç set edilmeden kuruma bağlanabiliyor ve "İsimsiz kullanıcı" görünüyor.
-- Kurum sahibi/yöneticisinin bunu elle düzeltebilmesi için güvenli bir RPC.

create or replace function public.update_member_display_name(
  p_organization_id uuid,
  p_user_id uuid,
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role in ('owner','admin')
  ) then
    raise exception 'Bu işlem için yetkiniz yok.';
  end if;

  if not exists (
    select 1 from public.organization_memberships target
    where target.organization_id = p_organization_id
      and target.user_id = p_user_id
  ) then
    raise exception 'Bu kullanıcı bu kuruma ait değil.';
  end if;

  insert into public.profiles (id, full_name, updated_at)
  values (p_user_id, nullif(trim(p_full_name), ''), now())
  on conflict (id) do update set full_name = excluded.full_name, updated_at = now();
end;
$$;

revoke all on function public.update_member_display_name(uuid, uuid, text) from public;
grant execute on function public.update_member_display_name(uuid, uuid, text) to authenticated;
