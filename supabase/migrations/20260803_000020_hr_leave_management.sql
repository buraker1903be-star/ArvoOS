create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  leave_type text not null check (leave_type in ('annual','excuse','sick','unpaid','other')),
  start_date date not null,
  end_date date not null,
  total_days integer not null check (total_days > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists hr_leave_requests_org_status_idx on public.hr_leave_requests(organization_id,status,start_date);
create index if not exists hr_leave_requests_employee_idx on public.hr_leave_requests(employee_id,start_date);

alter table public.hr_leave_requests enable row level security;
create policy "members read hr leave requests" on public.hr_leave_requests for select to authenticated using(public.arvo_is_member(organization_id));
create policy "members create hr leave requests" on public.hr_leave_requests for insert to authenticated with check(public.arvo_is_member(organization_id));
create policy "members update hr leave requests" on public.hr_leave_requests for update to authenticated using(public.arvo_is_member(organization_id)) with check(public.arvo_is_member(organization_id));
