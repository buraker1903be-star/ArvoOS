/*
  SÜRESİ DOLAN AKTİF LİSANS "ÖDEMESİ GECİKMİŞ" OLUR (14.10.2026).

  Hiçbir şey bir lisansı kendiliğinden 'past_due'ya çekmiyordu: dönem
  sonu geçen kiracı 'active' görünmeye devam ediyor, konsolun "Ödemesi
  gecikmiş" sayısı hep 0 kalıyordu (otomatik çekim yok; dönem ayda bir
  elle ya da bağlantıyla ödeniyor). Her sabah abonelik hatırlatma işi
  (app/api/cron/abonelik-hatirlatma) bu işlevi çağırıyor.

  KAPSAM BİLEREK DAR — ERİŞİM DEĞİŞMESİN:
   - Yalnızca 'active' ve dönem sonu GEÇMİŞ lisans. Ürünler (ArvoARC
     arc_store_stage, ArvoLab subscription_open, Randevu rdv_lisans_acik)
     zaten dönem sonuna bakıyor: süresi geçmiş aktif lisans orada zaten
     kapalı; 'past_due'ya çekmek hiçbir kiracının erişimini değiştirmiyor.
     ArvoOS paneli lisans durumuna göre kapı tutmuyor.
   - 'trialing' DOKUNULMUYOR. Ürünler deneme bitişine (trial_ends_at)
     bakmıyor; denemeyi 'past_due'ya çekmek, dönem sonu boş olan bugün
     açık denemeleri kapatırdı. Denemesi biten kiracı konsolun "Ödeme
     sorunları" listesinde görünüyor; karar kurucunun.
   - Dönem sonu boş lisans (elle süresiz açılmış) dokunulmuyor.
   - Kendi kurumlarımız (kind = internal) dokunulmuyor.

  SECURITY DEFINER, yalnızca service_role çalıştırır (cron sunucu
  anahtarıyla çağırıyor). Dönen liste, köprüyle eşitlenecek ürün
  lisanslarını bildiriyor (ArvoLab'ın eşitleme cron'u yok).
*/

create or replace function public.platform_gecikenleri_isaretle()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_cekirdek jsonb;
  v_urun jsonb;
begin
  with g as (
    update public.organization_licenses l
    set license_status = 'past_due', updated_at = now()
    from public.organizations o
    where o.id = l.organization_id
      and coalesce(o.kind, 'customer') <> 'internal'
      and l.license_status = 'active'
      and l.current_period_end is not null
      and l.current_period_end < now()
    returning l.organization_id
  )
  select coalesce(jsonb_agg(g.organization_id), '[]'::jsonb) into v_cekirdek from g;

  with g as (
    update public.organization_product_licenses l
    set status = 'past_due', updated_at = now()
    from public.organizations o
    where o.id = l.organization_id
      and coalesce(o.kind, 'customer') <> 'internal'
      and l.status = 'active'
      and l.current_period_end is not null
      and l.current_period_end < now()
    returning l.organization_id, l.product
  )
  select coalesce(jsonb_agg(jsonb_build_object('organization_id', g.organization_id, 'product', g.product)), '[]'::jsonb)
  into v_urun from g;

  return jsonb_build_object('cekirdek', v_cekirdek, 'urun', v_urun);
end
$$;

revoke all on function public.platform_gecikenleri_isaretle() from public, anon, authenticated;
grant execute on function public.platform_gecikenleri_isaretle() to service_role;
