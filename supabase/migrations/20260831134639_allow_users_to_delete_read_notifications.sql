create table if not exists public.notification_user_dismissals (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

alter table public.notification_user_dismissals enable row level security;
revoke all on public.notification_user_dismissals from public, anon;
grant select, insert on public.notification_user_dismissals to authenticated;

create policy "users read own notification dismissals"
on public.notification_user_dismissals for select to authenticated
using (user_id = (select auth.uid()));

create policy "users dismiss own notifications"
on public.notification_user_dismissals for insert to authenticated
with check (user_id = (select auth.uid()));

create index if not exists notification_user_dismissals_user_idx
  on public.notification_user_dismissals (user_id, dismissed_at desc);
