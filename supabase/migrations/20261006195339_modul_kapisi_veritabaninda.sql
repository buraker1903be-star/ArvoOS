-- ============================================================
-- MODÜL KAPISI VERİTABANINDA
--
-- Panelden bir modülü kapatmak bugüne kadar yalnızca uygulama
-- katmanındaydı: menü gizleniyor, sayfa ve sunucu işlemi reddediyor.
-- Ama oturum jetonu tarayıcıda; modülü kapatılmış bir personel
-- PostgREST'e doğrudan istek atıp o modülün tablolarını okuyabiliyordu.
-- Kapatma, kullanıcıya "artık göremiyor" diye anlatılıyor ve bu doğru
-- değildi.
--
-- Posta modülünde kapı baştan veritabanına kondu (20261006190207) ve
-- private.arvo_modul_acik yardımcısı oradan geliyor; burada aynı kapı
-- mevcut tablolara da uygulanıyor.
--
-- NASIL: her politikanın MEVCUT ifadesi aynen korunuyor, üzerine modül
-- koşulu EKLENİYOR. Politikayı baştan yazmak erişimi daraltmak yerine
-- genişletirdi — "yalnızca atanmış işin adımları" ya da "yalnızca
-- yetkili üye" gibi kurallar o ifadelerin içinde.
--
-- HANGİ TABLOLAR: yalnızca okuyucusu koddan doğrulananlar. Her tablonun
-- hangi modül ekranlarından okunduğu tarandı; birden çok modül okuyorsa
-- kapı "şu VEYA bu modül açık" biçiminde. hr_employees, crm_contracts,
-- crm_opportunities ve operation_workflows gibi altı-yedi ekrandan
-- okunan tablolar DIŞARIDA: oralarda kapı pratikte hep açık olurdu ve
-- karşılığında meşru bir akışı kırma riski taşırdı.
--
-- Müşteriye açık yollar etkilenmiyor: bu politikaların hepsi
-- `to authenticated`, müşteri tarafı security definer fonksiyonlardan
-- geçiyor.
-- ============================================================

-- ---------- FİNANS ----------

drop policy if exists "members_read_own_account_parties" on public.account_parties;
create policy "members_read_own_account_parties" on public.account_parties
  as permissive for select to authenticated
  using (
    exists (select 1 from public.organization_memberships m
      where m.organization_id = account_parties.organization_id
        and m.user_id = (select auth.uid()) and m.is_active)
    and private.arvo_modul_acik(organization_id, 'finance')
  );

drop policy if exists "members_read_own_bank_transactions" on public.bank_transactions;
create policy "members_read_own_bank_transactions" on public.bank_transactions
  as permissive for select to authenticated
  using (
    exists (select 1 from public.organization_memberships m
      where m.organization_id = bank_transactions.organization_id
        and m.user_id = (select auth.uid()) and m.is_active)
    and private.arvo_modul_acik(organization_id, 'finance')
  );

drop policy if exists "members_read_own_bank_accounts" on public.organization_bank_accounts;
create policy "members_read_own_bank_accounts" on public.organization_bank_accounts
  as permissive for select to authenticated
  using (
    exists (select 1 from public.organization_memberships m
      where m.organization_id = organization_bank_accounts.organization_id
        and m.user_id = (select auth.uid()) and m.is_active)
    and private.arvo_modul_acik(organization_id, 'finance')
  );

/*
  Finans hareketleri ve cari dökümü İK'dan da okunuyor (prim ödemesi
  kaydı finans hareketine düşüyor): kapı "finans VEYA İK".
*/
drop policy if exists "members_read_own_finance_transactions" on public.finance_transactions;
create policy "members_read_own_finance_transactions" on public.finance_transactions
  as permissive for select to authenticated
  using (
    exists (select 1 from public.organization_memberships membership
      where membership.organization_id = finance_transactions.organization_id
        and membership.user_id = (select auth.uid()) and membership.is_active = true)
    and (private.arvo_modul_acik(organization_id, 'finance')
      or private.arvo_modul_acik(organization_id, 'hr'))
  );

drop policy if exists "members_read_own_account_entries" on public.account_entries;
create policy "members_read_own_account_entries" on public.account_entries
  as permissive for select to authenticated
  using (
    exists (select 1 from public.organization_memberships m
      where m.organization_id = account_entries.organization_id
        and m.user_id = (select auth.uid()) and m.is_active)
    and (private.arvo_modul_acik(organization_id, 'finance')
      or private.arvo_modul_acik(organization_id, 'hr'))
  );

/*
  Ödeme planı ve taksitler üç yerden okunuyor: finans ekranı, CRM'deki
  sözleşme detayı ve belge merkezi. Üçü de meşru; kapı üçünün birleşimi.
*/
drop policy if exists "members read payment plans" on public.payment_plans;
create policy "members read payment plans" on public.payment_plans
  as permissive for select to authenticated
  using (
    arvo_is_member(organization_id)
    and (private.arvo_modul_acik(organization_id, 'finance')
      or private.arvo_modul_acik(organization_id, 'crm')
      or private.arvo_modul_acik(organization_id, 'documents'))
  );

drop policy if exists "members read payment installments" on public.payment_installments;
create policy "members read payment installments" on public.payment_installments
  as permissive for select to authenticated
  using (
    arvo_is_member(organization_id)
    and (private.arvo_modul_acik(organization_id, 'finance')
      or private.arvo_modul_acik(organization_id, 'crm')
      or private.arvo_modul_acik(organization_id, 'documents'))
  );

-- ---------- CRM ----------

drop policy if exists "members_read_crm_stages" on public.organization_crm_stages;
create policy "members_read_crm_stages" on public.organization_crm_stages
  as permissive for select to authenticated
  using (
    exists (select 1 from public.organization_memberships m
      where m.organization_id = organization_crm_stages.organization_id
        and m.user_id = auth.uid() and m.is_active)
    and private.arvo_modul_acik(organization_id, 'crm')
  );

-- ---------- OPERASYON ----------
-- Mevcut kural korunuyor: yalnızca işi görebilen. Üzerine modül kapısı.

drop policy if exists "members_read_assigned_operation_steps" on public.operation_steps;
create policy "members_read_assigned_operation_steps" on public.operation_steps
  as permissive for select to authenticated
  using (
    private.arvo_can_access_workflow(workflow_id)
    and private.arvo_modul_acik(organization_id, 'operations')
  );

drop policy if exists "operation comments readable by assigned members" on public.operation_workflow_comments;
create policy "operation comments readable by assigned members" on public.operation_workflow_comments
  as permissive for select to authenticated
  using (
    private.arvo_can_access_workflow(workflow_id)
    and private.arvo_modul_acik(organization_id, 'operations')
  );

drop policy if exists "workflow_members_read_customer_files" on public.operation_customer_files;
create policy "workflow_members_read_customer_files" on public.operation_customer_files
  as permissive for select to authenticated
  using (
    private.arvo_can_access_workflow(workflow_id)
    and private.arvo_modul_acik(organization_id, 'operations')
  );

-- ---------- İNSAN KAYNAKLARI ----------
/*
  Prim kayıtlarında mevcut kural iki yönlü: yetkili üye hepsini, personel
  KENDİ primini görüyor. İkisi de korunuyor; modül kapısı üstüne ekleniyor.
  Operasyon primi operasyon ekranından da okunuyor: kapı "İK VEYA operasyon".
*/
drop policy if exists "commission payments readable" on public.hr_commission_payments;
create policy "commission payments readable" on public.hr_commission_payments
  as permissive for select to authenticated
  using (
    (private.arvo_is_privileged_member(organization_id)
      or exists (select 1 from public.hr_employees e
        where e.id = hr_commission_payments.employee_id
          and e.organization_id = hr_commission_payments.organization_id
          and e.user_id = (select auth.uid())))
    and private.arvo_modul_acik(organization_id, 'hr')
  );

drop policy if exists "privileged members read commission rate history" on public.hr_employee_commission_rates;
create policy "privileged members read commission rate history" on public.hr_employee_commission_rates
  as permissive for select to authenticated
  using (
    private.arvo_is_privileged_member(organization_id)
    and private.arvo_modul_acik(organization_id, 'hr')
  );

drop policy if exists "operation commissions readable" on public.hr_operation_commissions;
create policy "operation commissions readable" on public.hr_operation_commissions
  as permissive for select to authenticated
  using (
    (private.arvo_is_privileged_member(organization_id)
      or exists (select 1 from public.hr_employees e
        where e.id = hr_operation_commissions.employee_id
          and e.organization_id = hr_operation_commissions.organization_id
          and e.user_id = (select auth.uid())))
    and (private.arvo_modul_acik(organization_id, 'hr')
      or private.arvo_modul_acik(organization_id, 'operations'))
  );

notify pgrst, 'reload schema';
