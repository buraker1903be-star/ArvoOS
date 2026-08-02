alter table public.message_channels
  add column if not exists channel_type text not null default 'channel'
    check (channel_type in ('channel','direct')),
  add column if not exists direct_key text;

create unique index if not exists message_channels_direct_key_unique
  on public.message_channels(organization_id,direct_key)
  where channel_type='direct' and direct_key is not null;

create or replace function public.create_direct_message_channel(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_org_id uuid;
  channel_id uuid;
  pair_key text;
  target_name text;
begin
  if current_user_id is null then
    raise exception 'Oturum gerekli.';
  end if;
  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Geçerli bir ekip üyesi seçin.';
  end if;

  select m.organization_id into current_org_id
  from public.organization_memberships m
  where m.user_id=current_user_id and m.is_active
  order by m.joined_at asc
  limit 1;

  if current_org_id is null then
    raise exception 'Aktif kurum üyeliği bulunamadı.';
  end if;

  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id=current_org_id
      and m.user_id=target_user_id
      and m.is_active
  ) then
    raise exception 'Seçilen kullanıcı bu kurumun aktif üyesi değil.';
  end if;

  pair_key := case when current_user_id::text < target_user_id::text
    then current_user_id::text || ':' || target_user_id::text
    else target_user_id::text || ':' || current_user_id::text end;

  select c.id into channel_id
  from public.message_channels c
  where c.organization_id=current_org_id
    and c.channel_type='direct'
    and c.direct_key=pair_key
  limit 1;

  if channel_id is null then
    select coalesce(p.full_name,'Ekip Üyesi') into target_name
    from public.profiles p where p.id=target_user_id;

    insert into public.message_channels(
      organization_id,name,description,is_private,created_by,channel_type,direct_key
    ) values (
      current_org_id,
      coalesce(target_name,'Ekip Üyesi'),
      'Kişiye özel sohbet',
      true,
      current_user_id,
      'direct',
      pair_key
    ) returning id into channel_id;

    insert into public.message_channel_members(channel_id,organization_id,user_id)
    values
      (channel_id,current_org_id,current_user_id),
      (channel_id,current_org_id,target_user_id)
    on conflict(channel_id,user_id) do nothing;
  end if;

  return channel_id;
end;
$$;

grant execute on function public.create_direct_message_channel(uuid) to authenticated;
