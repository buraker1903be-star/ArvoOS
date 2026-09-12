-- Teklif ve sözleşme onaylarında eksiksiz elektronik işlem kaydı.
--
-- 1) Teklif kabul/ret kararında tarih ve IP zaten saklanıyordu
--    (responded_at, response_ip); cihaz/tarayıcı bilgisi yoktu.
--    crm_proposals.response_user_agent eklenir ve karar anında
--    arvo_record_proposal_response_agent ile yazılır.
--    respond_to_crm_proposal'a DOKUNULMAZ (canlı tanım repodan ayrışabilir).
--
-- 2) Sözleşme imzasında hangi yasal metin sürümünün onaylandığı ve
--    müşterinin işaretlediği onay beyanları (sözleşme, ön bilgilendirme,
--    KVKK, cayma süresinde ifaya başlama talebi) saklanır:
--    crm_contracts.legal_text_version, crm_contracts.signed_consents.
--    İmzalı sözleşme dondurma tetikleyicisi (arvo_freeze_signed_contract)
--    bu alanları kontrol etmez; imzadan hemen sonra yazılabilirler.
--
-- 3) Herkese açık belge sayfası için token ile çalışan salt-okur
--    fonksiyonlar: arvo_public_contract_audit (UA, metin sürümü, onaylar,
--    teklifin KDV dökümü, taksit durumları) ve genişletilmiş
--    arvo_public_proposal_decision (UA + teklif tarih/teslim alanları).
--
-- Güvenlik: tüm fonksiyonlar yalnızca gizli belge token'ı ile çalışır
-- (mevcut açık uçlarla aynı model). Yazan fonksiyonlar yalnızca son 10
-- dakika içinde karar verilmiş/imzalanmış ve alanı boş kayda bir kez yazar.
-- İdempotent: tekrar çalıştırılabilir.

alter table public.crm_proposals
  add column if not exists response_user_agent text;

alter table public.crm_contracts
  add column if not exists legal_text_version text,
  add column if not exists signed_consents jsonb;

-- ---------------------------------------------------------------
-- 1) Teklif kararının cihaz/tarayıcı bilgisi
-- ---------------------------------------------------------------
create or replace function public.arvo_record_proposal_response_agent(public_token text, p_user_agent text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  affected integer;
begin
  update public.crm_proposals
     set response_user_agent = nullif(left(trim(coalesce(p_user_agent, '')), 1000), '')
   where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
     and status in ('accepted', 'rejected')
     and responded_at is not null
     and responded_at > now() - interval '10 minutes'
     and response_user_agent is null;
  get diagnostics affected = row_count;
  return affected > 0;
end
$function$;

-- ---------------------------------------------------------------
-- 2) Sözleşme imzasının yasal metin sürümü ve onay beyanları
-- ---------------------------------------------------------------
create or replace function public.arvo_record_contract_consents(public_token text, p_legal_version text, p_consents jsonb)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  affected integer;
begin
  if p_consents is null or jsonb_typeof(p_consents) <> 'object' or pg_column_size(p_consents) > 4096 then
    raise exception 'invalid_consents';
  end if;
  update public.crm_contracts
     set legal_text_version = nullif(left(trim(coalesce(p_legal_version, '')), 20), ''),
         signed_consents = p_consents || jsonb_build_object('recorded_at', now())
   where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
     and signed_at is not null
     and signed_at > now() - interval '10 minutes'
     and legal_text_version is null;
  get diagnostics affected = row_count;
  return affected > 0;
end
$function$;

-- ---------------------------------------------------------------
-- 3) Herkese açık sözleşme sayfası için denetim/ödeme ayrıntıları
-- ---------------------------------------------------------------
drop function if exists public.arvo_public_contract_audit(text);

create function public.arvo_public_contract_audit(public_token text)
returns table(
  signed_user_agent text,
  legal_text_version text,
  signed_consents jsonb,
  proposal_no text,
  tax_status text,
  tax_rate numeric,
  net_amount bigint,
  tax_amount bigint,
  gross_amount bigint,
  estimated_delivery_date date,
  installments jsonb
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select
    c.signed_user_agent::text,
    c.legal_text_version::text,
    c.signed_consents,
    p.proposal_no::text,
    p.tax_status::text,
    p.tax_rate::numeric,
    p.net_amount::bigint,
    p.tax_amount::bigint,
    p.gross_amount::bigint,
    p.estimated_delivery_date::date,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'installment_no', i.installment_no,
        'due_date', i.due_date,
        'amount', i.amount,
        'status', i.status,
        'payment_url', i.payment_url
      ) order by i.installment_no)
      from public.payment_installments i
      where c.payment_plan_id is not null
        and i.payment_plan_id = c.payment_plan_id
    ), '[]'::jsonb)
  from public.crm_contracts c
  left join public.crm_proposals p on p.id = c.proposal_id
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$;

-- ---------------------------------------------------------------
-- 4) Teklif kararı: cihaz bilgisi ve belgede gereken ek alanlar
-- ---------------------------------------------------------------
drop function if exists public.arvo_public_proposal_decision(text);

create function public.arvo_public_proposal_decision(public_token text)
returns table(
  status text,
  responded_at timestamptz,
  response_ip text,
  valid_until date,
  contract_share_token text,
  contract_no text,
  contract_status text,
  response_user_agent text,
  proposal_created_at timestamptz,
  estimated_delivery_date date,
  tax_rate numeric,
  payment_plan_type text,
  payment_schedule jsonb
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select
    p.status::text,
    p.responded_at,
    p.response_ip::text,
    p.valid_until::date,
    c.share_token::text,
    c.contract_no::text,
    c.status::text,
    p.response_user_agent::text,
    p.created_at,
    p.estimated_delivery_date::date,
    p.tax_rate::numeric,
    p.payment_plan_type::text,
    p.payment_schedule::jsonb
  from public.crm_proposals p
  left join public.crm_contracts c on c.proposal_id = p.id
  where p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$;

revoke all on function public.arvo_record_proposal_response_agent(text, text) from public;
revoke all on function public.arvo_record_contract_consents(text, text, jsonb) from public;
revoke all on function public.arvo_public_contract_audit(text) from public;
revoke all on function public.arvo_public_proposal_decision(text) from public;
grant execute on function public.arvo_record_proposal_response_agent(text, text) to anon, authenticated;
grant execute on function public.arvo_record_contract_consents(text, text, jsonb) to anon, authenticated;
grant execute on function public.arvo_public_contract_audit(text) to anon, authenticated;
grant execute on function public.arvo_public_proposal_decision(text) to anon, authenticated;
