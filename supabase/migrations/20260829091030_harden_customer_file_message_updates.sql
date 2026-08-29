revoke update on table public.customer_file_messages from authenticated;
grant update (read_at) on table public.customer_file_messages to authenticated;

create index if not exists customer_file_messages_organization_idx
  on public.customer_file_messages(organization_id);
create index if not exists customer_file_messages_sender_user_idx
  on public.customer_file_messages(sender_user_id)
  where sender_user_id is not null;
