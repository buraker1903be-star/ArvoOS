-- Müşteri teklifi online kabul ettiğinde oluşan sözleşme linki korunuyor.
--
-- Sorun: respond_to_crm_proposal sözleşmeyi yalnızca access_token_hash ile
-- oluşturuyordu; share_token boş kalıyordu. Personel sonra "İmzaya Gönder"e
-- basınca issue_crm_contract_link share_token'ı boş görüp YENİ bir token
-- üretiyor, hash'i eziyor ve müşteriye yönlendirilen /sozlesme/<token>
-- linki 404 veriyordu. Panel akışları (createProposal, fastTrack,
-- createContractDirectly) token'ı sonradan saklıyordu; müşteri akışı değil.
--
-- Ayrıca ödeme planı türü ve taksitler sözleşmeye kopyalanmıyordu; sözleşme
-- ödeme planı formu türü bulamayınca "peşin" gösteriyor, kaydedince plan
-- sessizce peşine dönüyordu.
--
-- Değişiklik: canlı tanımın (2026-09-12'de pg_get_functiondef ile alındı)
-- birebir aynısı; yalnızca sözleşme insert'ine share_token,
-- payment_plan_type ve payment_schedule eklendi.

create or replace function public.respond_to_crm_proposal(public_token text, decision text, p_ip text default null::text)
returns table(result_status text, contract_id uuid, contract_token text)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  prop public.crm_proposals%rowtype;
  raw_token text;
  new_id uuid;
  next_no text;
begin
  if decision not in ('accept', 'reject') then
    raise exception 'invalid_decision';
  end if;
  select * into prop
  from public.crm_proposals
  where access_token_hash = encode(digest(public_token, 'sha256'), 'hex')
  for update;
  if prop.id is null then
    raise exception 'invalid_token';
  end if;
  if prop.superseded_by is not null then
    return query select 'superseded', null::uuid, null::text;
    return;
  end if;
  if prop.status in ('accepted', 'rejected', 'archived') then
    return query
    select
      prop.status,
      (select id from public.crm_contracts where proposal_id = prop.id),
      null::text;
    return;
  end if;
  if prop.valid_until is not null and prop.valid_until < current_date then
    update public.crm_proposals
    set status = 'expired', updated_at = now()
    where id = prop.id;
    return query select 'expired', null::uuid, null::text;
    return;
  end if;
  if decision = 'reject' then
    update public.crm_proposals
    set status = 'rejected', responded_at = now(), updated_at = now(), response_ip = p_ip
    where id = prop.id;
    update public.crm_opportunities
    set
      stage = 'lost',
      probability = 0,
      lost_reason = 'Teklif müşteri tarafından reddedildi',
      updated_at = now()
    where id = prop.opportunity_id;
    return query select 'rejected', null::uuid, null::text;
    return;
  end if;
  raw_token := encode(gen_random_bytes(24), 'hex');
  next_no := public.next_document_number(
    prop.organization_id,
    'contract',
    'SOZ',
    current_date
  );
  insert into public.crm_contracts(
    organization_id,
    opportunity_id,
    proposal_id,
    contract_no,
    title,
    scope,
    amount,
    currency,
    payment_plan,
    payment_plan_type,
    payment_schedule,
    status,
    access_token_hash,
    share_token,
    created_by
  ) values (
    prop.organization_id,
    prop.opportunity_id,
    prop.id,
    next_no,
    prop.title,
    prop.scope,
    prop.amount,
    prop.currency,
    prop.payment_plan,
    prop.payment_plan_type,
    prop.payment_schedule,
    'draft',
    encode(digest(raw_token, 'sha256'), 'hex'),
    raw_token,
    prop.created_by
  )
  returning id into new_id;
  update public.crm_proposals
  set status = 'accepted', responded_at = now(), updated_at = now(), response_ip = p_ip
  where id = prop.id;
  update public.crm_opportunities
  set stage = 'contract', probability = 70, updated_at = now()
  where id = prop.opportunity_id;
  return query select 'accepted', new_id, raw_token;
end
$function$;

-- Önceden online kabulle oluşup plan türü boş kalan, henüz imzalanmamış
-- sözleşmelere teklifteki planı kopyala (imzalılar donduruldu; onlar
-- zaten get_public_crm_contract'ta teklife düşüyor).
update public.crm_contracts c
set payment_plan_type = p.payment_plan_type,
    payment_schedule = coalesce(c.payment_schedule, p.payment_schedule)
from public.crm_proposals p
where p.id = c.proposal_id
  and c.payment_plan_type is null
  and p.payment_plan_type is not null
  and c.status not in ('signed', 'completed');

-- Kontrol: linki (share_token) olmayan imzasız sözleşmeler. Bunların
-- müşteriye giden eski linki geri getirilemez (yalnızca hash saklanmış);
-- "İmzaya Gönder" ile yeni link üretilip müşteriye tekrar gönderilmeli.
select c.contract_no, c.status, c.created_at::date as olusturma
from public.crm_contracts c
where c.share_token is null
  and c.status not in ('signed', 'completed', 'cancelled', 'rejected')
order by c.created_at desc;
