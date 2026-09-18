-- ============================================================
-- Satış fırsatının temsilcisini yalnızca yönetici rolleri değiştirir
--
-- Satış primi crm_opportunities.assigned_employee_id'den okunuyor:
-- collect_payment_installment her tahsilatta bu çalışanın commission_rate'i
-- ile prim yazıyor.
--
-- Güncelleme politikası (members_update_assigned_crm_opportunities):
--   using      → private.arvo_can_access_opportunity(id)
--   with check → yönetici rolü YA DA yeni temsilci çağıranın kendisi
--
-- arvo_can_access_opportunity, fırsatın sözleşmesine bağlı işin operasyon
-- sorumlusuna da erişim veriyor. Bu ikisi birleşince operasyon çalışanı
-- veritabanı API'sinden fırsatı kendine atayabiliyordu; o andan sonraki
-- bütün tahsilatların satış primi satış temsilcisi yerine ona yazılıyordu.
--
-- Uygulamada atama yalnızca owner/admin/manager ile yapılıyor
-- (app/panel/crm/actions.ts canAssign, assignOpportunity; sales-shared.ts
-- ensureRepresentative yalnızca temsilcisi OLMAYAN fırsata atar ve
-- yönetici olmayan kullanıcı temsilcisiz fırsatı zaten göremez).
-- Kural bu yüzden: yönetici rolü dışındaki istemci, temsilciyi ve fırsat
-- sahibini (owner_user_id) değiştiremez. Yeni fırsat ekleme değişmiyor
-- (politika yönetici olmayana yalnızca kendine atamaya izin veriyor).
-- Servis anahtarı ve security definer fonksiyonlar etkilenmez; bu yüzden
-- fonksiyon security INVOKER.
-- ============================================================

create or replace function private.arvo_guard_opportunity_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if (new.assigned_employee_id is distinct from old.assigned_employee_id
      or new.owner_user_id is distinct from old.owner_user_id)
     and not private.arvo_is_privileged_member(old.organization_id) then
    raise exception 'Satış temsilcisini yalnızca yöneticiler değiştirebilir.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$$;
revoke all on function private.arvo_guard_opportunity_assignment() from public, anon;

drop trigger if exists arvo_guard_opportunity_assignment on public.crm_opportunities;
create trigger arvo_guard_opportunity_assignment
  before update of assigned_employee_id, owner_user_id on public.crm_opportunities
  for each row execute function private.arvo_guard_opportunity_assignment();

-- Geri almak için:
-- drop trigger if exists arvo_guard_opportunity_assignment on public.crm_opportunities;
-- drop function if exists private.arvo_guard_opportunity_assignment();
