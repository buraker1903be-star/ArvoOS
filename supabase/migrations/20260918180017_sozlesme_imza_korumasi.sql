-- ============================================================
-- Sözleşme imzası yalnızca imza fonksiyonuyla atılabilir
--
-- crm_contracts'a sözleşmeye atanmış satış/operasyon personeli ve yönetici
-- rolleri doğrudan UPDATE yapabiliyor ("members update assigned contracts",
-- private.arvo_can_access_opportunity). Uygulama bunu adres/vergi bilgisi ve
-- ödeme planı için kullanıyor. Ama oturum jetonu tarayıcıda olduğu için aynı
-- yetkiyle veritabanı API'sinden şunlar da yapılabiliyordu:
--
--  - status = 'signed', signed_name/signed_at/signed_ip/signed_signature_data
--    doldurularak müşteri hiç imzalamadan sözleşme "imzalandı" gösterilebilir.
--    Bu alanlar hukuki kanıttır (imza görüntüsü, IP, onaylar).
--  - İmzalı sözleşme status = 'draft' yapılıp tutarı değiştirilebilir:
--    arvo_freeze_signed_contract yalnızca ESKİ durumu imzalıysa içeriği
--    donduruyor; durumu değiştiren güncelleme serbestti. İki adımda
--    (önce durum, sonra tutar) imzalı sözleşmenin bedeli değişiyordu.
--  - İmzalı sözleşmenin imza kanıtı alanları üzerine yazılabiliyordu.
--  - Taslak sözleşme doğrudan 'completed' yapılabiliyordu.
--
-- Meşru yollar etkilenmez:
--  - İmza: sign_crm_contract / sign_crm_contract_v2 / arvo_record_contract_
--    consents security definer — içlerinde current_user fonksiyon sahibidir,
--    'authenticated' ya da 'anon' değildir.
--  - Tamamlanma: sync_contract_status_from_workflow (invoker, AFTER UPDATE
--    on operation_workflows) — iş akışı 'completed' olduğunda çalışır; bu
--    kural o durumda 'completed'e izin veriyor.
--  - Uygulamanın durum işlemi (markContractStatus) yalnızca imzalanmamış
--    sözleşmeyi 'rejected'/'cancelled' yapar — serbest kalıyor.
--  - Servis anahtarı ve SQL Editor (service_role / postgres) kısıtlanmaz.
--
-- Koruma bu yüzden ÇAĞIRANIN ROLÜNE bakıyor; fonksiyon bilerek security
-- INVOKER. Definer olsaydı current_user her zaman sahibi olurdu.
-- ============================================================

-- İş akışının tamamlanıp tamamlanmadığı, çağıranın RLS görünürlüğünden
-- bağımsız okunmalı: operasyon çalışanı iş akışını görüyor ama bu kural
-- başka rollerden de tetiklenebiliyor.
create or replace function private.arvo_contract_workflow_completed(target_contract uuid, target_workflow uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.operation_workflows w
    where w.status::text = 'completed'
      and (w.contract_id = target_contract or w.id = target_workflow)
  );
$$;
revoke all on function private.arvo_contract_workflow_completed(uuid, uuid) from public, anon;
grant execute on function private.arvo_contract_workflow_completed(uuid, uuid) to authenticated, service_role;

create or replace function private.arvo_guard_contract_signature()
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
    if new.status in ('signed', 'completed')
    or new.signed_at is not null
    or new.signed_name is not null
    or new.signed_signature_data is not null
    or new.acceptance_recorded_at is not null then
      raise exception 'Sözleşme imzalı olarak oluşturulamaz.'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  -- İmza kanıtı yalnızca imza fonksiyonlarıyla yazılır.
  if new.signed_at             is distinct from old.signed_at
  or new.signed_name           is distinct from old.signed_name
  or new.signed_ip             is distinct from old.signed_ip
  or new.signed_user_agent     is distinct from old.signed_user_agent
  or new.signed_signature_data is distinct from old.signed_signature_data
  or new.signed_consents       is distinct from old.signed_consents
  or new.acceptance_recorded_at is distinct from old.acceptance_recorded_at
  or new.legal_text_version    is distinct from old.legal_text_version
  then
    raise exception 'İmza bilgileri yalnızca müşteri imzasıyla değişir.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status then
    if new.status = 'signed' then
      raise exception 'Sözleşme yalnızca müşteri imzasıyla imzalanır.'
        using errcode = 'insufficient_privilege';
    end if;

    if new.status = 'completed' then
      if not private.arvo_contract_workflow_completed(new.id, new.workflow_id) then
        raise exception 'Sözleşme, bağlı iş akışı tamamlanınca tamamlanır.'
          using errcode = 'insufficient_privilege';
      end if;
    elsif old.status in ('signed', 'completed') then
      raise exception 'İmzalanmış sözleşmenin durumu geri alınamaz.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end
$$;
revoke all on function private.arvo_guard_contract_signature() from public, anon;

drop trigger if exists arvo_guard_contract_signature on public.crm_contracts;
create trigger arvo_guard_contract_signature
  before insert or update on public.crm_contracts
  for each row execute function private.arvo_guard_contract_signature();

-- Geri almak için:
-- drop trigger if exists arvo_guard_contract_signature on public.crm_contracts;
-- drop function if exists private.arvo_guard_contract_signature();
-- drop function if exists private.arvo_contract_workflow_completed(uuid, uuid);
