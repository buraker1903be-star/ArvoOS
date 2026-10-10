-- ============================================================
-- SÖZLEŞME SİLİNİNCE: YAZIŞMA KALIR, ÖDEME PLANI SİLİNEMEZ
--
-- Panel zaten engelliyor (crm/contract-actions.ts): bağlı iş, ödeme
-- planı, maliyet kalemi, ek sözleşme ya da müşteri yazışması varsa
-- sözleşme silinmiyor. Bu migration aynı kararı VERİTABANINA yazıyor,
-- çünkü engel tek savunmaydı: paneli atlayan bir yol (doğrudan SQL,
-- ileride yazılacak bir yönetim aracı) kaskatı sessizce çalıştırırdı.
--
-- 1) customer_file_messages.contract_id: CASCADE → RESTRICT
--    Kurum sahibinin kararı (10.10.2026): müşteri yazışması silinmez.
--    Önce SET NULL denendi (aynı tablonun workflow_id'si öyle ve iş
--    silinince mesaj yaşıyor) ama contract_id NOT NULL: SET NULL silme
--    anında kısıtı çiğniyor ve işlem hata veriyor. Akış testi bunu
--    gösterdi. Geriye tek seçenek kalıyor — silmeyi reddetmek, ki
--    kararın kendisi de bu. Panel aynı engeli daha anlaşılır bir
--    mesajla veriyor ("İptal durumuna alın"); bu satır paneli atlayan
--    yollar için.
--
-- 2) payment_plans.contract_id: CASCADE → RESTRICT
--    Ödeme planı sözleşmesiz anlamsız (SET NULL sahipsiz bir tahsilat
--    takvimi bırakırdı), o yüzden bağlanan yol silmeyi reddetmek.
--    Panelin mesajı zaten "önce ödeme planını silin" diyor; bu, o
--    sıranın veritabanındaki karşılığı.
--
-- Maliyet kalemleri ve ek sözleşmeler CASCADE kalıyor: ikisi de
-- panelden tek tek silinebiliyor, yani kullanıcıya söylenebilecek bir
-- iş var ve engel orada yeterli.
-- ============================================================

alter table public.customer_file_messages
  drop constraint if exists customer_file_messages_contract_id_fkey;
alter table public.customer_file_messages
  add constraint customer_file_messages_contract_id_fkey
  foreign key (contract_id) references public.crm_contracts(id) on delete restrict;

alter table public.payment_plans
  drop constraint if exists payment_plans_contract_id_fkey;
alter table public.payment_plans
  add constraint payment_plans_contract_id_fkey
  foreign key (contract_id) references public.crm_contracts(id) on delete restrict;

notify pgrst, 'reload schema';
