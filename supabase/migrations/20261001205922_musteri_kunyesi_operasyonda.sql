-- ============================================================
-- MÜŞTERİ KÜNYESİ OPERASYONDA GÖRÜNÜR VE DÜZENLENEBİLİR
--
-- Operasyon personeli sözleşmeyi ve teklifi göremiyor (20261001143617):
-- tutar o kayıtlarda duruyor ve satır erişimi bilerek daraltıldı. Ama
-- işi yapan kişinin müşterinin üniversitesini, fakültesini ve bölümünü
-- bilmesi gerekiyor; bugün bu bilgi YALNIZCA fırsat kaydında
-- (request_details) duruyor ve ops görünümünde yok.
--
-- 1) ops_opportunities künye alanlarını da veriyor.
--
--    request_details'in TAMAMI açılmıyor, bilerek. İçinde serbest metin
--    alanlar var (scope gibi) ve oraya pazarlık sırasında tutar yazılmış
--    olabilir; az önce kapatılan kapıyı serbest metinle yeniden açmak
--    olurdu. Görünüm yalnızca yapılandırılmış künye anahtarlarını
--    kuruyor, hepsi metin.
--
-- 2) Künyeyi operasyonun da yazabilmesi için tek amaçlı bir fonksiyon.
--
--    crm_opportunities'e UPDATE politikası açmak yanlış olurdu: RLS satır
--    bazlı, sütun gizleyemiyor — operasyona yazma hakkı vermek
--    estimated_value'yu da yazılabilir yapardı. Fonksiyon yalnızca
--    künye anahtarlarını birleştiriyor, geri kalan her şeye dokunmuyor.
--
--    service_type BİLEREK DIŞARIDA: çalışma türü görev şablonunu seçiyor
--    (tez/makale/ödev ayrı şablonlar) ve fırsatta belirleniyor;
--    operasyondan değiştirilmesi iş akışının şablonuyla çelişirdi.
-- ============================================================

create or replace view public.ops_opportunities with (security_barrier = true) as
  select o.id, o.organization_id, o.title, o.customer_name, o.contact_email, o.contact_phone,
         o.stage, o.assigned_employee_id, o.created_at, o.updated_at,
         jsonb_strip_nulls(jsonb_build_object(
           'service_type',   o.request_details ->> 'service_type',
           'academic_level', o.request_details ->> 'academic_level',
           'university',     o.request_details ->> 'university',
           'faculty',        o.request_details ->> 'faculty',
           'department',     o.request_details ->> 'department',
           'program',        o.request_details ->> 'program',
           'advisor',        o.request_details ->> 'advisor',
           'language',       o.request_details ->> 'language'
         )) as kunye
  from public.crm_opportunities o
  where private.arvo_can_access_opportunity(o.id);

revoke all on public.ops_opportunities from public, anon;
grant select on public.ops_opportunities to authenticated, service_role;

/*
  Künyeyi yazan tek yol.

  Yetkiyi fonksiyon kendisi doğruluyor (security definer, RLS'i atlıyor):
  çağıran fırsata erişebiliyorsa — yöneticiler, satışçısı ya da işin
  sorumlusu — künyeyi düzenleyebilir.

  Yalnızca listedeki anahtarlar yazılıyor. Boş gelen alan siliniyor;
  "boş bıraktım" ile "dokunmadım" ayrımı çağıranda değil burada
  bitiyor — form her zaman alanların tamamını gönderiyor.
*/
create or replace function public.arvo_ops_musteri_kunyesi_yaz(
  p_opportunity uuid,
  p_kunye jsonb
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_anahtarlar text[] := array[
    'academic_level','university','faculty','department','program','advisor','language'
  ];
  v_anahtar text;
  v_deger text;
  v_detay jsonb;
begin
  if p_opportunity is null then
    raise exception 'Fırsat belirtilmedi.' using errcode = '22023';
  end if;
  if not private.arvo_can_access_opportunity(p_opportunity) then
    raise exception 'Bu kaydı düzenleme yetkiniz yok.' using errcode = '42501';
  end if;

  select o.request_details into v_detay
  from public.crm_opportunities o
  where o.id = p_opportunity;
  if not found then
    raise exception 'Fırsat bulunamadı.' using errcode = 'P0002';
  end if;

  v_detay := coalesce(v_detay, '{}'::jsonb);

  foreach v_anahtar in array v_anahtarlar loop
    v_deger := nullif(btrim(coalesce(p_kunye ->> v_anahtar, '')), '');
    if v_deger is null then
      v_detay := v_detay - v_anahtar;
    else
      -- Uzunluk burada da sınırlanıyor: sunucu tarafı atlanırsa diye.
      v_detay := jsonb_set(v_detay, array[v_anahtar], to_jsonb(left(v_deger, 160)));
    end if;
  end loop;

  update public.crm_opportunities
     set request_details = v_detay,
         updated_at = now()
   where id = p_opportunity;

  return v_detay;
end;
$$;

revoke all on function public.arvo_ops_musteri_kunyesi_yaz(uuid, jsonb) from public, anon;
grant execute on function public.arvo_ops_musteri_kunyesi_yaz(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
