create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  subject text not null check (char_length(subject) between 3 and 180),
  category text not null default 'general' check (category in ('general','technical','billing','feature')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','waiting_customer','resolved','closed')),
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(body) between 1 and 5000),
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_messages to authenticated;

create policy "members_read_own_support_tickets" on public.support_tickets for select to authenticated using (
  (select private.is_arvoos_founder()) or exists (
    select 1 from public.organization_memberships m
    where m.organization_id = support_tickets.organization_id and m.user_id = (select auth.uid()) and m.is_active
  )
);
create policy "members_create_support_tickets" on public.support_tickets for insert to authenticated with check (
  created_by = (select auth.uid()) and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = support_tickets.organization_id and m.user_id = (select auth.uid()) and m.is_active
  )
);
create policy "founder_updates_support_tickets" on public.support_tickets for update to authenticated using ((select private.is_arvoos_founder())) with check ((select private.is_arvoos_founder()));

create policy "members_read_own_support_messages" on public.support_messages for select to authenticated using (
  (select private.is_arvoos_founder()) or exists (
    select 1 from public.organization_memberships m
    where m.organization_id = support_messages.organization_id and m.user_id = (select auth.uid()) and m.is_active
  )
);
create policy "members_create_support_messages" on public.support_messages for insert to authenticated with check (
  author_id = (select auth.uid()) and (
    ((select private.is_arvoos_founder()) and is_staff = true)
    or (is_staff = false and exists (
      select 1 from public.organization_memberships m
      where m.organization_id = support_messages.organization_id and m.user_id = (select auth.uid()) and m.is_active
    ))
  )
);

create or replace function private.touch_support_ticket() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.support_tickets set last_message_at = new.created_at, updated_at = now(),
    status = case when new.is_staff then 'waiting_customer' else case when status in ('resolved','closed') then 'open' else status end end
  where id = new.ticket_id;
  insert into public.notifications (organization_id,audience,category,title,message,action_url,metadata)
  values (
    new.organization_id,
    case when new.is_staff then 'organization' else 'founder' end,
    'support_message',
    case when new.is_staff then 'Destek ekibinden yanıt' else 'Yeni destek mesajı' end,
    case when new.is_staff then 'Destek talebinize yeni bir yanıt eklendi.' else 'Bir kurum destek talebine yeni mesaj ekledi.' end,
    '/panel/support',
    jsonb_build_object('ticket_id',new.ticket_id,'message_id',new.id)
  );
  return new;
end;
$$;
revoke all on function private.touch_support_ticket() from public, anon, authenticated;
drop trigger if exists touch_support_ticket on public.support_messages;
create trigger touch_support_ticket after insert on public.support_messages for each row execute function private.touch_support_ticket();

insert into public.arvo_modules (code,name,description,sort_order,is_active)
values ('support','Destek Merkezi','Destek talepleri ve çözüm takibi',90,true)
on conflict (code) do update set name=excluded.name,description=excluded.description,is_active=true;
insert into public.organization_modules (organization_id,module_code,is_enabled)
select id,'support',true from public.organizations
on conflict (organization_id,module_code) do update set is_enabled=true;

create index if not exists support_tickets_org_status_idx on public.support_tickets(organization_id,status,last_message_at desc);
create index if not exists support_messages_ticket_idx on public.support_messages(ticket_id,created_at);