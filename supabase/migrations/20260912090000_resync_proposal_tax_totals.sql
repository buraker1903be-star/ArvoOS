-- Teklif tutarı düzenlendiğinde update_crm_proposal yalnızca amount
-- alanını güncelliyordu; net_amount / tax_amount / gross_amount eski
-- değerde kalıyor ve müşteri belgesi (gross_amount okuyor) eski tutarı
-- gösteriyordu. Uygulama artık bu alanları her güncellemede yeniden
-- hesaplıyor; bu migration önceden bozulmuş kayıtları düzeltir.
--
-- amount her zaman brüt tutardır (create_crm_proposal_v2). Net ve KDV
-- aynı formülle brütten türetilir. Onaylanmış teklifler dondurulduğu
-- için (arvo_freeze_accepted_proposal) dokunulmaz.

update public.crm_proposals
set
  gross_amount = amount,
  net_amount = case
    when tax_status in ('excluded', 'included') then round(amount / 1.20)
    else amount
  end,
  tax_amount = case
    when tax_status in ('excluded', 'included') then amount - round(amount / 1.20)
    else 0
  end
where status <> 'accepted'
  and gross_amount is not null
  and gross_amount <> amount;
