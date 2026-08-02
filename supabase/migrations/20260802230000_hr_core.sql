create table if not exists public.hr_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  code text,
  manager_employee_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,name),
  unique (id,organization_id)
);

create table if not exists public.hr_employees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  department_id uuid,
  employee_no text,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  email text,
  phone text,
  position_title text,
  employment_type text not null default 'full_time' check (employment_type in ('full_time','part_time','contractor','intern')),
  employment_status text not null default 'active' check (employment_status in ('active','on_leave','terminated')),
  hire_date date,
  termination_date date,
  annual_leave_days numeric(6,2) not null default 14 check (annual_leave_days >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,employee_no),
  unique (id,organization_id),
  constraint hr_employees_department_org_fk foreign key (department_id,organization_id)
    references public.hr_departments(id,organization_id) on delete no action,
  check (termination_date is null or hire_date is null or termination_date >= hire_date)
);

create unique index if not exists hr_employees_org_user_uidx
  on public.hr_employees(organization_id,user_id)
  where user_id is not null;

alter table public.hr_departments add constraint hr_departments_manager_org_fk
  foreign key (manager_employee_id,organization_id)
  references public.hr_employees(id,organization_id) on delete no action;

create table if not exists public.hr_leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  leave_type text not null default 'annual' check (leave_type in ('annual','sick','unpaid','parental','other')),
  start_date date not null,
  end_date date not null,
  total_days numeric(6,2) not null check (total_days > 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','canceled')),
  reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_leave_employee_org_fk foreign key (employee_id,organization_id)
    references public.hr_employees(id,organization_id) on delete cascade,
  check (end_date >= start_date)
);

create table if not exists public.hr_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null,
  review_period text not null,
  score numeric(5,2) check (score between 0 and 100),
  strengths text,
  improvements text,
  goals text,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_review_employee_org_fk foreign key (employee_id,organization_id)
    references public.hr_employees(id,organization_id) on delete cascade
);

alter table public.hr_departments enable row level security;
alter table public.hr_employees enable row level security;
alter table public.hr_leave_requests enable row level security;
alter table public.hr_performance_reviews enable row level security;
grant select,insert,update on public.hr_departments,public.hr_employees,public.hr_leave_requests,public.hr_performance_reviews to authenticated;

create policy "members_read_hr_departments" on public.hr_departments for select to authenticated using (exists(select 1 from public.organization_memberships m where m.organization_id=hr_departments.organization_id and m.user_id=(select auth.uid()) and m.is_active));
create policy "admins_manage_hr_departments" on public.hr_departments for all to authenticated using (exists(select 1 from public.organization_memberships m where m.organization_id=hr_departments.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))) with check (exists(select 1 from public.organization_memberships m where m.organization_id=hr_departments.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')));
create policy "admins_or_self_read_hr_employees" on public.hr_employees for select to authenticated using (user_id=(select auth.uid()) or exists(select 1 from public.organization_memberships m where m.organization_id=hr_employees.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')));
create policy "admins_manage_hr_employees" on public.hr_employees for all to authenticated using (exists(select 1 from public.organization_memberships m where m.organization_id=hr_employees.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))) with check (exists(select 1 from public.organization_memberships m where m.organization_id=hr_employees.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')));
create policy "admins_or_self_read_hr_leave" on public.hr_leave_requests for select to authenticated using (exists(select 1 from public.hr_employees e where e.id=hr_leave_requests.employee_id and e.organization_id=hr_leave_requests.organization_id and e.user_id=(select auth.uid())) or exists(select 1 from public.organization_memberships m where m.organization_id=hr_leave_requests.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')));
create policy "members_create_own_hr_leave" on public.hr_leave_requests for insert to authenticated with check (created_by=(select auth.uid()) and exists(select 1 from public.hr_employees e where e.id=hr_leave_requests.employee_id and e.organization_id=hr_leave_requests.organization_id and e.user_id=(select auth.uid()) and e.employment_status in ('active','on_leave')));
create policy "admins_manage_hr_leave" on public.hr_leave_requests for update to authenticated using (exists(select 1 from public.organization_memberships m where m.organization_id=hr_leave_requests.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))) with check (exists(select 1 from public.organization_memberships m where m.organization_id=hr_leave_requests.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')));
create policy "admins_or_self_read_hr_reviews" on public.hr_performance_reviews for select to authenticated using (exists(select 1 from public.hr_employees e where e.id=hr_performance_reviews.employee_id and e.organization_id=hr_performance_reviews.organization_id and e.user_id=(select auth.uid())) or exists(select 1 from public.organization_memberships m where m.organization_id=hr_performance_reviews.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')));
create policy "admins_manage_hr_reviews" on public.hr_performance_reviews for all to authenticated using (exists(select 1 from public.organization_memberships m where m.organization_id=hr_performance_reviews.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin'))) with check (exists(select 1 from public.organization_memberships m where m.organization_id=hr_performance_reviews.organization_id and m.user_id=(select auth.uid()) and m.is_active and m.role in ('owner','admin')));

insert into public.arvo_modules(code,name,description,sort_order,is_active)
values('hr','İnsan Kaynakları','Personel, departman, izin ve performans yönetimi',60,true)
on conflict(code) do update set name=excluded.name,description=excluded.description,is_active=true;
insert into public.organization_modules(organization_id,module_code,is_enabled)
select id,'hr',true from public.organizations
on conflict(organization_id,module_code) do update set is_enabled=true;

create index if not exists hr_employees_org_status_idx on public.hr_employees(organization_id,employment_status,last_name,first_name);
create index if not exists hr_leave_org_status_idx on public.hr_leave_requests(organization_id,status,start_date);
create index if not exists hr_reviews_employee_idx on public.hr_performance_reviews(employee_id,created_at desc);