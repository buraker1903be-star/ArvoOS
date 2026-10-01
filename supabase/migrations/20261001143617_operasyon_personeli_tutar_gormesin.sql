-- ============================================================
-- OPERASYON PERSONELİ TUTAR GÖRMESİN
--
-- Ekranda zaten gizliydi (portal_workflow_payment_status tutarları
-- yalnızca owner/admin/manager'a döndürüyor) ama VERİ açıktı: işe
-- atanmış bir 'member', kendi oturumuyla doğrudan sorgulayınca
-- crm_contracts.amount, crm_proposals.amount ve
-- crm_opportunities.estimated_value okuyabiliyordu. Ölçüldü.
--
-- Sebebi private.arvo_can_access_opportunity'nin üçüncü kolu: işin
-- sorumlusuna fırsatın TÜM SATIRINA erişim veriyor, RLS ise satır
-- bazlı — sütun gizleyemiyor.
--
-- ÇÖZÜM: satır erişimi tutarı görebilenlerle sınırlanıyor; operasyon
-- personeli aynı kayıtları tutar içermeyen GÖRÜNÜMLERDEN okuyor.
--
-- DİKKAT — yan etki zinciri: yorum ve kayıt geçmişi politikaları
-- fırsat satırına alt sorguyla bakıyor ("organization_id = (select
-- o.organization_id from crm_opportunities o …)"). Bu alt sorgu da
-- RLS'ten geçtiği için, satır erişimi daralınca operasyon personeli
-- KENDİ işinin yorumlarını ve kayıt geçmişini kaybederdi. O yüzden
-- bu alt sorgular security definer bir yardımcıya çevriliyor.
-- ============================================================

-- ---------- 1. Yardımcılar ----------

-- Fırsatın kurumu; RLS'e takılmadan. Politikaların içindeki alt
-- sorgular bunu kullanıyor.
create or replace function private.arvo_firsat_kurumu(p_firsat uuid)
returns uuid language sql stable security definer set search_path to ''
as $$ select o.organization_id from public.crm_opportunities o where o.id = p_firsat $$;

revoke all on function private.arvo_firsat_kurumu(uuid) from public, anon;
grant execute on function private.arvo_firsat_kurumu(uuid) to authenticated, service_role;

-- "Bu kullanıcı fırsatın TUTARINI görebilir mi?" — eski erişim
-- fonksiyonunun operasyon kolu olmadan hâli: yöneticiler ve fırsatın
-- satışçısı. Operasyon sorumlusu bilerek dışarıda.
create or replace function private.arvo_firsat_tutar_gorebilir(target_opportunity uuid)
returns boolean language sql stable security definer set search_path to ''
as $$ select exists (
  select 1
  from public.crm_opportunities o
  join public.organization_memberships m on m.organization_id = o.organization_id
    and m.user_id = (select auth.uid()) and m.is_active = true
  left join public.hr_employees sales_employee on sales_employee.id = o.assigned_employee_id
    and sales_employee.organization_id = o.organization_id
    and sales_employee.employment_status = 'active'
  where o.id = target_opportunity
    and (m.role::text in ('owner','admin','manager') or sales_employee.user_id = (select auth.uid()))
) $$;

revoke all on function private.arvo_firsat_tutar_gorebilir(uuid) from public, anon;
grant execute on function private.arvo_firsat_tutar_gorebilir(uuid) to authenticated, service_role;

-- ---------- 2. Tutarlı tabloların SELECT erişimi daralıyor ----------

drop policy if exists "members read assigned contracts" on public.crm_contracts;
create policy "members read assigned contracts" on public.crm_contracts
  as permissive for select to authenticated
  using (private.arvo_firsat_tutar_gorebilir(opportunity_id));

drop policy if exists members_read_assigned_crm_opportunities on public.crm_opportunities;
create policy members_read_assigned_crm_opportunities on public.crm_opportunities
  as permissive for select to authenticated
  using (private.arvo_firsat_tutar_gorebilir(id));

drop policy if exists "members read assigned proposals" on public.crm_proposals;
create policy "members read assigned proposals" on public.crm_proposals
  as permissive for select to authenticated
  using (private.arvo_firsat_tutar_gorebilir(opportunity_id)
    and (status = 'draft'
      or (status = 'sent' and (valid_until is null or valid_until >= ((now() at time zone 'Europe/Istanbul')::date)))
      or status = 'archived'
      or status in ('accepted','rejected')));

-- ---------- 3. Yorumlar ve kayıt geçmişi operasyonda açık kalsın ----------
-- Alt sorgular artık fırsat satırını OKUMUYOR; kurumu definer
-- yardımcıdan alıyor. Yetkiyi yine arvo_can_access_opportunity
-- (operasyon kolu dahil) belirliyor, yani davranış aynı.

drop policy if exists "assigned members read crm internal comments" on public.crm_internal_comments;
create policy "assigned members read crm internal comments" on public.crm_internal_comments
  as permissive for select to authenticated
  using (organization_id = private.arvo_firsat_kurumu(opportunity_id)
    and private.arvo_can_access_opportunity(opportunity_id));

drop policy if exists "assigned members write crm internal comments" on public.crm_internal_comments;
create policy "assigned members write crm internal comments" on public.crm_internal_comments
  as permissive for insert to authenticated
  with check (created_by = (select auth.uid())
    and organization_id = private.arvo_firsat_kurumu(opportunity_id)
    and private.arvo_can_access_opportunity(opportunity_id));

drop policy if exists "authors edit own crm internal comments" on public.crm_internal_comments;
create policy "authors edit own crm internal comments" on public.crm_internal_comments
  as permissive for update to authenticated
  using (created_by = (select auth.uid()) and private.arvo_can_access_opportunity(opportunity_id))
  with check (created_by = (select auth.uid())
    and organization_id = private.arvo_firsat_kurumu(opportunity_id)
    and private.arvo_can_access_opportunity(opportunity_id));

drop policy if exists activity_logs_select_crm_chain on public.activity_logs;
create policy activity_logs_select_crm_chain on public.activity_logs
  as permissive for select to authenticated
  using (entity_type in ('crm_opportunity','crm_proposal','crm_contract')
    and exists (
      select 1 from public.organization_memberships m
      where m.organization_id = activity_logs.organization_id
        and m.user_id = (select auth.uid()) and m.is_active = true)
    and private.arvo_firsat_kurumu(
          nullif(coalesce(activity_logs.metadata ->> 'opportunity_id', activity_logs.entity_id), '')::uuid
        ) = activity_logs.organization_id
    and private.arvo_can_access_opportunity(
          nullif(coalesce(activity_logs.metadata ->> 'opportunity_id', activity_logs.entity_id), '')::uuid
        ));

-- ---------- 4. Operasyonun okuma yolu: tutarsız görünümler ----------
-- Görünümler security definer (varsayılan): taban tablonun RLS'ini
-- atlıyorlar, kapıyı kendi where'leri tutuyor. Kapı eski erişim
-- fonksiyonu, yani operasyon sorumlusu KENDİ işinin künyesini
-- görmeye devam ediyor — sadece tutar sütunları hiç yok.
-- security_barrier: kullanıcının eklediği koşullar görünümün
-- kapısından önce çalışmasın.

create or replace view public.ops_contracts with (security_barrier = true) as
  select c.id, c.organization_id, c.opportunity_id, c.proposal_id, c.workflow_id,
         c.invoice_id, c.contract_no, c.title, c.status, c.tracking_code, c.share_token,
         c.start_date, c.due_date, c.signed_at, c.created_at, c.updated_at
  from public.crm_contracts c
  where private.arvo_can_access_opportunity(c.opportunity_id);

create or replace view public.ops_opportunities with (security_barrier = true) as
  select o.id, o.organization_id, o.title, o.customer_name, o.contact_email, o.contact_phone,
         o.stage, o.assigned_employee_id, o.created_at, o.updated_at
  from public.crm_opportunities o
  where private.arvo_can_access_opportunity(o.id);

create or replace view public.ops_proposals with (security_barrier = true) as
  select p.id, p.organization_id, p.opportunity_id, p.proposal_no, p.title, p.status, p.created_at
  from public.crm_proposals p
  where private.arvo_can_access_opportunity(p.opportunity_id);

revoke all on public.ops_contracts from public, anon;
revoke all on public.ops_opportunities from public, anon;
revoke all on public.ops_proposals from public, anon;
grant select on public.ops_contracts to authenticated, service_role;
grant select on public.ops_opportunities to authenticated, service_role;
grant select on public.ops_proposals to authenticated, service_role;

notify pgrst, 'reload schema';
