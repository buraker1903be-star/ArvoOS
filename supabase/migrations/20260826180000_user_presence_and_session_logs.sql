create table public.user_presence (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  last_seen_at timestamptz not null default now(),
  current_path text,
  user_agent text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.user_session_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid references public.hr_employees(id) on delete set null,
  login_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  logout_at timestamptz,
  logout_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint user_session_logout_reason_check check (logout_reason is null or logout_reason in ('manual','timeout','workspace_switch'))
);
create index user_presence_online_idx on public.user_presence (organization_id,last_seen_at desc);
create index user_session_logs_org_login_idx on public.user_session_logs (organization_id,login_at desc);
create index user_session_logs_user_open_idx on public.user_session_logs (user_id,logout_at,last_seen_at desc);
alter table public.user_presence enable row level security;
alter table public.user_session_logs enable row level security;
grant select,insert,update on public.user_presence to authenticated;
grant select,insert,update on public.user_session_logs to authenticated;
revoke all on public.user_presence from anon;
revoke all on public.user_session_logs from anon;
create policy "presence_select_own_or_manager" on public.user_presence for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.organization_memberships viewer where viewer.organization_id=user_presence.organization_id and viewer.user_id=(select auth.uid()) and viewer.is_active=true and viewer.role::text in ('owner','admin','manager')));
create policy "presence_insert_own" on public.user_presence for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.organization_memberships own_membership where own_membership.organization_id=user_presence.organization_id and own_membership.user_id=(select auth.uid()) and own_membership.is_active=true));
create policy "presence_update_own" on public.user_presence for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()) and exists(select 1 from public.organization_memberships own_membership where own_membership.organization_id=user_presence.organization_id and own_membership.user_id=(select auth.uid()) and own_membership.is_active=true));
create policy "session_logs_select_own_or_manager" on public.user_session_logs for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.organization_memberships viewer where viewer.organization_id=user_session_logs.organization_id and viewer.user_id=(select auth.uid()) and viewer.is_active=true and viewer.role::text in ('owner','admin','manager')));
create policy "session_logs_insert_own" on public.user_session_logs for insert to authenticated with check (user_id=(select auth.uid()) and exists(select 1 from public.organization_memberships own_membership where own_membership.organization_id=user_session_logs.organization_id and own_membership.user_id=(select auth.uid()) and own_membership.is_active=true));
create policy "session_logs_update_own" on public.user_session_logs for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
