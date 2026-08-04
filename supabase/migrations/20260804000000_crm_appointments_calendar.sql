-- CRM Takvimi: satış temsilcilerinin randevu/not sistemi.
-- Görünürlük: owner/admin/manager tüm kurumdaki randevuları görür,
-- diğer kullanıcılar yalnızca kendi hr_employees kaydına bağlı randevuları görür.

create table if not exists public.crm_appointments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 160),
  contact_name text,
  contact_phone text,
  note text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_appointments_org_start_idx on public.crm_appointments (organization_id, starts_at);
create index if not exists crm_appointments_employee_start_idx on public.crm_appointments (employee_id, starts_at);

alter table public.crm_appointments enable row level security;
grant select, insert, update, delete on public.crm_appointments to authenticated;

drop policy if exists "members_can_read_own_or_managed_appointments" on public.crm_appointments;
create policy "members_can_read_own_or_managed_appointments" on public.crm_appointments for select to authenticated using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_appointments.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  )
  or exists (
    select 1 from public.hr_employees e
    where e.id = crm_appointments.employee_id
      and e.user_id = (select auth.uid())
  )
);

drop policy if exists "members_can_create_appointments" on public.crm_appointments;
create policy "members_can_create_appointments" on public.crm_appointments for insert to authenticated with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_appointments.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
  )
  and (
    exists (
      select 1 from public.organization_memberships m2
      where m2.organization_id = crm_appointments.organization_id
        and m2.user_id = (select auth.uid())
        and m2.is_active = true
        and m2.role in ('owner','admin','manager')
    )
    or exists (
      select 1 from public.hr_employees e
      where e.id = crm_appointments.employee_id
        and e.user_id = (select auth.uid())
    )
  )
);

drop policy if exists "owners_and_managers_can_update_appointments" on public.crm_appointments;
create policy "owners_and_managers_can_update_appointments" on public.crm_appointments for update to authenticated using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_appointments.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  )
  or exists (
    select 1 from public.hr_employees e
    where e.id = crm_appointments.employee_id
      and e.user_id = (select auth.uid())
  )
) with check (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_appointments.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  )
  or exists (
    select 1 from public.hr_employees e
    where e.id = crm_appointments.employee_id
      and e.user_id = (select auth.uid())
  )
);

drop policy if exists "owners_and_managers_can_delete_appointments" on public.crm_appointments;
create policy "owners_and_managers_can_delete_appointments" on public.crm_appointments for delete to authenticated using (
  exists (
    select 1 from public.organization_memberships m
    where m.organization_id = crm_appointments.organization_id
      and m.user_id = (select auth.uid())
      and m.is_active = true
      and m.role in ('owner','admin','manager')
  )
  or exists (
    select 1 from public.hr_employees e
    where e.id = crm_appointments.employee_id
      and e.user_id = (select auth.uid())
  )
);
