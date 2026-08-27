drop policy if exists "direct_channel_creator_reads_pending_channel" on public.message_channels;
create policy "direct_channel_creator_reads_pending_channel" on public.message_channels
for select to authenticated using (
  created_by=(select auth.uid())
  and channel_type='direct'
  and is_private=true
  and direct_key is not null
  and (select auth.uid())::text=any(string_to_array(direct_key,':'))
  and exists(
    select 1
    from public.organization_memberships creator_membership
    where creator_membership.organization_id=message_channels.organization_id
      and creator_membership.user_id=(select auth.uid())
      and creator_membership.is_active
  )
);
