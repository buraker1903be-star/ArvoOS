/*
  Paket başına dahil kullanıcı sayısı fiyat listesiyle eşitlendi
  (13.10.2026). Liste fiyatları lib/site/pricing.ts'te şu basamaklara
  çekildi: Başlangıç 1.990 TL / 3 kullanıcı, Kurumsal 5.990 TL / 15
  kullanıcı. Bu fonksiyon hâlâ 5 ve 25 veriyordu; yeni açılan her kurum
  ödediğinden fazla koltukla başlıyor, ek kullanıcı kalemi de hiç
  işlemiyordu.

  Yalnızca YENİ kurumları etkiler: limit, kurum oluşurken
  private.create_default_organization_license tetikleyicisiyle bir kez
  yazılıyor. Var olan kiracıların organization_licenses.user_limit
  satırına dokunulmuyor — fiyat değişikliği yürürlükteki dönemi
  etkilemez (ücretler sayfasındaki abonelik kuralı) ve bir müşterinin
  kullandığı koltuğu geri almak, çalışan bir ekibi kilitlemek demekti.

  Depolama ve AI kredisi değişmedi: fiyat merdiveni koltuk üzerinden
  kuruldu, o iki limit bugüne kadar darboğaz olmadı.
*/
create or replace function private.default_license_limits(p_plan plan_code)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case p_plan
    when 'starter'::public.plan_code then jsonb_build_object('user_limit', 3, 'storage_limit_mb', 5120, 'ai_credit_limit', 500)
    when 'professional'::public.plan_code then jsonb_build_object('user_limit', 15, 'storage_limit_mb', 51200, 'ai_credit_limit', 2500)
    else jsonb_build_object('user_limit', 250, 'storage_limit_mb', 512000, 'ai_credit_limit', 10000)
  end;
$$;

-- Postgres yeni fonksiyonu varsayılan olarak public'e açar; dökümdeki
-- yetki satırı da bu revoke'tur (canli-sema.sql).
revoke all on function private.default_license_limits(p_plan plan_code) from public;
