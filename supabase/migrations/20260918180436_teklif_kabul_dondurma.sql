-- ============================================================
-- Kabul edilmiş teklif gerçekten donduruluyor
--
-- arvo_freeze_accepted_proposal (20260904170000) "old.status = 'accepted'"
-- koşuluna bakıyordu. Ama kabul edilen teklif hiçbir zaman bu durumda
-- kaydedilmiyor: archive_inactive_crm_proposal tetikleyicisi (adı alfabede
-- önce geldiği için önce çalışır) 'accepted'ı status = 'archived',
-- archive_reason = 'accepted' olarak yazıyor. Sonuç: dondurma hiç devreye
-- girmiyordu. Kabul edilmiş teklifin tutarı, vergisi, ödeme planı
-- değiştirilebiliyor, teklif taslağa çekilebiliyordu.
--
-- Panelde bu kayıtlar okuma politikasında görünmediği için filtreli
-- (WHERE'li) güncelleme 0 satır etkiliyordu; ama filtresiz güncelleme ve
-- servis anahtarıyla çalışan her yol korumasızdı. PGlite'ta doğrulandı.
--
-- Yeni kural:
--  - "Kabul edilmiş" = status 'accepted' YA DA archived + archive_reason
--    'accepted'. İçerik alanları eskisi gibi donar; ayrıca durum ve arşiv
--    sebebi kabulden geri alınamaz. Revizyon (create_crm_proposal_revision)
--    yalnızca status = 'archived' ve superseded_* yazar; etkilenmez.
--  - Kabulü yalnızca müşteri yanıtı (respond_to_crm_proposal, security
--    definer) yazabilir: 'authenticated' ya da 'anon' rolüyle doğrudan
--    kabul edilmiş işaretlemek reddedilir. Müşteri yanıtının kanıt
--    alanları (response_ip, response_user_agent, customer_responded_at)
--    da aynı şekilde korunur.
--
-- Fonksiyon bu yüzden security INVOKER'a çevrildi: current_user çağıranı
-- göstermeli. Yalnızca NEW/OLD'a bakıyor, tabloya erişmiyor; definer
-- olmasının bir gereği yoktu.
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

  if not is_accepted then
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
  or new.responded_at  is distinct from old.responded_at
  then
    raise exception
      'Bu teklif müşteri tarafından onaylandı; tutar ve içeriği değiştirilemez. Değişiklik gerekiyorsa yeni bir teklif oluşturun.'
      using errcode = 'check_violation';
  end if;

  return new;
end
$function$;
revoke all on function private.arvo_freeze_accepted_proposal() from public, anon;

-- Tetikleyici aynı adla duruyor; yalnızca fonksiyon gövdesi değişti.
-- Sıra önemli ve korunuyor: archive_inactive_crm_proposal (a-r-c) önce,
-- arvo_freeze_accepted_proposal (a-r-v) sonra çalışır; bu fonksiyon
-- NEW'i arşiv dönüşümünden SONRA görür.

-- Geri almak için: 20260904170000_freeze_accepted_documents.sql içindeki
-- arvo_freeze_accepted_proposal tanımını yeniden çalıştırın.
