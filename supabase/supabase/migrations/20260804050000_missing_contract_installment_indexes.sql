-- crm_contracts ve payment_installments tabloları hiç indekslenmemişti.
-- Prim Raporu, otomatik ödeme senkronizasyonu ve fatura eşleştirme akışları
-- bu tabloları sık sorguluyor; veri büyüdükçe bu eksiklik yavaşlamaya
-- yol açar. Sık kullanılan filtre/arama kolonlarına indeks ekliyoruz.

create index if not exists crm_contracts_org_contract_no_idx
  on public.crm_contracts (organization_id, upper(contract_no));

create index if not exists crm_contracts_opportunity_idx
  on public.crm_contracts (opportunity_id);

create index if not exists crm_contracts_org_invoice_idx
  on public.crm_contracts (organization_id, invoice_id)
  where invoice_id is not null;

create index if not exists payment_installments_plan_status_idx
  on public.payment_installments (payment_plan_id, status, installment_no);

create index if not exists payment_installments_org_status_paid_idx
  on public.payment_installments (organization_id, status, paid_at desc);

create index if not exists payment_plans_org_contract_idx
  on public.payment_plans (organization_id, contract_id);
