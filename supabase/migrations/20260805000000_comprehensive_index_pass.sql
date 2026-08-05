-- Kapsamlı performans taraması: panelin HER sayfa açılışında sorgulanan
-- temel tablolarda (organization_memberships, organization_modules,
-- hr_employees) hiç indeks yoktu — bu genel yavaşlığın en büyük sebebi
-- olabilir. Ayrıca sık kullanılan diğer birkaç tabloyu da tamamlıyoruz.

-- Her sayfa açılışında getPanelContext() -> get_my_workspaces() bu tabloyu
-- user_id'ye göre arar; birincil anahtar (organization_id, user_id) bu
-- yönde kullanılamaz, ayrı bir indeks gerekiyor.
create index if not exists organization_memberships_user_idx
  on public.organization_memberships (user_id, organization_id)
  where is_active = true;

-- Her sayfa açılışında hangi modüllerin aktif olduğunu bulmak için.
create index if not exists organization_modules_org_idx
  on public.organization_modules (organization_id)
  where is_enabled = true;

-- Personel listeleri (CRM temsilci ataması, İK, Takvim, Raporlar prim
-- zinciri) sürekli organization_id ve user_id ile filtreleniyor.
create index if not exists hr_employees_org_idx
  on public.hr_employees (organization_id, employment_status);

create index if not exists hr_employees_user_idx
  on public.hr_employees (user_id)
  where user_id is not null;

create index if not exists hr_employees_org_sales_idx
  on public.hr_employees (organization_id, can_receive_sales_requests)
  where employment_status = 'active';

create index if not exists hr_departments_org_idx
  on public.hr_departments (organization_id);

-- Teklif listesi ve dedup hesapları.
create index if not exists crm_proposals_org_idx
  on public.crm_proposals (organization_id, created_at desc);

create index if not exists crm_proposals_opportunity_idx
  on public.crm_proposals (opportunity_id);

-- CRM pipeline aşama tanımları.
create index if not exists organization_crm_stages_org_idx
  on public.organization_crm_stages (organization_id);

-- Operasyon yorumları (iş detay sayfası).
create index if not exists operation_workflow_comments_workflow_idx
  on public.operation_workflow_comments (workflow_id, created_at desc);
