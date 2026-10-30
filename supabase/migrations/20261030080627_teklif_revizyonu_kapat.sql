/*
  TEKLİF REVİZYONU İŞLEVİ DIŞARIYA KAPATILDI (30.10.2026).

  create_crm_proposal_revision panelde hiçbir düğmeden çağrılmıyordu:
  onu çağıran sunucu işlemi (createProposalRevision) yetki denetimi
  olmadan dışarıdan çağrılabilir bir uç nokta olarak duruyordu ve
  kaldırıldı. İşlevin kendisi ise anon dahil herkese açıktı; kurumun
  herhangi bir üyesi (satış personeli de) API'den doğrudan bir teklifi
  -R1, -R2 diye çoğaltıp eskisini arşive gönderebiliyordu — panelde
  karşılığı olmayan, kimsenin beklemediği bir değişiklik.

  İşlev SİLİNMEDİ: eski revizyonların geçmiş sayfası (proposals/[id]/
  revisions) aynı sütunları okumaya devam ediyor ve revizyon akışı ileride
  yetkiyle birlikte panele geri gelebilir. Yalnızca çağırma hakkı
  service_role'e indirildi.
*/
revoke all on function public.create_crm_proposal_revision(uuid, text) from public, anon, authenticated;
grant execute on function public.create_crm_proposal_revision(uuid, text) to service_role;
