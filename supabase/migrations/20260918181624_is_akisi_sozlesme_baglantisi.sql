-- ============================================================
-- İş akışının sözleşme bağlantısı yalnızca imzayla kurulur
--
-- operation_workflows.contract_id iki şeyi belirliyor:
--  - accrue_operation_commission: iş tamamlanınca operasyon primi
--    crm_contracts.amount × çalışanın oranı üzerinden tahakkuk eder;
--  - sync_contract_status_from_workflow: iş tamamlanınca bağlı sözleşme
--    'completed' olur.
--
-- Güncelleme politikası (members_update_assigned_operation_workflows) işin
-- sorumlusuna satırın tamamını açıyor, contract_id dahil. Sorumlu çalışan
-- veritabanı API'sinden contract_id'yi kurumdaki en yüksek bedelli
-- sözleşmeye çevirip işi tamamlayarak o bedel üzerinden prim
-- yazdırabiliyor ve başka bir müşterinin sözleşmesini "tamamlandı"
-- yapabiliyordu. Ekleme politikası da kendine atanmış, istediği sözleşmeye
-- bağlı yeni bir iş oluşturmaya izin veriyordu.
--
-- Meşru yazan tek yol sign_crm_contract (security definer): müşteri imza
-- attığında işi sözleşmeye bağlı oluşturur. Uygulama contract_id'yi hiçbir
-- yerde yazmıyor (app/panel/operations/actions.ts). Bu yüzden istemci
-- rolleri ('authenticated', 'anon') için alan tamamen kapalı; servis
-- anahtarı ve SQL Editor etkilenmez. Fonksiyon bu nedenle security INVOKER.
-- ============================================================

create or replace function private.arvo_guard_workflow_contract_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.contract_id is not null then
      raise exception 'İş, sözleşmeye yalnızca müşteri imzasıyla bağlanır.'
        using errcode = 'insufficient_privilege';
    end if;
  elsif new.contract_id is distinct from old.contract_id then
    raise exception 'İşin bağlı olduğu sözleşme değiştirilemez.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$$;
revoke all on function private.arvo_guard_workflow_contract_link() from public, anon;

drop trigger if exists arvo_guard_workflow_contract_link on public.operation_workflows;
create trigger arvo_guard_workflow_contract_link
  before insert or update of contract_id on public.operation_workflows
  for each row execute function private.arvo_guard_workflow_contract_link();

-- Geri almak için:
-- drop trigger if exists arvo_guard_workflow_contract_link on public.operation_workflows;
-- drop function if exists private.arvo_guard_workflow_contract_link();
