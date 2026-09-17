-- İptal edilen işin dosyaları müşteriye kapatılıyor.
--
-- SORUN
-- list_customer_portal_files ve authorize_customer_portal_file_download
-- yalnızca SÖZLEŞME durumuna bakıyordu ('signed' | 'completed'). İş akışının
-- durumu hiç denetlenmiyordu; iş panelden "iptal" yapıldıktan sonra müşteri
-- bütün portal dosyalarını görmeye ve indirmeye devam ediyordu.
--
-- İki yer birden değişmeli: listeyi filtrelemek tek başına yetmez, çünkü
-- indirme adresi dosya kimliğiyle doğrudan çağrılabiliyor.
--
-- 'archived' KAPSAM DIŞI: arşiv "tamamlandı ve dosyalandı" demek, teslim
-- edilmiş belgeler müşteride kalmalı. Yalnızca 'cancelled' kapatır.
--
-- Fonksiyonların geri kalanı 20260912203000'deki hâliyle birebir aynı.

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
   -- İPTAL EDİLEN İŞİN DOSYALARI MÜŞTERİYE KAPALI. Eskiden yalnızca
   -- sözleşme durumuna bakılıyordu; iş "iptal" yapıldıktan sonra müşteri
   -- bütün portal dosyalarını görmeye ve indirmeye devam ediyordu.
   -- Arşiv kapsam dışı: "tamamlandı ve dosyalandı" demek, dosyalar durmalı.
   and not exists (
     select 1 from public.operation_workflows w
     where w.id = f.workflow_id and w.status = 'cancelled'
   )
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

  -- İptal edilen işin dosyası indirilemez. Listeyi filtrelemek tek başına
  -- yetmez: bu adres dosya kimliğiyle doğrudan çağrılabiliyor.
  if target_file.id is not null and exists (
    select 1 from public.operation_workflows w
    where w.id = target_file.workflow_id and w.status = 'cancelled'
  ) then
    insert into public.operation_customer_file_downloads (organization_id, workflow_id, file_id, outcome, client_ip, user_agent)
    values (target_file.organization_id, target_file.workflow_id, p_file_id, 'denied', clean_ip, clean_ua);
    return query select 'not_found'::text, null::text, null::text, null::text;
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

-- İzinler: "create or replace" mevcut izinleri korur, ama bu iki fonksiyonun
-- izinleri bugün değişti (20260917110000: anon kaldırıldı, service_role
-- eklendi). Açıkça yazmak, yeniden oluşturmanın sessizce eski duruma
-- dönmediğini garanti eder.
revoke execute on function public.list_customer_portal_files(text) from anon, authenticated;
revoke execute on function public.authorize_customer_portal_file_download(text, uuid, text, text) from anon, authenticated;
grant execute on function public.list_customer_portal_files(text) to service_role;
grant execute on function public.authorize_customer_portal_file_download(text, uuid, text, text) to service_role;
