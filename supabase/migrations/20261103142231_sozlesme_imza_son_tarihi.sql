/*
  SÖZLEŞME İÇİN İMZA SON TARİHİ (03.11.2026, kurum sahibinin isteği).

  İmza bağlantısı süresizdi: aylar önce gönderilmiş, fiyatı ya da kapsamı
  artık geçerli olmayan bir sözleşme eski bağlantıdan imzalanıp iş akışı,
  ödeme planı ve cari borç üretebiliyordu. Artık sözleşmenin bir imza
  son tarihi var; o gün (Türkiye saatiyle) geçince imza reddedilir.

  Boş (NULL) = süresiz: eski sözleşmeler ve tarihi silinen sözleşme
  bugünkü gibi davranır. Panel yeni bağlantıda 30 gün önerir.

  Kural VERİTABANINDA: müşteri sayfasındaki kontrol yalnızca açıklama
  için; imza işlevi (sign_crm_contract_v2) anon'a açık ve sayfayı
  atlayıp doğrudan çağrılabilir.
*/
alter table public.crm_contracts add column if not exists imza_son_tarihi date;

/*
  Müşteri sayfası tarihi buradan okur (get_public_crm_contract'ın dönüş
  tipini değiştirmek işlevi düşürüp yeniden yaratmak demekti). Yalnızca
  tarihi döndürür; belirteç yanlışsa NULL.
*/
create or replace function public.arvo_public_contract_deadline(public_token text)
 returns date
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.imza_son_tarihi
  from public.crm_contracts c
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
$function$;
revoke all on function public.arvo_public_contract_deadline(text) from public, anon, authenticated;
grant execute on function public.arvo_public_contract_deadline(text) to anon, authenticated, service_role;

/*
  İmza işlevi: gövde canlı anlık görüntüden (canli-sema.sql), tek ekleme
  süre denetimi. İmzalı sözleşmede denetim çalışmaz: sign_crm_contract
  "signed" döndürür, süresi sonradan geçmiş imzalı sözleşme bozulmasın.
*/
create or replace function public.sign_crm_contract_v2(public_token text, signer_name text, signature_data text, signer_ip text DEFAULT NULL::text, signer_user_agent text DEFAULT NULL::text)
 returns table(result_status text, workflow_id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  signed_result record;
  onceden_imzali boolean;
  son_tarih date;
begin
  if signature_data is null
     or length(signature_data) < 200
     or length(signature_data) > 500000
     or signature_data not like 'data:image/png;base64,%' then
    raise exception 'invalid_signature';
  end if;

  select (c.status = 'signed' or c.signed_at is not null), c.imza_son_tarihi into onceden_imzali, son_tarih
  from public.crm_contracts c
  where c.access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');

  if not coalesce(onceden_imzali, false)
     and son_tarih is not null
     and son_tarih < (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'contract_expired';
  end if;

  select * into signed_result
  from public.sign_crm_contract(public_token, signer_name, signer_ip, signer_user_agent);

  -- Eskiden bu UPDATE koşulsuzdu: bağlantıyı ele geçiren biri imzalı
  -- sözleşmenin imza görselini değiştirebiliyordu (imzacı adı ve zamanı
  -- eskisi gibi kalıyor, yalnızca görsel değişiyordu).
  if not coalesce(onceden_imzali, false) then
    update public.crm_contracts
    set signed_signature_data = signature_data,
        updated_at = now()
    where access_token_hash = encode(extensions.digest(public_token, 'sha256'), 'hex');
  end if;

  return query select signed_result.result_status::text, signed_result.workflow_id::uuid;
end
$function$;
