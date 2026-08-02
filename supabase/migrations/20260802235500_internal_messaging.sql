create table if not exists public.message_channels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  description text,
  is_private boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name),
  unique (id,organization_id)
);

create table if not exists public.message_channel_members (
  channel_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id,user_id),
  constraint message_channel_members_channel_org_fk foreign key (channel_id,organization_id)
    references public.message_channels(id,organization_id) on delete cascade
);

create table if not exists public.internal_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  channel_id uuid not null,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint internal_messages_channel_org_fk foreign key (channel_id,organization_id)
    references public.message_channels(id,organization_id) on delete cascade
);

alter table public.message_channels enable row level security;
alter table public.message_channel_members enable row level security;
alter table public.internal_messages enable row level security;
grant select,insert,update on public.message_channels,public.message_channel_members,public.internal_messages to authenticated;

create policy "members_read_available_channels" on public.message_channels for select to authenticated using (
  exists(select 1 from public.organization_memberships m where m.organization_id=message_channels.organization_id and m.user_id=(select auth.uid()) and m.is_active)
  and (not is_private or exists(select 1 from public.message_channel_members cm where cm.channel_id=message_channels.id and cm.user_id=(select auth.uid())))
);
create policy "admins_manage_channels" on public.message_channels for all to authenticated using (
  exists(select 1 from public.organization_memberships m where m.organization_id=message_channels.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))
) with check (
  exists(select 1 from public.organization_memberships m where m.organization_id=message_channels.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))
);
create policy "members_read_channel_members" on public.message_channel_members for select to authenticated using (
  exists(select 1 from public.organization_memberships m where m.organization_id=message_channel_members.organization_id and m.user_id=(select auth.uid()) and m.is_active)
);
create policy "admins_manage_channel_members" on public.message_channel_members for all to authenticated using (
  exists(select 1 from public.organization_memberships m where m.organization_id=message_channel_members.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))
) with check (
  exists(select 1 from public.organization_memberships m where m.organization_id=message_channel_members.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))
);
create policy "members_read_channel_messages" on public.internal_messages for select to authenticated using (
  exists(select 1 from public.message_channels c where c.id=internal_messages.channel_id and c.organization_id=internal_messages.organization_id and (
    not c.is_private or exists(select 1 from public.message_channel_members cm where cm.channel_id=c.id and cm.user_id=(select auth.uid()))
  ))
);
create policy "members_send_channel_messages" on public.internal_messages for insert to authenticated with check (
  sender_id=(select auth.uid()) and exists(select 1 from public.organization_memberships m where m.organization_id=internal_messages.organization_id and m.user_id=(select auth.uid()) and m.is_active)
  and exists(select 1 from public.message_channels c where c.id=internal_messages.channel_id and c.organization_id=internal_messages.organization_id and (
    not c.is_private or exists(select 1 from public.message_channel_members cm where cm.channel_id=c.id and cm.user_id=(select auth.uid()))
  ))
);

insert into public.arvo_modules(code,name,description,sort_order,is_active)
values('messages','Kurum İçi Mesajlar','Ekip kanalları ve kurum içi mesajlaşma',55,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,is_active=true;
insert into public.organization_modules(organization_id,module_code,is_enabled)
select id,'messages',true from public.organizations
on conflict(organization_id,module_code) do update set is_enabled=true;

insert into public.message_channels(organization_id,name,description,created_by)
select o.id,'Genel','Kurum genel duyuru ve ekip iletişim kanalı',m.user_id
from public.organizations o
join lateral (
  select user_id from public.organization_memberships where organization_id=o.id and is_active=true order by created_at asc limit 1
) m on true
on conflict(organization_id,name) do nothing;

create index if not exists internal_messages_channel_created_idx on public.internal_messages(channel_id,created_at desc);
create index if not exists message_channels_org_idx on public.message_channels(organization_id,name);