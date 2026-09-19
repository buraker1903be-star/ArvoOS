-- ============================================================
-- ACİL: müşteri teklif onayı düşüyordu (19.09.2026)
--
-- 20260918180436_teklif_kabul_dondurma.sql iki fazla kural getirdi:
--  1. responded_at'i kabul edilmiş teklifin "içerik" alanlarına ekledi.
--     private.arvo_confirm_proposal (müşterinin onay adımı) kabulden sonra
--     responded_at'i yazıyor → "Bu teklif müşteri tarafından onaylandı;
--     tutar ve içeriği değiştirilemez" (23514) ve sayfa "This page couldn't
--     load" veriyordu. Müşteri teklifi onaylayamıyordu.
--  2. Kabulden çıkışı herkese kapattı. Oysa müşteri, sözleşme imzalanmadıysa
--     kabul ettiği teklifi reddedebiliyor (aynı fonksiyon; sözleşmeyi iptal
--     eder). Bu yol da kapanmıştı.
--
-- Düzeltme: yanıt zamanı içerik değildir (listeden çıktı). Kabulden çıkış
-- yalnızca istemci rollerine (authenticated/anon, yani panel ve doğrudan
-- API) kapalı; müşteri akışı security definer fonksiyonlardan geçtiği için
-- serbest. Tutar/içerik dondurması herkes için aynen sürüyor; kabulü ve yanıt
-- kanıtını istemcinin yazamaması da sürüyor.
-- ============================================================

create or replace function private.arvo_freeze_accepted_proposal()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $function$
declare
  was_accepted boolean := old.status = 'accepted'
    or (old.status = 'archived' and old.archive_reason = 'accepted');
  is_accepted boolean := new.status = 'accepted'
    or (new.status = 'archived' and new.archive_reason = 'accepted');
  from_client boolean := current_user in ('authenticated', 'anon');
begin
  if from_client and not was_accepted and is_accepted then
    raise exception 'Teklif yalnızca müşteri yanıtıyla kabul edilir.'
      using errcode = 'insufficient_privilege';
  end if;

  if from_client and (
       new.response_ip           is distinct from old.response_ip
    or new.response_user_agent   is distinct from old.response_user_agent
    or new.customer_responded_at is distinct from old.customer_responded_at
  ) then
    raise exception 'Müşteri yanıtı bilgileri yalnızca müşteri yanıtıyla değişir.'
      using errcode = 'insufficient_privilege';
  end if;

  if not was_accepted then
    return new;
  end if;

  if from_client and not is_accepted then
    raise exception
      'Bu teklif müşteri tarafından onaylandı; durumu geri alınamaz. Değişiklik gerekiyorsa yeni bir teklif oluşturun.'
      using errcode = 'check_violation';
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
revoke all on function private.arvo_freeze_accepted_proposal() from public, anon;
