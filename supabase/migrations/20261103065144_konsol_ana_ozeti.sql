/*
  KONSOL ANA SAYFASI TEK ÇAĞRIDA (03.11.2026, hızlandırma).

  Ana sayfa açılışta Supabase'e otuz beşe yakın isteği AYNI ANDA
  gönderiyordu (02.11.2026'da hepsi paralel yapıldı). Tek bir isteğin
  olağan süresi ~85 ms iken bu sayfada en basit sayım (bu ayın yeni
  kurumu, head sorgusu) 300–490 ms sürüyordu: istekler veritabanı
  bağlantı havuzunda sıra bekliyor. Süre okumaların kendisinde değil,
  SAYISINDA.

  Burada toplananlar küçük iş listeleri ve sayımlar: bekleyen sözleşme,
  son kurulumlar, bekleyen proforma, askıdaki lisanslar, bu ayın yeni
  kurum ve abonesi, zamanı gelen takipler, yanıt bekleyen destek,
  14+14 günlük tahsilat penceresi, bekleyen ödeme bildirimleri ve
  kurucunun adı. On dört istek bire iniyor. Kiracı listesi ve ürün
  lisansları sayfalı okunduğu için (satır tavanı, lib/rapor-okuma)
  dışarıda kaldı.

  Yalnızca TAM YETKİLİ kurucuya: kısıtlı kurucu (lib/konsol-alanlari)
  bu ekranı görmüyor ve ödeme, destek, sözleşme bilgisi alanının
  dışında. Sunucu anahtarıyla değil kurucunun oturumuyla çağrılıyor,
  yetki kararı burada.

  Satırların biçimi PostgREST'in döndürdüğüyle aynı (to_jsonb): sayfa
  çağrı düşerse eski okumalara dönüyor ve iki yolun aynı veriyi aynı
  biçimde vermesi gerekiyor.
*/
create or replace function public.platform_konsol_ana_ozeti(
  p_ay_basi timestamptz,
  p_seri_basi timestamptz,
  p_bugun date,
  p_destek_durumlari text[]
)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  ben uuid := (select auth.uid());
begin
  if not (select private.kurucu_tam_yetkili()) then
    raise exception 'Tam yetkili kurucu gerekli' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'sozlesmeler', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'contract_no', r.contract_no, 'customer_name', r.customer_name,
               'amount', r.amount, 'currency', r.currency, 'created_at', r.created_at) order by r.created_at desc)
      from public.platform_subscription_requests r where r.status = 'pending'), '[]'::jsonb),
    'kurulum', coalesce((
      select jsonb_agg(to_jsonb(k) order by k.created_at desc) from (
        select l.id, l.organization_id, l.action, l.result, l.state, l.created_at
        from public.provisioning_audit_logs l order by l.created_at desc limit 6) k), '[]'::jsonb),
    'proformalar', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'proforma_no', p.proforma_no, 'musteri_adi', p.musteri_adi,
               'product', p.product, 'toplam', p.toplam, 'para_birimi', p.para_birimi,
               'gecerlilik_tarihi', p.gecerlilik_tarihi, 'gonderildi_at', p.gonderildi_at,
               'bildirildi_at', p.bildirildi_at, 'gonderim_hatasi', p.gonderim_hatasi) order by p.gecerlilik_tarihi asc)
      from public.platform_proformalari p where p.durum = 'bekliyor'), '[]'::jsonb),
    'aski_cekirdek', coalesce((
      select jsonb_agg(jsonb_build_object('organization_id', l.organization_id, 'suspended_at', l.suspended_at,
               'suspension_reason', l.suspension_reason))
      from public.organization_licenses l where l.license_status = 'suspended'), '[]'::jsonb),
    'aski_urun', coalesce((
      select jsonb_agg(jsonb_build_object('organization_id', l.organization_id, 'product', l.product,
               'suspended_at', l.suspended_at, 'suspension_reason', l.suspension_reason))
      from public.organization_product_licenses l where l.status = 'suspended'), '[]'::jsonb),
    'yeni_kurum', (select count(*) from public.organizations o
      where o.created_at >= p_ay_basi and o.kind <> 'internal' and o.grup_markasi = false),
    'yeni_abone', (select count(*) from public.product_subscribers s
      where s.kurum_id is null and s.created_at >= p_ay_basi),
    'takipler', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'organization_id', n.organization_id, 'metin', n.metin,
               'takip_tarihi', n.takip_tarihi) order by n.takip_tarihi asc)
      from public.platform_musteri_notlari n where n.takip_tarihi <= p_bugun and n.tamamlandi_at is null), '[]'::jsonb),
    'destek', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'subject', t.subject, 'priority', t.priority, 'status', t.status,
               'last_message_at', t.last_message_at, 'organization_id', t.organization_id) order by t.last_message_at asc)
      from public.support_tickets t where t.status = any (p_destek_durumlari)), '[]'::jsonb),
    'havaleler', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'organization_id', r.organization_id, 'product', r.product,
               'amount', r.amount, 'payment_method', r.payment_method, 'reviewed_at', r.reviewed_at))
      from public.organization_payment_requests r where r.status = 'approved' and r.reviewed_at >= p_seri_basi), '[]'::jsonb),
    'bireysel', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'amount', s.amount, 'paid_at', s.paid_at))
      from public.subscriber_payments s where s.paid_at >= p_seri_basi), '[]'::jsonb),
    'bekleyen_odemeler', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'organization_id', r.organization_id, 'product', r.product,
               'plan_code', r.plan_code, 'amount', r.amount, 'currency', r.currency,
               'payment_method', r.payment_method, 'created_at', r.created_at) order by r.created_at desc)
      from public.organization_payment_requests r where r.status = 'pending'), '[]'::jsonb),
    'ad', coalesce(
      nullif((select p.full_name from public.profiles p where p.id = ben), ''),
      (select e.full_name from public.hr_employees e where e.user_id = ben limit 1))
  );
end;
$function$;
revoke all on function public.platform_konsol_ana_ozeti(timestamptz, timestamptz, date, text[]) from public, anon, authenticated;
grant execute on function public.platform_konsol_ana_ozeti(timestamptz, timestamptz, date, text[]) to authenticated;
