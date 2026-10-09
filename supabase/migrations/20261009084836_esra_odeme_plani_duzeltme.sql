-- ============================================================
-- SOZ-2026-000021 ÖDEME PLANI SÖZLEŞME TUTARINA ÇEKİLİYOR (tek seferlik)
--
-- 45.000 TL'lik sözleşmenin planında iki taksit 27.500 TL'ydi (toplam
-- 55.000 TL). Sözleşmenin dayandığı kabul edilmiş teklif 2 × 22.500 TL
-- diyor. Fazlalık kalanları açık bakiyenin üstüne çıkarıyor, müşteriler
-- ekranında "30.000 TL açık, 40.000 TL vadesi geçti" görünüyordu
-- (ekranlar artık bakiyeyeSigdir ile sınırlıyor; bu kayıt düzeltmesi).
-- Kurumdaki tek uyumsuz plan buydu (09.10.2026 kontrol sorgusu).
--
-- Güvenlik: yalnızca AkademikMerkez'in bu sözleşmesinin planı (sözleşme no
-- kurum içinde benzersiz) ve yalnızca hâlâ 27.500 TL
-- olan taksitler; plan bu arada başka biçimde değiştirildiyse dokunulmaz.
-- ============================================================

update public.payment_installments i
   set amount = 2250000
  from public.crm_contracts c
 where c.contract_no = 'SOZ-2026-000021'
   and c.organization_id = (select id from public.organizations where slug = 'akademikmerkez')
   and c.amount = 4500000
   and i.payment_plan_id = c.payment_plan_id
   and i.organization_id = c.organization_id
   and i.amount = 2750000
   and i.status <> 'cancelled';

update public.payment_plans p
   set total_amount = c.amount
  from public.crm_contracts c
 where c.contract_no = 'SOZ-2026-000021'
   and c.organization_id = (select id from public.organizations where slug = 'akademikmerkez')
   and p.id = c.payment_plan_id
   and p.total_amount is distinct from c.amount;
