-- Prim oranı geçmişi: satış primi, tahsilat tarihinde geçerli olan oranla.
--
-- Sorun: prim sayfası satış primini satışçının BUGÜNKÜ oranıyla
-- hesaplıyordu. Oranı %5'ten %8'e çıkarılan satışçının geçmiş aylardaki
-- tahsilatları da %8'den yeniden hesaplanıyor, ödenmiş dönemlerin rakamları
-- değişiyordu.
--
-- Çözüm: hr_employees'te oran her değiştiğinde yeni oran ve geçerlilik anı
-- hr_employee_commission_rates'e yazılır. Prim sayfası her tahsilata o
-- tarihte geçerli oranı uygular. Mevcut oranlar "başlangıçtan beri geçerli"
-- (-infinity) kaydedilir; bugünkü rakamlar değişmez, yalnızca bundan sonraki
-- oran değişiklikleri geçmişi etkilemez olur.
-- (Operasyon primi zaten tahakkuk anındaki oranı hr_operation_commissions'ta
-- saklıyor; operation_commission_rate burada kayıt bütünlüğü için tutulur.)

create table if not exists public.hr_employee_commission_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.hr_employees(id) on delete cascade,
  commission_rate numeric(5,2) not null default 0,
  operation_commission_rate numeric(5,2) not null default 0,
  valid_from timestamptz not null default now(),
  changed_by uuid
);

create index if not exists hr_employee_commission_rates_employee_idx
  on public.hr_employee_commission_rates (employee_id, valid_from desc);

alter table public.hr_employee_commission_rates enable row level security;
revoke all on public.hr_employee_commission_rates from public, anon;
grant select on public.hr_employee_commission_rates to authenticated;

drop policy if exists "privileged members read commission rate history" on public.hr_employee_commission_rates;
create policy "privileged members read commission rate history"
on public.hr_employee_commission_rates for select to authenticated
using (private.arvo_is_privileged_member(organization_id));

create or replace function private.arvo_record_commission_rate()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'INSERT'
     or new.commission_rate is distinct from old.commission_rate
     or new.operation_commission_rate is distinct from old.operation_commission_rate then
    insert into public.hr_employee_commission_rates
      (organization_id, employee_id, commission_rate, operation_commission_rate, valid_from, changed_by)
    values (
      new.organization_id,
      new.id,
      coalesce(new.commission_rate, 0)::numeric(5,2),
      coalesce(new.operation_commission_rate, 0)::numeric(5,2),
      case when tg_op = 'INSERT' then '-infinity'::timestamptz else now() end,
      auth.uid()
    );
  end if;
  return null;
end
$function$;

revoke all on function private.arvo_record_commission_rate() from public;

drop trigger if exists arvo_record_commission_rate on public.hr_employees;
create trigger arvo_record_commission_rate
  after insert or update of commission_rate, operation_commission_rate on public.hr_employees
  for each row execute function private.arvo_record_commission_rate();

-- Mevcut oranları başlangıçtan beri geçerli olarak kaydet.
insert into public.hr_employee_commission_rates
  (organization_id, employee_id, commission_rate, operation_commission_rate, valid_from)
select e.organization_id, e.id,
       coalesce(e.commission_rate, 0)::numeric(5,2),
       coalesce(e.operation_commission_rate, 0)::numeric(5,2),
       '-infinity'::timestamptz
from public.hr_employees e
where not exists (
  select 1 from public.hr_employee_commission_rates r where r.employee_id = e.id
);
