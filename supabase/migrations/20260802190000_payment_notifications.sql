create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  audience text not null check (audience in ('organization','founder')),
  category text not null,
  title text not null,
  message text not null,
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;

create policy "members_read_own_notifications"
on public.notifications for select to authenticated
using (
  (audience = 'organization' and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = notifications.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  ))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
);

create policy "members_mark_own_notifications_read"
on public.notifications for update to authenticated
using (
  (audience = 'organization' and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = notifications.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  ))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
)
with check (
  (audience = 'organization' and exists (
    select 1 from public.organization_memberships membership
    where membership.organization_id = notifications.organization_id
      and membership.user_id = (select auth.uid())
      and membership.is_active = true
  ))
  or (audience = 'founder' and (select private.is_arvoos_founder()))
);

create or replace function private.notify_payment_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare organization_name text;
begin
  select name into organization_name from public.organizations where id = new.organization_id;
  insert into public.notifications (organization_id, audience, category, title, message, action_url, metadata)
  values (
    new.organization_id,
    'founder',
    'payment_submitted',
    'Yeni ödeme bildirimi',
    coalesce(organization_name, 'Bir kurum') || ' EFT/Havale dekontu gönderdi.',
    '/panel/platform/payments',
    jsonb_build_object('payment_id', new.id, 'amount', new.amount, 'currency', new.currency, 'plan_code', new.plan_code)
  );
  return new;
end;
$$;

revoke all on function private.notify_payment_request_created() from public;
revoke all on function private.notify_payment_request_created() from anon;
revoke all on function private.notify_payment_request_created() from authenticated;

drop trigger if exists notify_payment_request_created on public.organization_payment_requests;
create trigger notify_payment_request_created
after insert on public.organization_payment_requests
for each row execute function private.notify_payment_request_created();

create or replace function private.notify_payment_request_reviewed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = new.status or new.status not in ('approved','rejected') then return new; end if;
  insert into public.notifications (organization_id, audience, category, title, message, action_url, metadata)
  values (
    new.organization_id,
    'organization',
    case when new.status = 'approved' then 'payment_approved' else 'payment_rejected' end,
    case when new.status = 'approved' then 'Ödemeniz onaylandı' else 'Ödemeniz reddedildi' end,
    case when new.status = 'approved'
      then 'EFT/Havale ödemeniz onaylandı ve lisansınız aktif edildi.'
      else 'EFT/Havale ödemeniz reddedildi. Açıklama: ' || coalesce(new.review_note, 'Belirtilmedi')
    end,
    '/panel/billing',
    jsonb_build_object('payment_id', new.id, 'status', new.status, 'review_note', new.review_note)
  );
  return new;
end;
$$;

revoke all on function private.notify_payment_request_reviewed() from public;
revoke all on function private.notify_payment_request_reviewed() from anon;
revoke all on function private.notify_payment_request_reviewed() from authenticated;

drop trigger if exists notify_payment_request_reviewed on public.organization_payment_requests;
create trigger notify_payment_request_reviewed
after update of status on public.organization_payment_requests
for each row execute function private.notify_payment_request_reviewed();

create index if not exists notifications_org_created_idx on public.notifications(organization_id, created_at desc);
create index if not exists notifications_founder_created_idx on public.notifications(audience, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(read_at, created_at desc) where read_at is null;