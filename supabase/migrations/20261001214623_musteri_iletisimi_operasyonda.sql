-- ============================================================
-- MÜŞTERİ ADI, TELEFONU VE E-POSTASI OPERASYONDAN DÜZENLENEBİLİR
--
-- Operasyon müşteriyle doğrudan konuşuyor ama adı yanlış yazılmışsa ya
-- da e-posta değişmişse düzeltecek yeri yoktu: bu alanlar fırsat
-- kaydında ve operasyonun o tabloya yazma hakkı yok (tutar da orada).
--
-- SÖZLEŞME DE BU KAYITTAN OKUYOR. Sözleşme belgesi müşteri adını ve
-- e-postasını kendi sütunlarında tutmuyor; crm_opportunities'ten
-- birleştirerek alıyor (crm_opportunities!inner(customer_name,
-- contact_email, ...)). Dolayısıyla burada yapılan düzeltme sözleşmeye
-- de yansıyor; ayrıca bir yazma gerekmiyor ve iki kayıt birbirinden
-- ayrışamıyor.
--
-- signed_name'E DOKUNULMUYOR: o, imza anında müşterinin yazdığı addır,
-- kanıttır. Zaten tetikleyici (arvo_guard_contract_signature)
-- değiştirilmesine izin vermiyor; bu fonksiyon da hiç el sürmüyor.
--
-- Fonksiyon künye yazanın yerini alıyor (iki parametreliyi düşürüp üç
-- parametreliyi kuruyor): tek bir form kaydediyor, iki ayrı çağrı
-- yapmak yarısı yazılıp yarısı yazılmamış bir kayıt bırakabilirdi.
-- ============================================================

drop function if exists public.arvo_ops_musteri_kunyesi_yaz(uuid, jsonb);

create or replace function public.arvo_ops_musteri_kunyesi_yaz(
  p_opportunity uuid,
  p_kunye jsonb,
  p_iletisim jsonb
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
  v_ad text;
  v_eposta text;
  v_telefon text;
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

  -- ---------- Künye (jsonb) ----------
  v_detay := coalesce(v_detay, '{}'::jsonb);
  foreach v_anahtar in array v_anahtarlar loop
    v_deger := nullif(btrim(coalesce(p_kunye ->> v_anahtar, '')), '');
    if v_deger is null then
      v_detay := v_detay - v_anahtar;
    else
      v_detay := jsonb_set(v_detay, array[v_anahtar], to_jsonb(left(v_deger, 160)));
    end if;
  end loop;

  -- ---------- İletişim (sütunlar) ----------
  -- Ad zorunlu: sütun NOT NULL ve sözleşme belgesi bu addan çiziliyor.
  -- Boş gelirse sessizce eski değeri bırakmak yerine hata veriliyor;
  -- kullanıcı yanlışlıkla sildiğini öğrenmeli.
  v_ad := nullif(btrim(coalesce(p_iletisim ->> 'customer_name', '')), '');
  if v_ad is null then
    raise exception 'Müşteri adı boş olamaz.' using errcode = '23514';
  end if;

  v_eposta := nullif(btrim(coalesce(p_iletisim ->> 'contact_email', '')), '');
  -- Kaba biçim denetimi: sözleşme bağlantısı bu adrese gidiyor, "ali"
  -- gibi bir değer sessizce kaydedilirse e-posta hiç ulaşmaz.
  if v_eposta is not null and v_eposta !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'E-posta adresi geçersiz görünüyor: %', v_eposta using errcode = '22023';
  end if;

  v_telefon := nullif(btrim(coalesce(p_iletisim ->> 'contact_phone', '')), '');

  update public.crm_opportunities
     set request_details = v_detay,
         customer_name = left(v_ad, 160),
         contact_email = left(v_eposta, 160),
         contact_phone = left(v_telefon, 40),
         updated_at = now()
   where id = p_opportunity;

  return jsonb_build_object(
    'kunye', v_detay,
    'customer_name', v_ad,
    'contact_email', v_eposta,
    'contact_phone', v_telefon
  );
end;
$$;

revoke all on function public.arvo_ops_musteri_kunyesi_yaz(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.arvo_ops_musteri_kunyesi_yaz(uuid, jsonb, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
