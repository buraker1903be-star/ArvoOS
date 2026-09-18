-- ============================================================
-- İK ve taksit tablolarında yazma yetkisi uygulamayla hizalanıyor
--
-- Uygulama bu tablolara YALNIZCA Kurum Sahibi ve Yönetici (owner/admin) ile
-- yazıyor (app/panel/hr/actions.ts hrContext, app/panel/finance/actions.ts
-- financeContext, paytr-actions.ts). Ama RLS politikaları "kurumun herhangi
-- bir aktif üyesi" (arvo_is_member) diyordu. Supabase'in anon anahtarı ve
-- kullanıcının oturum jetonu tarayıcıda olduğu için her üye veritabanı
-- API'sine doğrudan yazabiliyordu. Somut örnekler:
--
--  - Satış personeli kendi hr_employees.commission_rate'ini %100 yapabilir;
--    collect_payment_installment prim tutarını tahsilat anında bu orandan
--    hesaplıyor.
--  - hr_sales_commissions kayıtlarını ekleyip tutarını değiştirebilir,
--    "paid" işaretleyebilir; bütün kurumun prim kayıtlarını okuyabilir.
--  - Taksitlerin tutarını, vadesini ve durumunu, ödeme planlarını
--    değiştirebilir; herhangi bir çalışanı ya da departmanı silebilir;
--    herhangi bir izin talebini onaylayabilir.
--
-- Bu tablolara uygulama dışında yazan yollar etkilenmez: tahsilat, imza,
-- ek protokol yanıtı ve prim tahakkuku security definer fonksiyonlardır
-- (collect_payment_installment, sign_crm_contract, arvo_respond_contract_
-- addendum, accrue_operation_commission). Taksit uzlaştırma tetikleyicisi
-- account_entries'e bağlı ve oraya zaten yalnızca owner/admin yazabiliyor.
--
-- OKUMA değişmiyor (üyeler çalışanları, taksitleri, planları görmeye devam
-- eder); tek istisna prim kayıtları: artık yönetici rolleri ya da kaydın
-- sahibi çalışan görür — operasyon primleriyle (hr_operation_commissions)
-- aynı kural. Uygulama hr_sales_commissions'ı hiç okumuyor.
-- ============================================================

-- Owner/admin: uygulamanın İK ve finans yazma kuralıyla aynı.
create or replace function private.arvo_is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.is_active
      and m.role::text in ('owner', 'admin')
  );
$$;
revoke all on function private.arvo_is_org_admin(uuid) from public, anon;
grant execute on function private.arvo_is_org_admin(uuid) to authenticated, service_role;

-- --- hr_employees ------------------------------------------------------
drop policy if exists "members manage hr employees" on public.hr_employees;
create policy "admins insert hr employees" on public.hr_employees
  for insert to authenticated with check (private.arvo_is_org_admin(organization_id));
create policy "admins update hr employees" on public.hr_employees
  for update to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));
create policy "admins delete hr employees" on public.hr_employees
  for delete to authenticated using (private.arvo_is_org_admin(organization_id));
-- "members read hr employees" (select) olduğu gibi kalıyor.

-- --- hr_departments ----------------------------------------------------
drop policy if exists "members manage hr departments" on public.hr_departments;
create policy "admins insert hr departments" on public.hr_departments
  for insert to authenticated with check (private.arvo_is_org_admin(organization_id));
create policy "admins update hr departments" on public.hr_departments
  for update to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));
create policy "admins delete hr departments" on public.hr_departments
  for delete to authenticated using (private.arvo_is_org_admin(organization_id));
-- "members read hr departments" (select) olduğu gibi kalıyor.

-- --- hr_sales_commissions ----------------------------------------------
-- Operasyon primleriyle aynı kural: yönetim rolleri yönetir; okuma yönetim
-- rolleri ya da kaydın sahibi çalışan.
drop policy if exists "members manage hr sales commissions" on public.hr_sales_commissions;
drop policy if exists "members read hr sales commissions" on public.hr_sales_commissions;
create policy "sales commissions manageable by managers" on public.hr_sales_commissions
  for all to authenticated
  using (private.arvo_is_privileged_member(organization_id))
  with check (private.arvo_is_privileged_member(organization_id));
create policy "sales commissions readable" on public.hr_sales_commissions
  for select to authenticated
  using (
    private.arvo_is_privileged_member(organization_id)
    or exists (
      select 1 from public.hr_employees e
      where e.id = hr_sales_commissions.employee_id
        and e.organization_id = hr_sales_commissions.organization_id
        and e.user_id = (select auth.uid())
    )
  );

-- --- hr_leave_requests: onay/ret ---------------------------------------
drop policy if exists "members update hr leave requests" on public.hr_leave_requests;
create policy "managers update hr leave requests" on public.hr_leave_requests
  for update to authenticated
  using (private.arvo_is_privileged_member(organization_id))
  with check (private.arvo_is_privileged_member(organization_id));
-- Talep oluşturma ("members create hr leave requests") ve okuma değişmiyor.

-- --- payment_installments / payment_plans ------------------------------
drop policy if exists "members update payment installments" on public.payment_installments;
create policy "admins update payment installments" on public.payment_installments
  for update to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

drop policy if exists "members update payment plans" on public.payment_plans;
create policy "admins update payment plans" on public.payment_plans
  for update to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));
-- Okuma politikaları ("members read …") değişmiyor.

-- ============================================================
-- GERİ ALMA (gerekirse, yalnızca bu blok):
--   drop policy "admins insert hr employees" on public.hr_employees; … (yukarıda
--   eklenen her politika) ve eski politikaları yeniden oluşturun:
--   create policy "members manage hr employees" on public.hr_employees as permissive
--     for all to authenticated using (arvo_is_member(organization_id))
--     with check (arvo_is_member(organization_id));
--   (hr_departments, hr_sales_commissions için aynı kalıp; payment_installments,
--   payment_plans ve hr_leave_requests için "for update"; hr_sales_commissions
--   okuma: "members read hr sales commissions" using (arvo_is_member(organization_id)).)
-- ============================================================
