-- Onaylanmış teklif ve imzalanmış sözleşme ticari olarak dondurulur.
--
-- Neden veritabanında:
--   Panelde "Düzenle" butonu zaten gizleniyor ama bu koruma değil —
--   arayüzü gizlemek isteği engellemiyor. update_crm_proposal RPC'sinde
--   de durum kontrolü yok. Müşterinin onayladığı tutarın sonradan
--   değişebilmesi, belgenin delil değerini tamamen ortadan kaldırır.
--
-- Ne donuyor: yalnızca müşterinin gördüğü ticari içerik.
-- Ne donmuyor: durum geçişleri, paylaşım token'ı, görüntülenme sayacı,
--   arşiv alanları, imza kayıtları, iç maliyet takibi. Bunlar belgenin
--   içeriğini değiştirmiyor, süreci yönetiyor.

-- ---------------------------------------------------------------
-- TEKLİF
-- ---------------------------------------------------------------
create or replace function private.arvo_freeze_accepted_proposal()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.status <> 'accepted' then
    return new;
  end if;

  if new.amount        is distinct from old.amount
  or new.net_amount    is distinct from old.net_amount
  or new.tax_amount    is distinct from old.tax_amount
  or new.gross_amount  is distinct from old.gross_amount
  or new.tax_rate      is distinct from old.tax_rate
  or new.tax_status    is distinct from old.tax_status
  or new.currency      is distinct from old.currency
  or new.title         is distinct from old.title
  or new.scope         is distinct from old.scope
  or new.payment_plan       is distinct from old.payment_plan
  or new.payment_plan_type  is distinct from old.payment_plan_type
  or new.payment_schedule   is distinct from old.payment_schedule
  or new.valid_until   is distinct from old.valid_until
  or new.estimated_delivery_date is distinct from old.estimated_delivery_date
  then
    raise exception
      'Bu teklif müşteri tarafından onaylandı; tutar ve içeriği değiştirilemez. Değişiklik gerekiyorsa yeni bir teklif oluşturun.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$;

drop trigger if exists arvo_freeze_accepted_proposal on public.crm_proposals;
create trigger arvo_freeze_accepted_proposal
  before update on public.crm_proposals
  for each row execute function private.arvo_freeze_accepted_proposal();

-- ---------------------------------------------------------------
-- SÖZLEŞME
-- ---------------------------------------------------------------
create or replace function private.arvo_freeze_signed_contract()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.status not in ('signed', 'completed') then
    return new;
  end if;

  if new.amount   is distinct from old.amount
  or new.currency is distinct from old.currency
  or new.title    is distinct from old.title
  or new.scope    is distinct from old.scope
  or new.payment_plan      is distinct from old.payment_plan
  or new.payment_plan_type is distinct from old.payment_plan_type
  or new.payment_schedule  is distinct from old.payment_schedule
  or new.start_date is distinct from old.start_date
  or new.due_date   is distinct from old.due_date
  or new.customer_address    is distinct from old.customer_address
  or new.customer_tax_number is distinct from old.customer_tax_number
  or new.customer_tax_office is distinct from old.customer_tax_office
  then
    raise exception
      'Bu sözleşme imzalandı; tutar ve içeriği değiştirilemez.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$;

drop trigger if exists arvo_freeze_signed_contract on public.crm_contracts;
create trigger arvo_freeze_signed_contract
  before update on public.crm_contracts
  for each row execute function private.arvo_freeze_signed_contract();
