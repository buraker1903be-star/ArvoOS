/*
  TEKLİF LİSTESİ GÖRÜNÜMÜ.

  Teklifler ekranı kurumun BÜTÜN tekliflerini (fırsat kaydıyla birlikte)
  çekip bellekte süzüyor: durum grubu, arama ve temsilci süzgeci de,
  şerit sayıları da o diziden. Kayıt sayısı büyüdükçe yavaşlıyor ve
  PostgREST'in satır sınırına çarptığında sessizce YANLIŞ sayı
  gösterecek bir yol (npm run check:rakamlar tam bu sınıfı arıyor).

  Grup kuralı artık sütunda (crm_proposals.teklif_grubu). Kalan engel
  ARAMA: müşteri adı, e-postası ve telefonu fırsat kaydında ve
  PostgREST tek bir "or" içinde ana tabloyla gömülü tabloyu
  birleştiremiyor. Bu görünüm ikisini tek düz yüzeyde topluyor;
  süzme, sayma ve sayfalama sunucuda yapılabiliyor.

  GÜVENLİK: security_invoker — görünüm çağıranın kendi yetkisiyle
  okunuyor, yani crm_proposals ve crm_opportunities üzerindeki RLS
  aynen işliyor. Sayfanın bugün doğrudan yaptığı sorgunun gördüğünden
  fazlasını göstermiyor; tutarı görmemesi gereken rol için ops_*
  görünümleri ayrı duruyor ve bu görünüm onların yerine geçmiyor.

  Telefon araması için rakam sütunu: arvo_search_digits "+90 (532)
  111 22 33" ile "05321112233"ü aynı anahtara indiriyor. Görünüm
  çağıranın yetkisiyle işlediği için o işlevin EXECUTE'u panelin
  rolüne açılıyor — aksi hâlde liste "permission denied for function"
  ile düşer (10.10.2026'da teklif_grubu sütununda bu yaşandı).
*/

grant execute on function private.arvo_search_digits(text) to authenticated, service_role;

create or replace view public.crm_teklif_liste
with (security_invoker = true, security_barrier = true) as
  select
    p.id,
    p.organization_id,
    p.opportunity_id,
    p.proposal_no,
    p.title,
    p.amount,
    p.currency,
    p.valid_until,
    p.status,
    p.teklif_grubu,
    p.sent_at,
    p.view_count,
    p.created_at,
    p.revision_no,
    p.superseded_by,
    p.archived_at,
    p.archive_reason,
    o.customer_name,
    o.contact_email,
    o.contact_phone,
    private.arvo_search_digits(o.contact_phone) as telefon_rakamlari,
    o.assigned_employee_id,
    o.request_details
  from public.crm_proposals p
  join public.crm_opportunities o on o.id = p.opportunity_id;

revoke all on public.crm_teklif_liste from public, anon;
grant select on public.crm_teklif_liste to authenticated, service_role;

notify pgrst, 'reload schema';
