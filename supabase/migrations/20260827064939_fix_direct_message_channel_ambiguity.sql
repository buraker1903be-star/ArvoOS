create or replace function public.create_direct_message_channel(
  target_user_id uuid,
  target_organization_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path='public'
as $function$
declare
  current_user_id uuid := auth.uid();
  direct_channel_id uuid;
  pair_key text;
begin
  if current_user_id is null then
    raise exception 'Oturum gerekli.';
  end if;

  if target_user_id is null or target_user_id=current_user_id then
    raise exception 'Geçerli bir ekip üyesi seçin.';
  end if;

  if not exists(
    select 1
    from public.organization_memberships membership
    where membership.organization_id=target_organization_id
      and membership.user_id=current_user_id
      and membership.is_active
  ) then
    raise exception 'Aktif kurum üyeliği bulunamadı.';
  end if;

  if not exists(
    select 1
    from public.organization_memberships membership
    where membership.organization_id=target_organization_id
      and membership.user_id=target_user_id
      and membership.is_active
  ) then
    raise exception 'Seçilen kullanıcı bu kurumun aktif üyesi değil.';
  end if;

  pair_key := case
    when current_user_id::text < target_user_id::text
      then current_user_id::text||':'||target_user_id::text
    else target_user_id::text||':'||current_user_id::text
  end;

  select channel.id
  into direct_channel_id
  from public.message_channels channel
  where channel.organization_id=target_organization_id
    and channel.channel_type='direct'
    and channel.direct_key=pair_key
  limit 1;

  if direct_channel_id is null then
    insert into public.message_channels(
      organization_id,
      name,
      description,
      is_private,
      created_by,
      channel_type,
      direct_key
    )
    values(
      target_organization_id,
      'Birebir Sohbet',
      'Kişiye özel ekip sohbeti',
      true,
      current_user_id,
      'direct',
      pair_key
    )
    returning id into direct_channel_id;

    insert into public.message_channel_members(
      channel_id,
      organization_id,
      user_id
    )
    values
      (direct_channel_id,target_organization_id,current_user_id),
      (direct_channel_id,target_organization_id,target_user_id)
    on conflict(channel_id,user_id) do nothing;
  end if;

  return direct_channel_id;
end;
$function$;

revoke all on function public.create_direct_message_channel(uuid,uuid) from public,anon;
grant execute on function public.create_direct_message_channel(uuid,uuid) to authenticated;
