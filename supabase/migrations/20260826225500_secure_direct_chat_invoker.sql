drop policy if exists "members_create_direct_channels" on public.message_channels;
create policy "members_create_direct_channels" on public.message_channels
for insert to authenticated with check (
  created_by=(select auth.uid())
  and channel_type='direct'
  and is_private=true
  and direct_key is not null
  and (select auth.uid())::text=any(string_to_array(direct_key,':'))
  and exists(select 1 from public.organization_memberships m where m.organization_id=message_channels.organization_id and m.user_id=(select auth.uid()) and m.is_active)
);

drop policy if exists "direct_channel_creator_adds_members" on public.message_channel_members;
create policy "direct_channel_creator_adds_members" on public.message_channel_members
for insert to authenticated with check (
  exists(
    select 1 from public.message_channels c
    where c.id=message_channel_members.channel_id
      and c.organization_id=message_channel_members.organization_id
      and c.created_by=(select auth.uid())
      and c.channel_type='direct'
      and (select auth.uid())::text=any(string_to_array(c.direct_key,':'))
      and message_channel_members.user_id::text=any(string_to_array(c.direct_key,':'))
  )
  and exists(select 1 from public.organization_memberships target where target.organization_id=message_channel_members.organization_id and target.user_id=message_channel_members.user_id and target.is_active)
);

alter function public.create_direct_message_channel(uuid,uuid) security invoker;
