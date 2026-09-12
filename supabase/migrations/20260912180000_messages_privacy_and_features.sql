-- Kurum içi mesajlaşma: gizlilik düzeltmeleri ve iMessage tarzı özellikler (2026-09)
--
-- GİZLİLİK
-- 1) "admins_manage_channels" (FOR ALL) ile owner/admin, başkalarının
--    birebir sohbetlerini listede görüyor, kendini üye yapabiliyor ya da
--    kanalı herkese açık yapıp mesajları okuyabiliyordu. Artık kanal ve
--    üye yazma işlemleri yalnızca aşağıdaki güvenli fonksiyonlardan geçer;
--    tablolara doğrudan yazma yetkisi yok. Bu dört tablodaki TÜM eski
--    politikalar (canlıda repoda olmayanlar dahil) silinip eksiksiz yeni
--    set yazılır: izinler birleşerek çalıştığı için unutulan tek bir geniş
--    politika açığı açık bırakırdı.
-- 2) user_presence herkese current_path ve user_agent gösteriyordu. Bu
--    bilgiler artık yalnızca yöneticinin görebildiği oturum kayıtlarında
--    (user_session_logs); presence'ta sadece son görülme kalır.
-- 3) Mesaj eki yolu mesajın kanalına ait olmak zorunda.
--
-- ÖZELLİKLER
-- - Kanal son mesaj önizlemesi / zamanı (listeyi etkinliğe göre sıralar)
-- - Okundu bilgisi sunucu saatiyle (mark_message_channel_read) ve aynı
--   sohbetin üyeleri birbirinin okundu zamanını görür ("Görüldü")
-- - Okunmamış sayısı sunucuda (arvo_message_unread_counts); okundu kaydı
--   olmayan kanalda kurum üyeliği/kanal üyeliği tarihinden sayar
-- - Mesaj düzenleme ve silme (zamanları sunucu yazar, silinen içerik temizlenir)
-- - Grup sohbeti: oluşturma, düzenleme, ayrılma, silme
-- - Realtime: kanallar, üyelikler ve okundu bilgileri de yayında

-- ---------------------------------------------------------------
-- Kolonlar
-- ---------------------------------------------------------------
alter table public.message_channels
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text,
  add column if not exists last_message_sender uuid;

alter table public.internal_messages
  add column if not exists deleted_at timestamptz;

alter table public.user_session_logs
  add column if not exists current_path text;

alter table public.internal_messages drop constraint if exists internal_messages_content_check;
alter table public.internal_messages
  add constraint internal_messages_content_check check (
    deleted_at is not null
    or (body is not null and char_length(trim(body)) between 1 and 4000)
    or attachment_path is not null
  );

create index if not exists message_channels_org_activity_idx
  on public.message_channels (organization_id, last_message_at desc nulls last);

-- ---------------------------------------------------------------
-- Erişim yardımcıları (politikalar içinde özyineleme olmadan)
-- ---------------------------------------------------------------
create or replace function public.arvo_is_message_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.message_channel_members cm
    where cm.channel_id = p_channel_id and cm.user_id = (select auth.uid())
  );
$$;

create or replace function public.arvo_can_access_message_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_channels c
    join public.organization_memberships m
      on m.organization_id = c.organization_id
     and m.user_id = (select auth.uid())
     and m.is_active
    where c.id = p_channel_id
      and (
        not c.is_private
        or exists (
          select 1 from public.message_channel_members cm
          where cm.channel_id = c.id and cm.user_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function public.arvo_is_message_channel_member(uuid) from public, anon;
revoke all on function public.arvo_can_access_message_channel(uuid) from public, anon;
grant execute on function public.arvo_is_message_channel_member(uuid) to authenticated;
grant execute on function public.arvo_can_access_message_channel(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Politikalar: dört tablodaki tüm eski politikaları kaldır, yenisini yaz
-- ---------------------------------------------------------------
do $drop$
declare
  r record;
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('message_channels', 'message_channel_members', 'internal_messages', 'message_read_states')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$drop$;

alter table public.message_channels enable row level security;
alter table public.message_channel_members enable row level security;
alter table public.internal_messages enable row level security;
alter table public.message_read_states enable row level security;

-- Tablo yetkileri: kanal/üye/okundu yazımı yalnızca fonksiyonlardan
revoke all on public.message_channels, public.message_channel_members,
  public.internal_messages, public.message_read_states from anon;
revoke insert, update, delete on public.message_channels from authenticated;
revoke insert, update, delete on public.message_channel_members from authenticated;
revoke insert, update, delete on public.message_read_states from authenticated;
revoke update, delete on public.internal_messages from authenticated;
grant select on public.message_channels, public.message_channel_members,
  public.internal_messages, public.message_read_states to authenticated;
grant insert on public.internal_messages to authenticated;
-- Düzenleme/silme: yalnızca içerik kolonları (kanal, gönderen, tarih değişmez)
grant update (body, edited_at, deleted_at, attachment_path, attachment_name, attachment_mime, attachment_size)
  on public.internal_messages to authenticated;

create policy "messages_channels_select" on public.message_channels
  for select to authenticated
  using (public.arvo_can_access_message_channel(id));

create policy "messages_members_select" on public.message_channel_members
  for select to authenticated
  using (public.arvo_is_message_channel_member(channel_id));

create policy "messages_select" on public.internal_messages
  for select to authenticated
  using (public.arvo_can_access_message_channel(channel_id));

create policy "messages_insert" on public.internal_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and deleted_at is null
    and edited_at is null
    and public.arvo_can_access_message_channel(channel_id)
    and organization_id = (select c.organization_id from public.message_channels c where c.id = channel_id)
    and (attachment_path is null or attachment_path like organization_id::text || '/' || channel_id::text || '/%')
  );

create policy "messages_update_own" on public.internal_messages
  for update to authenticated
  using (sender_id = (select auth.uid()) and deleted_at is null)
  with check (sender_id = (select auth.uid()) and public.arvo_can_access_message_channel(channel_id));

create policy "messages_read_states_select" on public.message_read_states
  for select to authenticated
  using (user_id = (select auth.uid()) or public.arvo_is_message_channel_member(channel_id));

-- ---------------------------------------------------------------
-- Düzenleme/silme kuralları: zamanları sunucu yazar
-- ---------------------------------------------------------------
create or replace function private.arvo_guard_message_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'Silinmiş mesaj değiştirilemez.';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := null;
    new.attachment_path := null;
    new.attachment_name := null;
    new.attachment_mime := null;
    new.attachment_size := null;
    new.edited_at := old.edited_at;
    return new;
  end if;
  -- Ekler düzenlemede değişmez
  new.attachment_path := old.attachment_path;
  new.attachment_name := old.attachment_name;
  new.attachment_mime := old.attachment_mime;
  new.attachment_size := old.attachment_size;
  if new.body is distinct from old.body then
    if (new.body is null or char_length(trim(new.body)) = 0) and old.attachment_path is null then
      raise exception 'Mesaj boş bırakılamaz.';
    end if;
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists arvo_guard_message_update on public.internal_messages;
create trigger arvo_guard_message_update
  before update on public.internal_messages
  for each row execute function private.arvo_guard_message_update();

-- ---------------------------------------------------------------
-- Kanal etkinliği: son mesaj önizlemesi
-- ---------------------------------------------------------------
create or replace function private.arvo_message_preview(p_body text, p_attachment_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_body is not null and char_length(trim(p_body)) > 0 then left(regexp_replace(trim(p_body), '\s+', ' ', 'g'), 140)
    when p_attachment_name is not null then 'Ek: ' || left(p_attachment_name, 120)
    else 'Ek'
  end;
$$;

create or replace function private.arvo_bump_message_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.message_channels
       set last_message_at = new.created_at,
           last_message_preview = private.arvo_message_preview(new.body, new.attachment_name),
           last_message_sender = new.sender_id,
           updated_at = now()
     where id = new.channel_id
       and (last_message_at is null or last_message_at <= new.created_at);
  elsif new.deleted_at is not null and old.deleted_at is null then
    update public.message_channels
       set last_message_preview = 'Bu mesaj silindi'
     where id = new.channel_id and last_message_at = new.created_at;
  elsif new.body is distinct from old.body then
    update public.message_channels
       set last_message_preview = private.arvo_message_preview(new.body, new.attachment_name)
     where id = new.channel_id and last_message_at = new.created_at;
  end if;
  return null;
end;
$$;

drop trigger if exists arvo_bump_message_channel on public.internal_messages;
create trigger arvo_bump_message_channel
  after insert or update on public.internal_messages
  for each row execute function private.arvo_bump_message_channel();

-- Mevcut kanallar için önizlemeyi doldur
update public.message_channels c
   set last_message_at = x.created_at,
       last_message_preview = private.arvo_message_preview(x.body, x.attachment_name),
       last_message_sender = x.sender_id
  from (
    select distinct on (channel_id) channel_id, created_at, body, attachment_name, sender_id
    from public.internal_messages
    where deleted_at is null
    order by channel_id, created_at desc
  ) x
 where x.channel_id = c.id
   and c.last_message_at is distinct from x.created_at;

-- ---------------------------------------------------------------
-- Okundu ve okunmamış
-- ---------------------------------------------------------------
create or replace function public.mark_message_channel_read(p_channel_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null or not public.arvo_can_access_message_channel(p_channel_id) then
    raise exception 'Sohbet bulunamadı.';
  end if;
  select organization_id into v_org from public.message_channels where id = p_channel_id;
  insert into public.message_read_states (organization_id, channel_id, user_id, last_read_at, updated_at)
  values (v_org, p_channel_id, (select auth.uid()), v_now, v_now)
  on conflict (channel_id, user_id) do update
    set last_read_at = greatest(public.message_read_states.last_read_at, excluded.last_read_at),
        updated_at = excluded.updated_at;
  return v_now;
end;
$$;

create or replace function public.arvo_message_unread_counts(p_organization_id uuid)
returns table (channel_id uuid, unread integer)
language sql
stable
security definer
set search_path = ''
as $$
  -- Katılma tarihi: organization_memberships'te zaman kolonu yok; hesabın
  -- oluşturulma zamanı (davetle katılan çalışan için katılma anı) kullanılır.
  with me as (
    select m.user_id, u.created_at as joined_at
    from public.organization_memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
    limit 1
  )
  select c.id, count(msg.id)::integer
  from public.message_channels c
  cross join me
  left join public.message_channel_members cm on cm.channel_id = c.id and cm.user_id = me.user_id
  left join public.message_read_states rs on rs.channel_id = c.id and rs.user_id = me.user_id
  join public.internal_messages msg
    on msg.channel_id = c.id
   and msg.sender_id <> me.user_id
   and msg.deleted_at is null
   and msg.created_at > coalesce(rs.last_read_at, cm.created_at, me.joined_at)
  where c.organization_id = p_organization_id
    and (not c.is_private or cm.user_id is not null)
  group by c.id;
$$;

-- ---------------------------------------------------------------
-- Grup sohbetleri
-- ---------------------------------------------------------------
create or replace function public.create_group_message_channel(
  p_organization_id uuid,
  p_name text,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'Oturum gerekli.'; end if;
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = v_me and is_active
  ) then
    raise exception 'Aktif kurum üyeliği bulunamadı.';
  end if;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Grup adı 2 ile 80 karakter arasında olmalıdır.';
  end if;
  if exists (
    select 1 from public.message_channels
    where organization_id = p_organization_id and lower(name) = lower(v_name)
  ) then
    raise exception 'Bu adla bir sohbet zaten var.';
  end if;

  insert into public.message_channels (organization_id, name, description, is_private, created_by, channel_type)
  values (p_organization_id, v_name, null, true, v_me, 'group')
  returning id into v_id;

  insert into public.message_channel_members (channel_id, organization_id, user_id)
  select distinct v_id, p_organization_id, x.u
  from unnest(array_append(coalesce(p_member_ids, '{}'::uuid[]), v_me)) as x(u)
  where exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_organization_id and m.user_id = x.u and m.is_active
  )
  on conflict (channel_id, user_id) do nothing;

  return v_id;
end;
$$;

create or replace function private.arvo_can_manage_group(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.message_channels c
    where c.id = p_channel_id
      and c.channel_type = 'group'
      and c.is_private
      and (
        c.created_by = (select auth.uid())
        or (
          public.arvo_is_message_channel_member(c.id)
          and exists (
            select 1 from public.organization_memberships m
            where m.organization_id = c.organization_id
              and m.user_id = (select auth.uid())
              and m.is_active
              and m.role in ('owner', 'admin')
          )
        )
      )
  );
$$;

create or replace function public.update_group_message_channel(
  p_channel_id uuid,
  p_name text,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_members uuid[];
begin
  if not private.arvo_can_manage_group(p_channel_id) then
    raise exception 'Bu grubu düzenleme yetkiniz yok.';
  end if;
  select organization_id into v_org from public.message_channels where id = p_channel_id for update;
  if char_length(v_name) not between 2 and 80 then
    raise exception 'Grup adı 2 ile 80 karakter arasında olmalıdır.';
  end if;
  if exists (
    select 1 from public.message_channels
    where organization_id = v_org and lower(name) = lower(v_name) and id <> p_channel_id
  ) then
    raise exception 'Bu adla bir sohbet zaten var.';
  end if;
  update public.message_channels set name = v_name, updated_at = now() where id = p_channel_id;

  -- Düzenleyen her zaman üye kalır; yalnızca aktif kurum üyeleri eklenir
  v_members := array_append(coalesce(p_member_ids, '{}'::uuid[]), v_me);
  delete from public.message_channel_members
   where channel_id = p_channel_id and not (user_id = any (v_members));
  delete from public.message_read_states
   where channel_id = p_channel_id and not (user_id = any (v_members));
  insert into public.message_channel_members (channel_id, organization_id, user_id)
  select distinct p_channel_id, v_org, x.u
  from unnest(v_members) as x(u)
  where exists (
    select 1 from public.organization_memberships m
    where m.organization_id = v_org and m.user_id = x.u and m.is_active
  )
  on conflict (channel_id, user_id) do nothing;
end;
$$;

create or replace function public.leave_message_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.message_channels
    where id = p_channel_id and channel_type = 'group'
  ) then
    raise exception 'Yalnızca grup sohbetlerinden ayrılabilirsiniz.';
  end if;
  delete from public.message_channel_members where channel_id = p_channel_id and user_id = (select auth.uid());
  delete from public.message_read_states where channel_id = p_channel_id and user_id = (select auth.uid());
  -- Son üye de ayrıldıysa grup kaldırılır
  if not exists (select 1 from public.message_channel_members where channel_id = p_channel_id) then
    delete from public.message_channels where id = p_channel_id and channel_type = 'group';
  end if;
end;
$$;

create or replace function public.delete_group_message_channel(p_channel_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.arvo_can_manage_group(p_channel_id) then
    raise exception 'Bu grubu silme yetkiniz yok.';
  end if;
  delete from public.message_channels where id = p_channel_id and channel_type = 'group';
end;
$$;

revoke all on function public.mark_message_channel_read(uuid) from public, anon;
revoke all on function public.arvo_message_unread_counts(uuid) from public, anon;
revoke all on function public.create_group_message_channel(uuid, text, uuid[]) from public, anon;
revoke all on function public.update_group_message_channel(uuid, text, uuid[]) from public, anon;
revoke all on function public.leave_message_channel(uuid) from public, anon;
revoke all on function public.delete_group_message_channel(uuid) from public, anon;
revoke all on function private.arvo_can_manage_group(uuid) from public, anon, authenticated;
grant execute on function public.mark_message_channel_read(uuid) to authenticated;
grant execute on function public.arvo_message_unread_counts(uuid) to authenticated;
grant execute on function public.create_group_message_channel(uuid, text, uuid[]) to authenticated;
grant execute on function public.update_group_message_channel(uuid, text, uuid[]) to authenticated;
grant execute on function public.leave_message_channel(uuid) to authenticated;
grant execute on function public.delete_group_message_channel(uuid) to authenticated;

-- ---------------------------------------------------------------
-- Çevrimiçi durum: sayfa ve cihaz bilgisi herkese açık olmasın
-- ---------------------------------------------------------------
update public.user_presence
   set current_path = null, user_agent = null
 where current_path is not null or user_agent is not null;
revoke select on public.user_presence from authenticated;
-- session_id da okunabilir olmalı: dakikalık kayıt (upsert) ON CONFLICT DO
-- UPDATE SET session_id = excluded.session_id yaptığı için Postgres bu
-- kolonda SELECT yetkisi ister. Oturum kimliği tek başına bilgi vermez
-- (user_session_logs yalnızca kişinin kendisine ve yöneticiye açık).
grant select (organization_id, user_id, session_id, last_seen_at, updated_at) on public.user_presence to authenticated;

-- ---------------------------------------------------------------
-- Realtime yayını
-- ---------------------------------------------------------------
do $publication$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['internal_messages', 'message_channels', 'message_channel_members', 'message_read_states'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end
$publication$;
