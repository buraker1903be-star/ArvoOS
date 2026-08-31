alter table public.internal_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;

alter table public.internal_messages alter column body drop not null;
alter table public.internal_messages drop constraint if exists internal_messages_body_check;
alter table public.internal_messages
  add constraint internal_messages_content_check check (
    (body is not null and char_length(trim(body)) between 1 and 4000)
    or attachment_path is not null
  ),
  add constraint internal_messages_attachment_size_check check (
    attachment_size is null or attachment_size between 1 and 10485760
  );

create index if not exists internal_messages_org_channel_created_idx
  on public.internal_messages (organization_id, channel_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'internal-message-files',
  'internal-message-files',
  false,
  10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "message_attachments_select" on storage.objects;
create policy "message_attachments_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'internal-message-files'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active
  )
  and exists (
    select 1 from public.message_channels channel
    where channel.organization_id::text = (storage.foldername(name))[1]
      and channel.id::text = (storage.foldername(name))[2]
      and (
        not channel.is_private
        or exists (
          select 1 from public.message_channel_members channel_member
          where channel_member.channel_id = channel.id
            and channel_member.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "message_attachments_insert" on storage.objects;
create policy "message_attachments_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'internal-message-files'
  and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id::text = (storage.foldername(name))[1]
      and membership.user_id = (select auth.uid())
      and membership.is_active
  )
  and exists (
    select 1 from public.message_channels channel
    where channel.organization_id::text = (storage.foldername(name))[1]
      and channel.id::text = (storage.foldername(name))[2]
      and (
        not channel.is_private
        or exists (
          select 1 from public.message_channel_members channel_member
          where channel_member.channel_id = channel.id
            and channel_member.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "message_attachments_delete_own" on storage.objects;
create policy "message_attachments_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'internal-message-files'
  and owner_id = (select auth.uid())::text
);
