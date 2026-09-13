-- Müşteri takip sayfasında teklif/sözleşme bağlantıları görünmüyordu.
--
-- Paylaşım bağlantısının kendisi (share_token) 2026-09-01'den beri saklanıyor
-- (20260901103000_stable_crm_share_links). Daha eski belgelerde yalnızca
-- access_token_hash vardı; share_token boş kaldığı için
-- arvo_tracking_document_links boş döndü ve takip sayfası "Belgeleriniz"
-- kartını hiç çizmedi (canlıda takip kodlu 10 sözleşmenin 5'i, tekliflerin 4'ü).
--
-- Artık takip koduyla doğrulanan müşteri için, bağlantısı olmayan ve TASLAK
-- OLMAYAN sözleşme/teklife bir kez bağlantı üretilir (issue_crm_*_link ile
-- aynı biçim: 24 bayt rastgele, hex; access_token_hash eşlenir). Böylece
-- belge herkese açık sayfalarda da açılır.
--  - Bağlantısı olan belgeye dokunulmaz; dönüş eskisiyle aynıdır.
--  - Taslak belgeye bağlantı üretilmez: gönderilmemiş belge takip
--    sayfasından sızmaz.
--  - Durum değiştirilmez (issue_crm_*_link'in aksine 'sent' yapılmaz);
--    görüntülenme alanlarına dokunulmadığı için taslak-terfi tetikleyicisi de
--    çalışmaz.
--  - Not: bu eski belgelerin 1 Eylül öncesi gönderilmiş linkleri, yeni hash
--    yazıldığı için geçersiz olur ("Müşteriye Gönder" düğmesiyle aynı
--    davranış). Müşteri belgeye takip sayfasından ulaşır.
-- Tekrar çalıştırılabilir.

create or replace function public.arvo_tracking_document_links(p_tracking_code text)
returns table(
  proposal_share_token text,
  proposal_no text,
  proposal_status text,
  contract_share_token text,
  contract_no text,
  contract_status text
)
language plpgsql
volatile
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_code text := upper(trim(coalesce(p_tracking_code, '')));
  c public.crm_contracts%rowtype;
  p public.crm_proposals%rowtype;
  v_token text;
begin
  if char_length(v_code) < 6 then
    return;
  end if;

  select * into c
  from public.crm_contracts
  where upper(tracking_code) = v_code
  limit 1
  for update;

  if c.id is null then
    return;
  end if;

  if c.share_token is null and coalesce(c.status, 'draft') <> 'draft' then
    v_token := encode(extensions.gen_random_bytes(24), 'hex');
    update public.crm_contracts
       set share_token = v_token,
           access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
           updated_at = now()
     where id = c.id
       and share_token is null;
    c.share_token := v_token;
  end if;

  if c.proposal_id is not null then
    select * into p
    from public.crm_proposals
    where id = c.proposal_id
    for update;

    if p.id is not null and p.share_token is null and coalesce(p.status, 'draft') <> 'draft' then
      v_token := encode(extensions.gen_random_bytes(24), 'hex');
      update public.crm_proposals
         set share_token = v_token,
             access_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex'),
             updated_at = now()
       where id = p.id
         and share_token is null;
      p.share_token := v_token;
    end if;
  end if;

  return query
  select p.share_token, p.proposal_no, p.status,
         c.share_token, c.contract_no, c.status;
end
$function$;

revoke all on function public.arvo_tracking_document_links(text) from public;
grant execute on function public.arvo_tracking_document_links(text) to anon, authenticated;

-- Doğrulama (isteğe bağlı): takip kodlu sözleşmelerde bağlantısız kalan
-- taslak dışı belge sayısı. Müşteri takip sayfasını açtıkça 0'a iner.
-- select count(*) filter (where c.share_token is null and c.status <> 'draft') as linksiz_sozlesme,
--        count(*) filter (where p.id is not null and p.share_token is null and p.status <> 'draft') as linksiz_teklif
-- from public.crm_contracts c
-- left join public.crm_proposals p on p.id = c.proposal_id
-- where c.tracking_code is not null;
