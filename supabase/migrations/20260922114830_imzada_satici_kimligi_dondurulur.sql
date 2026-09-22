-- ============================================================
-- İmzalı sözleşme, imza anındaki satıcı kimliğini saklar
--
-- Belgeler kurum künyesini CANLI okuyordu (organizations.legal_name,
-- tax_number, iban…). Yani kurum kaydı sonradan düzeltilirse imzalanmış
-- sözleşme de yeni değerlerle çiziliyordu: müşterinin imzaladığı metin ile
-- bugün gördüğümüz metin farklı olabiliyordu. Sözleşme metninin sürümünü
-- zaten donduruyoruz (legal_text_version); satıcının kim olduğunu ve paranın
-- hangi hesaba gideceğini dondurmamak eksikti.
--
-- Donan: hukuki kimlik (unvan, adres, vergi, MERSİS, banka, IBAN).
-- Donmayan: marka (logo, görünen ad, renk) — logo yenilenince eski
-- sözleşmeler de yeni logoyu göstersin, bunun hukuki sonucu yok.
--
-- Anlık görüntüyü imza fonksiyonunu yeniden yazmak yerine tetikleyici
-- dolduruyor: sign_crm_contract büyük bir fonksiyon, gövdesini kopyalamak
-- onu bozma riski taşıyor. Tetikleyici "durum signed'a geçiyorsa ve henüz
-- damga yoksa" koşuluyla çalışır; hangi yoldan imzalandığından bağımsızdır.
-- ============================================================

alter table public.crm_contracts
  add column if not exists issuer_snapshot jsonb;

comment on column public.crm_contracts.issuer_snapshot is
  'İmza anındaki satıcı künyesi (unvan, adres, vergi, MERSİS, banka). Belge bu varsa kurumun güncel kaydını değil bunu gösterir.';

-- ------------------------------------------------------------
-- 1) Damgayı imza anında bas
-- ------------------------------------------------------------
create or replace function private.arvo_freeze_issuer_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.issuer_snapshot is null
     and new.status = 'signed'
     and coalesce(old.status, '') <> 'signed' then
    select jsonb_strip_nulls(jsonb_build_object(
      'legal_name', o.legal_name,
      'legal_address', o.legal_address,
      'legal_city', o.legal_city,
      'legal_district', o.legal_district,
      'tax_office', o.tax_office,
      'tax_number', o.tax_number,
      'mersis_no', o.mersis_no,
      'bank_name', o.bank_name,
      'bank_account_holder', o.bank_account_holder,
      'iban', o.iban
    ))
    into new.issuer_snapshot
    from public.organizations o
    where o.id = new.organization_id;
  end if;
  return new;
end;
$$;
revoke all on function private.arvo_freeze_issuer_identity() from public, anon;

-- Tetikleyici adı "f" ile başlıyor: imza koruması (g…) çalışmadan önce
-- damgayı basar, yoksa koruma kendi bastığımız damgayı reddederdi.
drop trigger if exists arvo_freeze_issuer_identity on public.crm_contracts;
create trigger arvo_freeze_issuer_identity
  before update on public.crm_contracts
  for each row execute function private.arvo_freeze_issuer_identity();

-- ------------------------------------------------------------
-- 2) Damga da imza kanıtıdır: kullanıcı üzerine yazamaz
-- ------------------------------------------------------------
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
  or new.issuer_snapshot       is distinct from old.issuer_snapshot
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
end;
$$;
revoke all on function private.arvo_guard_contract_signature() from public, anon;

-- ------------------------------------------------------------
-- 3) Müşterinin gördüğü belge de damgayı kullansın
--
-- Herkese açık sayfa künyeyi bu fonksiyondan okuyor. Damga varsa kurumun
-- bugünkü kaydı değil imza anındaki değerler döner; yoksa eski davranış.
-- ------------------------------------------------------------
create or replace function public.arvo_public_organization_legal(public_token text, document_type text)
returns table(
  legal_name text,
  legal_address text,
  legal_city text,
  legal_district text,
  tax_office text,
  tax_number text,
  mersis_no text,
  bank_name text,
  bank_account_holder text,
  iban text
)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with target as (
    select p.organization_id, null::jsonb as issuer_snapshot
    from public.crm_proposals p
    where document_type = 'proposal'
      and p.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
    union all
    select c.organization_id, c.issuer_snapshot
    from public.crm_contracts c
    where document_type = 'contract'
      and c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex')
  )
  select
    coalesce(t.issuer_snapshot->>'legal_name', org.legal_name)::text,
    coalesce(t.issuer_snapshot->>'legal_address', org.legal_address)::text,
    coalesce(t.issuer_snapshot->>'legal_city', org.legal_city)::text,
    coalesce(t.issuer_snapshot->>'legal_district', org.legal_district)::text,
    coalesce(t.issuer_snapshot->>'tax_office', org.tax_office)::text,
    coalesce(t.issuer_snapshot->>'tax_number', org.tax_number)::text,
    coalesce(t.issuer_snapshot->>'mersis_no', org.mersis_no)::text,
    coalesce(t.issuer_snapshot->>'bank_name', org.bank_name)::text,
    coalesce(t.issuer_snapshot->>'bank_account_holder', org.bank_account_holder)::text,
    coalesce(t.issuer_snapshot->>'iban', org.iban)::text
  from target t
  join public.organizations org on org.id = t.organization_id
  where coalesce(public_token, '') <> ''
  limit 1;
$function$;

revoke all on function public.arvo_public_organization_legal(text, text) from public;
grant execute on function public.arvo_public_organization_legal(text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4) Geçmiş sözleşmeler: bugünkü künyeyle damgala
--
-- İmza anındaki değerleri artık bilemeyiz; en doğru yaklaşım bugünkü
-- künyeyi dondurmak. Böylece bundan SONRAKİ kurum değişiklikleri imzalı
-- sözleşmeleri etkilemez. Damgası olan satıra dokunulmaz.
-- ------------------------------------------------------------
update public.crm_contracts c
set issuer_snapshot = jsonb_strip_nulls(jsonb_build_object(
  'legal_name', o.legal_name,
  'legal_address', o.legal_address,
  'legal_city', o.legal_city,
  'legal_district', o.legal_district,
  'tax_office', o.tax_office,
  'tax_number', o.tax_number,
  'mersis_no', o.mersis_no,
  'bank_name', o.bank_name,
  'bank_account_holder', o.bank_account_holder,
  'iban', o.iban
))
from public.organizations o
where o.id = c.organization_id
  and c.issuer_snapshot is null
  and c.status in ('signed', 'completed');

notify pgrst, 'reload schema';
