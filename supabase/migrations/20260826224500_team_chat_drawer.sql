alter table public.message_channels add column if not exists channel_type text not null default 'group';
alter table public.message_channels add column if not exists direct_key text;
create unique index if not exists message_channels_direct_key_idx on public.message_channels(organization_id,direct_key) where direct_key is not null;

drop policy if exists "presence_select_own_or_manager" on public.user_presence;
create policy "presence_select_same_organization" on public.user_presence
for select to authenticated using (
  exists (
    select 1 from public.organization_memberships viewer
    where viewer.organization_id=user_presence.organization_id
      and viewer.user_id=(select auth.uid())
      and viewer.is_active=true
  )
);

drop function if exists public.create_direct_message_channel(uuid);
create or replace function public.create_direct_message_channel(target_user_id uuid,target_organization_id uuid)
returns uuid
language plpgsql
security definer
set search_path='public'
as $function$
declare
  current_user_id uuid := auth.uid();
  channel_id uuid;
  pair_key text;
begin
  if current_user_id is null then raise exception 'Oturum gerekli.'; end if;
  if target_user_id is null or target_user_id=current_user_id then raise exception 'Geçerli bir ekip üyesi seçin.'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=target_organization_id and m.user_id=current_user_id and m.is_active) then raise exception 'Aktif kurum üyeliği bulunamadı.'; end if;
  if not exists(select 1 from public.organization_memberships m where m.organization_id=target_organization_id and m.user_id=target_user_id and m.is_active) then raise exception 'Seçilen kullanıcı bu kurumun aktif üyesi değil.'; end if;

  pair_key := case when current_user_id::text < target_user_id::text then current_user_id::text||':'||target_user_id::text else target_user_id::text||':'||current_user_id::text end;
  select c.id into channel_id from public.message_channels c where c.organization_id=target_organization_id and c.channel_type='direct' and c.direct_key=pair_key limit 1;
  if channel_id is null then
    insert into public.message_channels(organization_id,name,description,is_private,created_by,channel_type,direct_key)
    values(target_organization_id,'Birebir Sohbet','Kişiye özel ekip sohbeti',true,current_user_id,'direct',pair_key)
    returning id into channel_id;
    insert into public.message_channel_members(channel_id,organization_id,user_id)
    values(channel_id,target_organization_id,current_user_id),(channel_id,target_organization_id,target_user_id)
    on conflict(channel_id,user_id) do nothing;
  end if;
  return channel_id;
end;
$function$;

revoke all on function public.create_direct_message_channel(uuid,uuid) from public,anon;
grant execute on function public.create_direct_message_channel(uuid,uuid) to authenticated;

do $publication$
begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='internal_messages') then alter publication supabase_realtime add table public.internal_messages; end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_presence') then alter publication supabase_realtime add table public.user_presence; end if;
end
$publication$;
