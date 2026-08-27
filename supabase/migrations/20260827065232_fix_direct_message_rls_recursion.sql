create unique index if not exists message_channels_direct_membership_fk_idx
on public.message_channels(id,organization_id,created_by,direct_key);

alter table public.message_channel_members
  add column if not exists channel_created_by uuid,
  add column if not exists channel_direct_key text;

update public.message_channel_members member
set channel_created_by=channel.created_by,
    channel_direct_key=channel.direct_key
from public.message_channels channel
where channel.id=member.channel_id
  and channel.organization_id=member.organization_id
  and channel.channel_type='direct'
  and (
    member.channel_created_by is distinct from channel.created_by
    or member.channel_direct_key is distinct from channel.direct_key
  );

do $constraint$
begin
  if not exists(
    select 1
    from pg_constraint
    where conname='message_channel_members_direct_channel_fk'
      and conrelid='public.message_channel_members'::regclass
  ) then
    alter table public.message_channel_members
      add constraint message_channel_members_direct_channel_fk
      foreign key(channel_id,organization_id,channel_created_by,channel_direct_key)
      references public.message_channels(id,organization_id,created_by,direct_key)
      on delete cascade;
  end if;
end
$constraint$;

drop policy if exists "direct_channel_creator_adds_members" on public.message_channel_members;
create policy "direct_channel_creator_adds_members"
on public.message_channel_members
for insert
to authenticated
with check (
  channel_created_by=(select auth.uid())
  and channel_direct_key is not null
  and (select auth.uid())::text=any(string_to_array(channel_direct_key,':'))
  and message_channel_members.user_id::text=any(string_to_array(channel_direct_key,':'))
  and exists(
    select 1
    from public.organization_memberships target
    where target.organization_id=message_channel_members.organization_id
      and target.user_id=message_channel_members.user_id
      and target.is_active
  )
);

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
  if current_user_id is null then raise exception 'Oturum gerekli.'; end if;
  if target_user_id is null or target_user_id=current_user_id then raise exception 'Geçerli bir ekip üyesi seçin.'; end if;
  if not exists(select 1 from public.organization_memberships membership where membership.organization_id=target_organization_id and membership.user_id=current_user_id and membership.is_active) then raise exception 'Aktif kurum üyeliği bulunamadı.'; end if;
  if not exists(select 1 from public.organization_memberships membership where membership.organization_id=target_organization_id and membership.user_id=target_user_id and membership.is_active) then raise exception 'Seçilen kullanıcı bu kurumun aktif üyesi değil.'; end if;

  pair_key := case when current_user_id::text < target_user_id::text then current_user_id::text||':'||target_user_id::text else target_user_id::text||':'||current_user_id::text end;

  select channel.id into direct_channel_id
  from public.message_channels channel
  where channel.organization_id=target_organization_id
    and channel.channel_type='direct'
    and channel.direct_key=pair_key
  limit 1;

  if direct_channel_id is null then
    insert into public.message_channels(organization_id,name,description,is_private,created_by,channel_type,direct_key)
    values(target_organization_id,'Birebir Sohbet','Kişiye özel ekip sohbeti',true,current_user_id,'direct',pair_key)
    returning id into direct_channel_id;

    insert into public.message_channel_members(
      channel_id,
      organization_id,
      user_id,
      channel_created_by,
      channel_direct_key
    )
    values
      (direct_channel_id,target_organization_id,current_user_id,current_user_id,pair_key),
      (direct_channel_id,target_organization_id,target_user_id,current_user_id,pair_key)
    on conflict(channel_id,user_id) do nothing;
  end if;

  return direct_channel_id;
end;
$function$;

revoke all on function public.create_direct_message_channel(uuid,uuid) from public,anon;
grant execute on function public.create_direct_message_channel(uuid,uuid) to authenticated;
