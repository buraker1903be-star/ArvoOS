-- Müşteri portalı dosyaları: operasyon ekibi, işe bağlı dosyaları müşterinin
-- takip ekranına (/takip, /durum/<kurum>, /is-durumu) gönderir. Ödemesi
-- tamamlanmayan müşteri "ödeme tamamlanınca açılır" kuralındaki dosyayı
-- göremez de indiremez de: kilit arayüzde değil, burada uygulanır.
--
-- Parçalar
--  1) Özel depolama kovası "customer-portal-files" (public = false, 50 MB).
--     Yol: <organization_id>/<workflow_id>/<rastgele-uuid>.<uzantı>
--     Yalnızca işe erişimi olan kurum üyeleri (yönetici ya da işin
--     sorumlusu — private.arvo_can_access_workflow) okur/yükler/siler.
--     anon'un kovada HİÇBİR politikası yoktur.
--  2) public.operation_customer_files: dosya kaydı, erişim kuralı, not,
--     yumuşak silme. Fiziksel silme yok (RLS'de delete politikası yok).
--  3) private.arvo_contract_payment_summary: "ödeme tamamlandı" için TEK
--     kaynak. Takip ekranındaki ödeme kartı (lookup_contract_by_tracking_code_global)
--     da artık bu fonksiyonu kullanır; kart ile kilit hiç ayrışamaz.
--  4) public.list_customer_portal_files(kod): takip koduyla dosya listesi,
--     kilit durumu, kalan bakiye, ilk ödenmemiş taksidin PAYTR bağlantısı.
--     storage_path DÖNDÜRMEZ.
--  5) public.authorize_customer_portal_file_download(kod, dosya, ip, ua):
--     yalnızca service_role çağırabilir (sunucu rotası). Kod ↔ dosya
--     eşleşmesi, silinmemiş olma, kilit ve hız sınırını denetler; her
--     denemeyi public.operation_customer_file_downloads'a yazar. Yol
--     yalnızca "ok" sonucunda döner; sunucu 60 sn'lik imzalı URL üretir.
--  6) public.portal_workflow_payment_status(iş): panel kartı için ödeme
--     durumu. Tutarlar yalnızca owner/admin/manager'a döner (operasyon
--     ekibi fiyat görmez — iş detayındaki mevcut kural).
--
-- "Ödeme tamamlandı" kuralı (portal_payment_settled):
--   ödenen   = min(sözleşme tutarı, max(0, cari alacaklar − iade düzeltmeleri))
--              (sözleşmenin cari hesabı / party_id üzerinden; takip kartının
--              20260831141241'den beri kullandığı hesap)
--   kalan    = max(0, sözleşme tutarı − ödenen)
--   tamam    = kalan <= 0
--   * Tutarı 0 olan sözleşme: tamam (kilit yok).
--   * Cari hesabı (party_id) olmayan, tutarı > 0 sözleşme: ödenen 0 → kilitli.
--   * Taksit kapatma (arvo_reconcile_party_installments) ve PAYTR tahsilatı
--     cariye alacak yazdığı için taksit/plan durumu bu hesapla örtüşür;
--     ayrı bir "fatura ödendi" istisnası YOKTUR — aksi hâlde kart "kalan
--     ₺X" derken dosya açılabilirdi.
--   * Sözleşmeye bağlı olmayan iş: müşterinin takip kodu yoktur, portal
--     kapalıdır (panel yükleme yapmaz).
--
-- Tekrar çalıştırılabilir (idempotent).

-- 1) Kova --------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-portal-files',
  'customer-portal-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip', 'application/x-zip-compressed',
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'text/plain', 'text/csv'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Kovadaki nesneler: yalnızca işe erişimi olan kurum üyeleri. Yolun ilk iki
-- klasörü (kurum, iş) aynı kurumdaki gerçek bir işe ait olmalı.
drop policy if exists "customer_portal_files_select" on storage.objects;
create policy "customer_portal_files_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'customer-portal-files'
  and exists (
    select 1 from public.operation_workflows w
    where w.organization_id::text = (storage.foldername(name))[1]
      and w.id::text = (storage.foldername(name))[2]
      and private.arvo_can_access_workflow(w.id)
  )
);

drop policy if exists "customer_portal_files_insert" on storage.objects;
create policy "customer_portal_files_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'customer-portal-files'
  and exists (
    select 1 from public.operation_workflows w
    where w.organization_id::text = (storage.foldername(name))[1]
      and w.id::text = (storage.foldername(name))[2]
      and private.arvo_can_access_workflow(w.id)
  )
);

-- Yalnızca kaydı oluşturulamayan yarım yüklemelerin temizliği için.
drop policy if exists "customer_portal_files_delete" on storage.objects;
create policy "customer_portal_files_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'customer-portal-files'
  and exists (
    select 1 from public.operation_workflows w
    where w.organization_id::text = (storage.foldername(name))[1]
      and w.id::text = (storage.foldername(name))[2]
      and private.arvo_can_access_workflow(w.id)
  )
);

-- 2) Dosya kayıtları -----------------------------------------------------------
create table if not exists public.operation_customer_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  workflow_id uuid not null references public.operation_workflows(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (char_length(mime_type) between 3 and 120),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  note text check (note is null or char_length(note) <= 500),
  access_rule text not null default 'after_full_payment'
    check (access_rule in ('after_full_payment', 'immediate')),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,
  constraint operation_customer_files_path_scope
    check (storage_path like organization_id::text || '/' || workflow_id::text || '/%')
);

create index if not exists operation_customer_files_workflow_idx
  on public.operation_customer_files(workflow_id, created_at desc)
  where deleted_at is null;

-- Yükleyen ve silen sunucuda damgalanır; kaldırılan dosya geri açılamaz ya
-- da değiştirilemez.
create or replace function public.guard_operation_customer_file()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := (select auth.uid());
    new.created_at := now();
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'Kaldırılan dosya değiştirilemez.' using errcode = 'check_violation';
  end if;
  if new.id is distinct from old.id
     or new.organization_id is distinct from old.organization_id
     or new.workflow_id is distinct from old.workflow_id
     or new.storage_path is distinct from old.storage_path
     or new.file_name is distinct from old.file_name
     or new.mime_type is distinct from old.mime_type
     or new.size_bytes is distinct from old.size_bytes
     or new.uploaded_by is distinct from old.uploaded_by
     or new.created_at is distinct from old.created_at then
    raise exception 'Dosyanın yalnızca erişim kuralı ve notu değiştirilebilir.' using errcode = 'check_violation';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.deleted_by := (select auth.uid());
  else
    new.deleted_by := null;
  end if;
  return new;
end $$;

revoke all on function public.guard_operation_customer_file() from public, anon, authenticated;

drop trigger if exists guard_operation_customer_file on public.operation_customer_files;
create trigger guard_operation_customer_file
before insert or update on public.operation_customer_files
for each row execute function public.guard_operation_customer_file();

alter table public.operation_customer_files enable row level security;
revoke all on table public.operation_customer_files from public, anon, authenticated;
grant select, insert on table public.operation_customer_files to authenticated;
grant update (access_rule, note, deleted_at) on table public.operation_customer_files to authenticated;

drop policy if exists "workflow_members_read_customer_files" on public.operation_customer_files;
create policy "workflow_members_read_customer_files"
on public.operation_customer_files for select to authenticated
using (private.arvo_can_access_workflow(workflow_id));

drop policy if exists "workflow_members_add_customer_files" on public.operation_customer_files;
create policy "workflow_members_add_customer_files"
on public.operation_customer_files for insert to authenticated
with check (
  private.arvo_can_access_workflow(workflow_id)
  and exists (
    select 1 from public.operation_workflows w
    where w.id = operation_customer_files.workflow_id
      and w.organization_id = operation_customer_files.organization_id
  )
);

drop policy if exists "workflow_members_update_customer_files" on public.operation_customer_files;
create policy "workflow_members_update_customer_files"
on public.operation_customer_files for update to authenticated
using (private.arvo_can_access_workflow(workflow_id) and deleted_at is null)
with check (private.arvo_can_access_workflow(workflow_id));

-- 3) İndirme / erişim günlüğü ------------------------------------------------------
-- Her müşteri denemesi (izin, kilit, ret, hız sınırı) yazılır; hız sınırı
-- da buradan sayılır. file_id bilerek yabancı anahtar değil: var olmayan
-- dosya kimliğiyle yapılan denemeler de sayılmalı.
create table if not exists public.operation_customer_file_downloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  workflow_id uuid references public.operation_workflows(id) on delete cascade,
  file_id uuid,
  outcome text not null check (outcome in ('granted', 'locked', 'denied', 'rate_limited')),
  client_ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists operation_customer_file_downloads_file_idx
  on public.operation_customer_file_downloads(file_id, created_at desc);
create index if not exists operation_customer_file_downloads_ip_idx
  on public.operation_customer_file_downloads(client_ip, created_at desc)
  where outcome = 'denied';

alter table public.operation_customer_file_downloads enable row level security;
revoke all on table public.operation_customer_file_downloads from public, anon, authenticated;
grant select on table public.operation_customer_file_downloads to authenticated;

drop policy if exists "workflow_members_read_customer_file_downloads" on public.operation_customer_file_downloads;
create policy "workflow_members_read_customer_file_downloads"
on public.operation_customer_file_downloads for select to authenticated
using (workflow_id is not null and private.arvo_can_access_workflow(workflow_id));

-- 4) Ödeme durumu: tek kaynak -------------------------------------------------------
create or replace function private.arvo_contract_payment_summary(p_contract_id uuid)
returns table (total_amount bigint, paid_amount bigint, remaining_amount bigint, settled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(c.amount, 0)::bigint,
    coalesce(collections.net_paid, 0)::bigint,
    greatest(0, coalesce(c.amount, 0) - coalesce(collections.net_paid, 0))::bigint,
    greatest(0, coalesce(c.amount, 0) - coalesce(collections.net_paid, 0)) <= 0
  from public.crm_contracts c
  left join lateral (
    select least(
      coalesce(c.amount, 0),
      greatest(
        0,
        coalesce(sum(ae.amount) filter (where ae.entry_type = 'credit'), 0)
        - coalesce(sum(ae.amount) filter (
            where ae.entry_type = 'debit' and ae.source_type = 'adjustment'
          ), 0)
      )
    )::bigint as net_paid
    from public.account_entries ae
    where ae.organization_id = c.organization_id
      and ae.party_id = c.party_id
  ) collections on c.party_id is not null
  where c.id = p_contract_id;
$$;

revoke all on function private.arvo_contract_payment_summary(uuid) from public, anon, authenticated;

create or replace function public.portal_payment_settled(p_workflow_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pay.settled
    from public.operation_workflows w
    join public.crm_contracts c
      on c.organization_id = w.organization_id
     and (c.id = w.contract_id or c.workflow_id = w.id)
    cross join lateral private.arvo_contract_payment_summary(c.id) pay
    where w.id = p_workflow_id
    order by (c.id = w.contract_id) is true desc
    limit 1
  ), false);
$$;

revoke all on function public.portal_payment_settled(uuid) from public, anon, authenticated;
grant execute on function public.portal_payment_settled(uuid) to service_role;

-- Takip kartı aynı hesabı kullansın (20260912190000'deki tanımla birebir
-- aynı çıktı; yalnızca tahsilat hesabı ortak fonksiyona taşındı).
create or replace function public.lookup_contract_by_tracking_code_global(
  p_tracking_code text
)
returns table (
  contract_no text,
  contract_title text,
  contract_status text,
  workflow_status text,
  last_update timestamptz,
  total_amount bigint,
  paid_amount bigint,
  remaining_amount bigint,
  progress_percentage integer,
  organization_name text,
  organization_logo_url text,
  organization_primary_color text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.contract_no,
    c.title,
    c.status,
    case when w.status = 'archived' then 'completed' else w.status end as workflow_status,
    coalesce(w.updated_at, c.updated_at, c.created_at) as last_update,
    c.amount as total_amount,
    coalesce(pay.paid_amount, 0) as paid_amount,
    coalesce(pay.remaining_amount, greatest(0, c.amount)) as remaining_amount,
    coalesce(steps.progress_percentage, 0) as progress_percentage,
    org.name,
    org.logo_url,
    org.primary_color
  from public.crm_contracts c
  join public.organizations org on org.id = c.organization_id
  left join public.operation_workflows w on w.contract_id = c.id
  left join lateral private.arvo_contract_payment_summary(c.id) pay on true
  left join lateral (
    select round(
      100.0 * count(*) filter (where os.is_completed) / nullif(count(*), 0)
    )::int as progress_percentage
    from public.operation_steps os
    where os.workflow_id = w.id
  ) steps on true
  where c.tracking_code = upper(trim(p_tracking_code))
    and c.status in ('signed', 'completed')
  limit 1;
$$;

revoke all on function public.lookup_contract_by_tracking_code_global(text) from public;
grant execute on function public.lookup_contract_by_tracking_code_global(text) to anon, authenticated;

-- 5) Panel: işin ödeme durumu -------------------------------------------------------
create or replace function public.portal_workflow_payment_status(p_workflow_id uuid)
returns table (
  has_contract boolean,
  settled boolean,
  total_amount bigint,
  paid_amount bigint,
  remaining_amount bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  target_contract uuid;
  can_see_amounts boolean;
  pay record;
begin
  if p_workflow_id is null or not private.arvo_can_access_workflow(p_workflow_id) then
    return;
  end if;

  select w.organization_id,
         coalesce(
           (select c.id from public.crm_contracts c
             where c.id = w.contract_id and c.organization_id = w.organization_id),
           (select c.id from public.crm_contracts c
             where c.workflow_id = w.id and c.organization_id = w.organization_id
             order by c.created_at desc limit 1)
         )
    into target_org, target_contract
  from public.operation_workflows w
  where w.id = p_workflow_id;

  if target_contract is null then
    has_contract := false;
    settled := false;
    return next;
    return;
  end if;

  select * into pay from private.arvo_contract_payment_summary(target_contract);
  can_see_amounts := private.arvo_is_privileged_member(target_org);

  has_contract := true;
  settled := coalesce(pay.settled, false);
  total_amount := case when can_see_amounts then pay.total_amount end;
  paid_amount := case when can_see_amounts then pay.paid_amount end;
  remaining_amount := case when can_see_amounts then pay.remaining_amount end;
  return next;
end $$;

revoke all on function public.portal_workflow_payment_status(uuid) from public, anon;
grant execute on function public.portal_workflow_payment_status(uuid) to authenticated;

-- 6) Müşteri: takip koduyla dosya listesi -------------------------------------------
-- Takip kodu mesajlaşmayla aynı biçimde normalize edilir ve sözleşme
-- imzalı/tamamlanmış olmalıdır. Dosya, sözleşmeye bağlı işe (iki yönlü
-- bağlantının herhangi biri) ve aynı kuruma ait olmalıdır. Arşivlenen iş
-- müşteri için tamamlanmış iştir; dosyaları görünmeye devam eder.
create or replace function public.list_customer_portal_files(p_tracking_code text)
returns table (
  id uuid,
  file_name text,
  mime_type text,
  size_bytes bigint,
  note text,
  created_at timestamptz,
  locked boolean,
  total_amount bigint,
  paid_amount bigint,
  remaining_amount bigint,
  payment_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  with target as (
    select c.id, c.organization_id, c.workflow_id
    from public.crm_contracts c
    where c.tracking_code = upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'))
      and char_length(coalesce(c.tracking_code, '')) >= 6
      and c.status in ('signed', 'completed')
    limit 1
  ),
  pay as (
    select t.id as contract_id, s.*
    from target t
    cross join lateral private.arvo_contract_payment_summary(t.id) s
  ),
  link as (
    select i.payment_url
    from target t
    join public.payment_plans p on p.contract_id = t.id and p.organization_id = t.organization_id
    join public.payment_installments i on i.payment_plan_id = p.id
    where i.status in ('pending', 'overdue')
      and i.payment_url like 'https://%'
    order by i.due_date nulls last, i.installment_no
    limit 1
  )
  select
    f.id,
    f.file_name,
    f.mime_type,
    f.size_bytes,
    f.note,
    f.created_at,
    (f.access_rule = 'after_full_payment' and not coalesce(pay.settled, false)) as locked,
    pay.total_amount,
    pay.paid_amount,
    pay.remaining_amount,
    case when not coalesce(pay.settled, false) then (select link.payment_url from link) end as payment_url
  from target t
  join pay on pay.contract_id = t.id
  join public.operation_customer_files f
    on f.organization_id = t.organization_id
   and f.deleted_at is null
   and (
     f.workflow_id = t.workflow_id
     or exists (
       select 1 from public.operation_workflows w
       where w.id = f.workflow_id and w.contract_id = t.id and w.organization_id = t.organization_id
     )
   )
  order by f.created_at desc
  limit 100;
$$;

revoke all on function public.list_customer_portal_files(text) from public;
grant execute on function public.list_customer_portal_files(text) to anon, authenticated;

-- 7) Müşteri: indirme yetkisi (yalnızca sunucu / service_role) ------------------------
-- Sonuç: ok | locked | not_found | rate_limited. Hata fırlatmak yerine sonuç
-- döner ki başarısız deneme günlüğe yazılıp hız sınırında sayılsın.
-- Hız sınırları: aynı dosyaya 15 dk'da 10 hatalı kod, aynı IP'den 15 dk'da
-- 30 hatalı deneme, aynı dosyaya 10 dk'da 30 başarılı indirme.
create or replace function public.authorize_customer_portal_file_download(
  p_tracking_code text,
  p_file_id uuid,
  p_client_ip text default null,
  p_user_agent text default null
)
returns table (outcome text, storage_path text, file_name text, mime_type text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clean_code text := upper(regexp_replace(trim(coalesce(p_tracking_code, '')), '[^A-Za-z0-9]', '', 'g'));
  clean_ip text := nullif(left(trim(coalesce(p_client_ip, '')), 64), '');
  clean_ua text := nullif(left(coalesce(p_user_agent, ''), 500), '');
  target_file public.operation_customer_files%rowtype;
  target_contract uuid;
  is_settled boolean;
begin
  if p_file_id is not null then
    select f.* into target_file
    from public.operation_customer_files f
    where f.id = p_file_id;
  end if;

  if (
    select count(*) from public.operation_customer_file_downloads d
    where d.file_id = p_file_id and d.outcome = 'denied'
      and d.created_at > now() - interval '15 minutes'
  ) >= 10 or (
    clean_ip is not null and (
      select count(*) from public.operation_customer_file_downloads d
      where d.client_ip = clean_ip and d.outcome = 'denied'
        and d.created_at > now() - interval '15 minutes'
    ) >= 30
  ) or (
    select count(*) from public.operation_customer_file_downloads d
    where d.file_id = p_file_id and d.outcome = 'granted'
      and d.created_at > now() - interval '10 minutes'
  ) >= 30 then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'rate_limited', clean_ip, clean_ua);
    return query select 'rate_limited'::text, null::text, null::text, null::text;
    return;
  end if;

  if target_file.id is not null and target_file.deleted_at is null and char_length(clean_code) >= 6 then
    select c.id into target_contract
    from public.crm_contracts c
    where c.tracking_code = clean_code
      and c.status in ('signed', 'completed')
      and c.organization_id = target_file.organization_id
      and (
        c.workflow_id = target_file.workflow_id
        or exists (
          select 1 from public.operation_workflows w
          where w.id = target_file.workflow_id and w.contract_id = c.id
        )
      )
    limit 1;
  end if;

  if target_contract is null then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'denied', clean_ip, clean_ua);
    return query select 'not_found'::text, null::text, null::text, null::text;
    return;
  end if;

  select s.settled into is_settled from private.arvo_contract_payment_summary(target_contract) s;

  if target_file.access_rule = 'after_full_payment' and not coalesce(is_settled, false) then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'locked', clean_ip, clean_ua);
    return query select 'locked'::text, null::text, target_file.file_name, null::text;
    return;
  end if;

  insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
  values (target_file.organization_id, target_file.workflow_id, p_file_id, 'granted', clean_ip, clean_ua);
  return query select 'ok'::text, target_file.storage_path, target_file.file_name, target_file.mime_type;
end $$;

revoke all on function public.authorize_customer_portal_file_download(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.authorize_customer_portal_file_download(text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Doğrulama (Supabase SQL editöründe ayrı çalıştırın):
--
-- select id, public, file_size_limit from storage.buckets where id = 'customer-portal-files';
--   -> public = false, 52428800
-- select policyname, roles from pg_policies where tablename = 'objects' and policyname like 'customer_portal_files_%';
--   -> üç politika, yalnızca {authenticated}
-- select has_function_privilege('anon', 'public.authorize_customer_portal_file_download(text,uuid,text,text)', 'execute');
--   -> false
-- ---------------------------------------------------------------------------
