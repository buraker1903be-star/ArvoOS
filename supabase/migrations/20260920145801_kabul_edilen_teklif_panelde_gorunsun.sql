-- ============================================================
-- Kabul ya da reddedilen teklif panelden kayboluyordu.
--
-- archive_inactive_crm_proposal tetikleyicisi 'accepted' ve 'rejected'
-- durumlarını status='archived' + archive_reason='accepted'|'rejected'
-- yapıyor. Okuma politikası ise arşivlilerden yalnızca
-- archive_reason='expired' olanı geçiriyordu: müşteri teklifi onayladığı
-- anda teklif Teklifler sayfasından, arşiv listesinden ve detay sayfasından
-- kayboluyor, kurum sahibi bile göremiyordu. Finans raporundaki teklif
-- hunisi de yalnızca açık teklifleri saydığı için dönüşüm oranı yanlıştı.
--
-- Süresi geçmiş ama henüz arşivlenmemiş ('sent' + valid_until geçmiş) teklif
-- eskisi gibi gizli kalır: aktif listeyi kirletmesin diye bilinçliydi.
-- ============================================================

drop policy if exists "members read assigned proposals" on public.crm_proposals;
create policy "members read assigned proposals" on public.crm_proposals
  as permissive for select to authenticated
  using (
    private.arvo_can_access_opportunity(opportunity_id)
    and (
      status = 'draft'
      or (status = 'sent' and (valid_until is null or valid_until >= ((now() at time zone 'Europe/Istanbul'))::date))
      -- Arşivin tamamı görünür: kabul, ret, süre dolumu ve elle arşivleme.
      or status = 'archived'
      -- Tetikleyici bu ikisini 'archived'a çeviriyor; yine de gizlenmesinler.
      or status in ('accepted', 'rejected')
    )
  );

notify pgrst, 'reload schema';
