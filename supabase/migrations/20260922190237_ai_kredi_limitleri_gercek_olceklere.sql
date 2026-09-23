-- AI kredi limitleri gerçek ölçeklere çekiliyor.
--
-- Paket varsayılanları 50.000 / 500.000 / 5.000.000 idi. Bu sayılar
-- "karakter" düşünülerek girilmişti; artık birim KREDİ ve 1 kredi = 1.000
-- karakter. Yani Kurumsal pakette 5 MİLYAR karakterlik hak vardı.
--
-- Claude Sonnet 5 fiyatıyla ($2/MTok girdi, $10/MTok çıktı) kredi maliyeti
-- yaklaşık $0,0012. Eski Kurumsal limit ayda ~$6.000'lık tüketime izin
-- veriyordu: kapı hiçbir zaman kapanmaz, tek bir kiracı bakiyeyi yüzlerce
-- kat aşardı. Uygulanmayan limit, limit değil temennidir.
--
-- Yeni ölçekler ve yaklaşık aylık maliyetleri:
--   Başlangıç     500 kredi  ≈ $0,60
--   Profesyonel 2.500 kredi  ≈ $3,00
--   Kurumsal   10.000 kredi  ≈ $12,00
--
-- Kullanıcı ve depolama limitlerine DOKUNULMUYOR: sorun yalnızca AI
-- biriminde, diğer ikisinin ölçüsü zaten doğruydu.

-- ---------------------------------------------------------------------------
-- Doğru proje mi
-- ---------------------------------------------------------------------------
/*
  Bu migration YANLIŞ PROJEDE çalıştırıldı ve "schema private does not
  exist" hatası verdi. Teşhisi zorlaştıran şey şu: organization_licenses
  ArvoARC projesinde de var — köprü kurum ve lisans kopyasını oraya
  yazıyor (lib/arc-bridge.ts). Yani "bu tablo var mı" sorusu iki projeyi
  ayırmıyor.

  platform_subscription_requests yalnızca ArvoOS'ta. Yanlış projede
  sessizce çalışıp ARC'ın lisans kopyasını bozmaktansa burada duruyoruz.
*/
do $kontrol$
begin
  if to_regclass('public.platform_subscription_requests') is null then
    raise exception 'Bu migration ArvoOS projesi içindir (oahshpkgdzrraqdzjqau). Açık olan proje ArvoOS değil; SQL Editor''de projeyi değiştirip tekrar çalıştırın.';
  end if;
end
$kontrol$;

-- ---------------------------------------------------------------------------
-- Paket varsayılanları
-- ---------------------------------------------------------------------------
/*
  Şema burada da kuruluyor: anlık görüntü de aynısını yapıyor
  (canli-sema.sql), çünkü politikalar ve tetikleyiciler private şemasındaki
  fonksiyonlara dayanıyor. "Zaten vardır" varsayımı, migration'ı yeni
  kurulan bir ortamda kıran türden bir varsayım.
*/
create schema if not exists private;

create or replace function private.default_license_limits(p_plan public.plan_code)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_plan
    when 'starter'::public.plan_code then jsonb_build_object('user_limit', 5, 'storage_limit_mb', 5120, 'ai_credit_limit', 500)
    when 'professional'::public.plan_code then jsonb_build_object('user_limit', 25, 'storage_limit_mb', 51200, 'ai_credit_limit', 2500)
    else jsonb_build_object('user_limit', 250, 'storage_limit_mb', 512000, 'ai_credit_limit', 10000)
  end;
$$;

revoke all on function private.default_license_limits(public.plan_code) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mevcut kiracılar
-- ---------------------------------------------------------------------------
-- YALNIZCA eski varsayılanı taşıyan satırlar güncelleniyor. Pazarlıkla
-- değiştirilmiş bir limit varsa ona dokunulmuyor: toplu bir güncelleme,
-- kurucunun bilerek girdiği bir sayıyı sessizce silerdi.
update public.organization_licenses
   set ai_credit_limit = case plan_code
         when 'starter'::public.plan_code then 500
         when 'professional'::public.plan_code then 2500
         else 10000
       end,
       updated_at = now()
 where (plan_code = 'starter'::public.plan_code and ai_credit_limit = 50000)
    or (plan_code = 'professional'::public.plan_code and ai_credit_limit = 500000)
    or (plan_code not in ('starter'::public.plan_code, 'professional'::public.plan_code) and ai_credit_limit = 5000000);

comment on column public.organization_licenses.ai_credit_limit is
  'Aylık AI kredisi. 1 kredi = 1.000 karakter (istem + yanıt). Tüketim ArvoLab''da ölçülüyor; limit oraya yansıtılıyor (lib/arvolab.ts).';

-- Artık yazılmayan sayaç. Tüketim ArvoLab'da ölçülüyor (arvoos_ai_kullanimi);
-- bu sütunu hiçbir kod artırmıyordu ve okunduğu her yerde "0" diyordu.
-- Silinmiyor çünkü eski anlık görüntülerde duruyor; yanıltmasın diye
-- ne olduğu yazılıyor.
comment on column public.organization_licenses.ai_credits_used is
  'KULLANILMIYOR. Tüketim ArvoLab''da ölçülüyor; bu sütun hiçbir zaman artırılmadı, her kurumda 0.';
