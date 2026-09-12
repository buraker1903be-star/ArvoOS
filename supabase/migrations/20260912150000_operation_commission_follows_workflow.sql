-- Operasyon primi artık işin durumunu izliyor.
--
-- Sorun: prim yalnızca iş "Tamamlandı"ya geçerken yazılıyordu ve iş sonra
-- başka bir duruma (ör. "İptal") çekilse bile "hak edildi" olarak kalıp
-- toplamlarda ve "Bekleyen Ödeme"de sayılıyordu. Yeniden tamamlanan işte de
-- (workflow_id benzersiz, ON CONFLICT DO NOTHING) prim hiç güncellenmiyordu.
--
-- Yeni davranış:
--  * İş tamamlandı'dan çıkınca hak edilmiş/onaylanmış prim iptal edilir.
--    Ödenmiş prime dokunulmaz (para çıkmış; yönetici ayrıca ele alır).
--  * İş yeniden tamamlanınca iptal edilmiş kayıt güncel sorumlu, oran ve
--    sözleşme tutarıyla yeniden "hak edildi" olur. Onaylanmış/ödenmiş kayıt
--    değiştirilmez.
--  * Şu an tamamlanmamış işlere ait hak edilmiş/onaylanmış primler iptal
--    edilir (sonuç raporu dosyanın sonunda).

create or replace function public.accrue_operation_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  employee_rate numeric(5,2);
  contract_amount bigint := 0;
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.assigned_employee_id is not null then
    select operation_commission_rate into employee_rate from public.hr_employees
      where id = new.assigned_employee_id and organization_id = new.organization_id
        and employment_status = 'active';
    if coalesce(employee_rate, 0) > 0 then
      if new.contract_id is not null then
        select coalesce(amount, 0) into contract_amount from public.crm_contracts
          where id = new.contract_id and organization_id = new.organization_id;
      end if;
      insert into public.hr_operation_commissions(
        organization_id, employee_id, workflow_id, contract_id,
        base_amount, commission_rate, commission_amount
      ) values (
        new.organization_id, new.assigned_employee_id, new.id, new.contract_id,
        coalesce(contract_amount, 0), employee_rate,
        round(coalesce(contract_amount, 0) * employee_rate / 100.0)
      )
      on conflict (workflow_id) do update set
        employee_id = excluded.employee_id,
        contract_id = excluded.contract_id,
        base_amount = excluded.base_amount,
        commission_rate = excluded.commission_rate,
        commission_amount = excluded.commission_amount,
        status = 'accrued',
        accrued_at = now(),
        approved_at = null,
        paid_at = null
      where public.hr_operation_commissions.status = 'cancelled';
    end if;
  elsif old.status = 'completed' and new.status is distinct from 'completed' then
    update public.hr_operation_commissions
    set status = 'cancelled'
    where workflow_id = new.id
      and status in ('accrued', 'approved');
  end if;
  return new;
end $$;

revoke all on function public.accrue_operation_commission() from public, anon, authenticated;

-- Tamamlanmamış işlere ait açık primleri iptal et ve raporla.
with cancelled as (
  update public.hr_operation_commissions c
  set status = 'cancelled'
  from public.operation_workflows w
  where w.id = c.workflow_id
    and w.status is distinct from 'completed'
    and c.status in ('accrued', 'approved')
  returning c.workflow_id, c.employee_id, c.commission_amount
)
select w.title as is, e.full_name as personel, w.status as is_durumu,
       x.commission_amount / 100.0 as iptal_edilen_prim_tl
from cancelled x
join public.operation_workflows w on w.id = x.workflow_id
join public.hr_employees e on e.id = x.employee_id
order by e.full_name, w.title;
