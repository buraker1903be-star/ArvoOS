/*
  TALEP LİSTESİNDEKİ YORUM YAN SORGUSU DİZİNE OTURMUYORDU.

  Görünüm (20261011122651) her talep için son yorum zamanını yan
  sorguyla alıyor; süzgeç yalnızca `opportunity_id` idi. Yorum
  tablosunun dizini `crm_internal_comments_chain_idx
  (organization_id, opportunity_id, created_at DESC)`: BAŞ sütun
  bağlanmadığı için dizin sıralamasından yararlanılamıyor ve `max()`
  o talebin bütün yorumlarını tek tek okuyor.

  Ölçüm (PGlite, 400 talep × 50 yorum = 20 000 satır, listenin ilk
  sayfası): 188 ms → 4 ms, yığın okuması 20 000 → 400. Kurum sütunu da
  bağlanınca plan "dizinden ilk satırı al"a (Limit 1) dönüyor. Fark
  talep sayısıyla büyüyor: yan sorgu sayfalamadan ÖNCE, kurumun her
  talebi için bir kez işliyor.

  SONUÇ DEĞİŞMİYOR: yorumun SELECT politikası zaten
  `organization_id = private.arvo_firsat_kurumu(opportunity_id)`
  diyor — görünümün dönebildiği her yorumun kurumu, fırsatın kurumu.
  Paneldeki iki okuma yolu (last-contact.ts, internal-comments.tsx) da
  bu çifti birlikte süzüyor; aradan çıkan yalnızca bu görünümdü.

  GÜVENLİK: `security_invoker` ve `security_barrier` yeniden
  yazılıyor. Görünümü değiştiren migration bunları açıkça taşımazsa,
  invoker olmayan bir görünüm tablo RLS'ini atlar; dökümün bu ayarı bir
  kez düşürdüğü görüldü (bkz. AGENTS.md).
*/

create or replace view public.crm_talep_liste
with (security_invoker = true, security_barrier = true) as
  select
    o.id,
    o.organization_id,
    o.title,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    private.arvo_search_digits(o.contact_phone) as telefon_rakamlari,
    o.stage,
    o.estimated_value,
    o.expected_close_date,
    o.source,
    o.notes,
    o.request_details,
    nullif(btrim(coalesce(o.request_details ->> 'service_type', '')), '') as hizmet_turu,
    o.assigned_employee_id,
    p.full_name as temsilci_adi,
    o.lost_reason,
    o.created_at,
    o.updated_at,
    y.son_yorum_at
  from public.crm_opportunities o
  left join public.hr_employees p on p.id = o.assigned_employee_id
  left join lateral (
    select max(c.created_at) as son_yorum_at
    from public.crm_internal_comments c
    where c.organization_id = o.organization_id and c.opportunity_id = o.id
  ) y on true;

revoke all on public.crm_talep_liste from public, anon;
grant select on public.crm_talep_liste to authenticated, service_role;

notify pgrst, 'reload schema';
