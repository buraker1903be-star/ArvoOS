/*
  SÖZLEŞME LİSTESİ GÖRÜNÜMÜ.

  Teklif listesiyle aynı gerekçe (bkz. 20261010210835): sayfa kurumun
  BÜTÜN sözleşmelerini fırsat kaydıyla çekip bellekte süzüyor, sonra
  bağlı iş akışlarının durumunu ikinci bir sorguyla okuyup grubu
  hesaplıyor. Süzme, sayma ve sayfalama sunucuda yapılabilsin diye
  üçü tek düz yüzeyde birleşiyor.

  GRUP KURALI BURADA DA VAR ama kopya değil, ikizi: kural üç tabloya
  birden baktığı için üretilmiş sütuna sığmıyor (üretilmiş sütun
  yalnızca kendi satırını görebilir). İki kopyanın aynı kaldığını
  tests/fixtures/sozlesme-gruplari.json üzerinden iki test birden
  sınıyor: biri lib/sozlesme-grubu.ts'i, öteki bu sütunu.

  İŞ AKIŞI SOL BİRLEŞİMLE: iş açılmamış sözleşme listeden düşmemeli.
  Kullanıcının operasyon modülüne erişimi yoksa RLS iş satırını
  eliyor ve durum null kalıyor — sayfa bugün de aynı şeyi yapıyor
  (iş durumunu kendi oturumuyla okuyor), yani davranış değişmiyor.

  GÜVENLİK: security_invoker; RLS çağıranın kendi yetkisiyle işliyor.
*/

create or replace view public.crm_sozlesme_liste
with (security_invoker = true, security_barrier = true) as
  select
    c.id,
    c.organization_id,
    c.opportunity_id,
    c.contract_no,
    c.title,
    c.amount,
    c.currency,
    c.due_date,
    c.status,
    c.sent_at,
    c.signed_at,
    c.view_count,
    c.workflow_id,
    c.created_at,
    case
      when c.status = 'rejected' then 'rejected'
      when c.status = 'cancelled' then 'cancelled'
      when c.status = 'completed'
        or (c.workflow_id is not null and w.status in ('completed', 'archived')) then 'tamam'
      when c.status = 'signed' then case when c.workflow_id is not null then 'operasyonda' else 'imzali' end
      when c.status = 'sent' then 'sent'
      else 'draft'
    end as sozlesme_grubu,
    w.status as is_durumu,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    private.arvo_search_digits(o.contact_phone) as telefon_rakamlari,
    o.assigned_employee_id,
    o.request_details
  from public.crm_contracts c
  join public.crm_opportunities o on o.id = c.opportunity_id
  left join public.operation_workflows w on w.id = c.workflow_id;

revoke all on public.crm_sozlesme_liste from public, anon;
grant select on public.crm_sozlesme_liste to authenticated, service_role;

notify pgrst, 'reload schema';
