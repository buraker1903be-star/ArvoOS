-- Gönderilmiş teklif/sözleşme "Taslak"ta kalıyordu.
--
-- Paylaşım bağlantısı belge oluşturulurken üretiliyor (create_crm_proposal_v2,
-- online kabulde sözleşme insert'i) ve panel onu hemen WhatsApp/e-posta
-- düğmeleriyle gösteriyor. Durum ise yalnızca issue_crm_*_link ("Müşteriye
-- Gönder" / "İmzaya Gönder") çağrılınca 'sent' oluyordu. Bağlantıyı doğrudan
-- gönderen personelin belgesi müşteri açtığı halde taslak görünüyordu; teklif
-- süresi dolduğunda da otomatik arşivlenmiyordu (expire_due_crm_proposals
-- yalnızca 'sent' kayıtlara bakıyor).
--
-- 1) Panel artık gönderim düğmesinde belgeyi 'sent' yapıyor (markDocumentShared).
-- 2) Güvenlik ağı: müşteri bağlantıyı açtığında (mark_crm_*_viewed görüntülenme
--    alanlarını güncellerken) belge hâlâ taslaksa 'sent'e geçer. Panelden
--    "Önizle" ile bakan kurum üyesi sayılmaz.
-- 3) Mevcut kayıtlar: müşterinin açtığı taslaklar düzeltilir.

create or replace function private.arvo_promote_draft_on_customer_view()
returns trigger
language plpgsql
-- Müşteri (anon) görüntülemesi de bu tetikleyiciyi çalıştırıyor; üyelik
-- kontrolü anon'un yetkisine takılıp müşteri sayfasını düşürmesin.
-- auth.uid() yine isteğin JWT'sinden okunur.
security definer
set search_path = ''
as $function$
begin
  if new.status = 'draft'
     and (
       coalesce(new.view_count, 0) > coalesce(old.view_count, 0)
       or (new.first_viewed_at is not null and old.first_viewed_at is null)
       or (new.last_viewed_at is not null and new.last_viewed_at is distinct from old.last_viewed_at)
     )
     and not public.arvo_is_member(new.organization_id)
  then
    new.status := 'sent';
    new.sent_at := coalesce(new.sent_at, new.first_viewed_at, now());
  end if;
  return new;
end
$function$;

drop trigger if exists arvo_promote_draft_on_customer_view on public.crm_proposals;
create trigger arvo_promote_draft_on_customer_view
  before update on public.crm_proposals
  for each row execute function private.arvo_promote_draft_on_customer_view();

drop trigger if exists arvo_promote_draft_on_customer_view on public.crm_contracts;
create trigger arvo_promote_draft_on_customer_view
  before update on public.crm_contracts
  for each row execute function private.arvo_promote_draft_on_customer_view();

-- Mevcut kayıtlar: bağlantısı açılmış taslaklar gönderilmiş sayılır.
-- (Süresi geçmiş teklifler arşiv tetikleyicisiyle "Süresi Doldu"ya düşer.)
update public.crm_proposals
   set status = 'sent',
       sent_at = coalesce(sent_at, first_viewed_at, now()),
       updated_at = now()
 where status = 'draft'
   and share_token is not null
   and coalesce(view_count, 0) > 0;

update public.crm_contracts
   set status = 'sent',
       sent_at = coalesce(sent_at, first_viewed_at, now()),
       updated_at = now()
 where status = 'draft'
   and signed_at is null
   and share_token is not null
   and coalesce(view_count, 0) > 0;
