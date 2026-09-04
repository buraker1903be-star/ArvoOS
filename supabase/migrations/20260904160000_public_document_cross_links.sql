-- Müşteriye açık belgeler arasında bağ ve karar kaydı.
--
-- Amaç:
--   1. Teklif belgesinde "kabul/ret" kararının tarihi ve IP'si görünsün
--      (sözleşmede bu zaten var, teklifte yoktu).
--   2. Teklif ile sözleşme birbirine bağlansın; müşteri ikisini de
--      ayrı ayrı görebilsin.
--   3. Takip kodundan her iki belgeye de ulaşılabilsin.
--
-- Mevcut get_public_crm_proposal / get_public_crm_contract fonksiyonlarına
-- DOKUNMUYORUZ: canlı şema repodaki tanımlarla ayrışmış durumda, üzerine
-- yazmak çalışan bir şeyi bozabilir. Bunun yerine ek fonksiyonlar.
--
-- Güvenlik: üçü de yalnızca gizli token / takip kodu ile çalışıyor,
-- mevcut açık uçlarla aynı model. Token bilmeyen hiçbir şey göremez.

-- ---------------------------------------------------------------
-- 1) Teklif kararı + varsa sözleşme bağlantısı
-- ---------------------------------------------------------------
create or replace function public.arvo_public_proposal_decision(public_token text)
returns table(
  status text,
  responded_at timestamptz,
  response_ip text,
  valid_until date,
  contract_share_token text,
  contract_no text,
  contract_status text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select
    p.status,
    p.responded_at,
    p.response_ip,
    p.valid_until,
    c.share_token,
    c.contract_no,
    c.status
  from public.crm_proposals p
  left join public.crm_contracts c on c.proposal_id = p.id
  where p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$;

-- ---------------------------------------------------------------
-- 2) Sözleşmeden teklife dönüş bağlantısı
-- ---------------------------------------------------------------
create or replace function public.arvo_public_contract_links(public_token text)
returns table(
  proposal_share_token text,
  proposal_no text,
  proposal_status text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select p.share_token, p.proposal_no, p.status
  from public.crm_contracts c
  join public.crm_proposals p on p.id = c.proposal_id
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  limit 1;
$function$;

-- ---------------------------------------------------------------
-- 3) Takip kodundan her iki belgeye
-- ---------------------------------------------------------------
create or replace function public.arvo_tracking_document_links(p_tracking_code text)
returns table(
  proposal_share_token text,
  proposal_no text,
  proposal_status text,
  contract_share_token text,
  contract_no text,
  contract_status text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select p.share_token, p.proposal_no, p.status,
         c.share_token, c.contract_no, c.status
  from public.crm_contracts c
  left join public.crm_proposals p on p.id = c.proposal_id
  where upper(c.tracking_code) = upper(trim(p_tracking_code))
  limit 1;
$function$;

revoke all on function public.arvo_public_proposal_decision(text) from public;
revoke all on function public.arvo_public_contract_links(text) from public;
revoke all on function public.arvo_tracking_document_links(text) from public;
grant execute on function public.arvo_public_proposal_decision(text) to anon, authenticated;
grant execute on function public.arvo_public_contract_links(text) to anon, authenticated;
grant execute on function public.arvo_tracking_document_links(text) to anon, authenticated;
