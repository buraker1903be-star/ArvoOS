/*
  ÖDEME ONAYINDA PARA BİRİMİ DENETİMİ (28.11.2026).

  Havale onayı bildirimi doğrulamadan lisansı açıyordu: tutar
  karşılaştırması ekrandaydı (kurucu görüp onaylıyor) ama PARA BİRİMİ
  hiç karşılaştırılmıyordu. 100 USD'lik bir bildirim, aylık ücreti 100
  TRY olan bir aboneliği bir ay uzatabilirdi.

  Kural veritabanında, çünkü ekran tek başına yeterli değil: işlev
  doğrudan da çağrılabiliyor.

  GÖVDELER ANLIK GÖRÜNTÜDEN ALINDI (AGENTS.md kuralı). İlk denemede
  gövde 20260915120000'deki hâlinden türetilmişti ve o sırada eklenmiş
  ÜRÜN YÖNLENDİRMESİ düşüyordu: randevu/arc dekontu ArvoOS lisansını
  uzatıyordu. tests/db/lisans-tahsilat.test.mjs yakaladı.

  Üç işlev:

   1. `private.arvo_activate_license_period` (ArvoOS çekirdek lisansı)
   2. `private.arvo_activate_product_period` (öteki ürünler)
      — ikisinde de: lisansın para birimi ödemeninkinden farklıysa
      İŞLEM DÜŞÜYOR (dönem uzamıyor, abonelik ve fatura yazılmıyor).
      Lisansın birimi boşsa ilk satın almada ödemenin birimi yazılıyor.
   3. `public.review_bank_transfer_payment` — onay yolunda aynı
      denetim, kurucuya Türkçe mesajla. RET etkilenmiyor: uyuşmayan
      bildirim reddedilebilmeli.

  MEVCUT TRY ABONELİKLERİ: lisans satırlarının para_birimi'si
  20261128120350'de 'TRY' varsayılanıyla açıldı; TRY bildirimler aynen
  çalışmaya devam ediyor (tests/db/odeme-para-birimi.test.mjs).
*/

/*
  ÖN KOŞUL — SIRA HATASINI YÜKSEK SESLE DÜŞÜR (28.11.2026).

  Bu dosya 20261128120350'ye bağlı, ama bağımlılık SESSİZ: plpgsql
  gövdesi sütunları çalışma anında denetliyor (AGENTS.md), yani
  `organization_licenses.para_birimi` yokken migration HATASIZ
  uygulanıyor — SQL Editor "Success" diyor — ve ilk havale onayında
  düşüyor. Canlıda bunun karşılığı "ödeme onaylayamayan kurucu" ve
  sebebi yalnızca sunucu günlüğünde.

  Ölçüldü: tests/db/para-birimi-gecis-sirasi.test.mjs, 2. madde.
  Bu blok sırayı uygulama anında denetliyor: eksikse hiçbir işlev
  yeniden yazılmıyor.
*/
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'organization_licenses' and column_name = 'para_birimi'
  ) then
    raise exception 'Önce 20261128120350 uygulanmalı: organization_licenses.para_birimi yok.';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'organization_product_licenses' and column_name = 'para_birimi'
  ) then
    raise exception 'Önce 20261128120350 uygulanmalı: organization_product_licenses.para_birimi yok.';
  end if;
end
$$;

/* Ortak çözüm: sağlayıcının "TL"si ISO'ya çevriliyor, tanınmayan
   birim reddediliyor. Tek yerde, üç işlev de bunu çağırıyor. */
create or replace function private.para_birimi_coz(p_deger text)
returns text
language plpgsql
immutable
set search_path to ''
as $$
declare
  v text := upper(coalesce(nullif(trim(p_deger), ''), 'TRY'));
begin
  if v = 'TL' then v := 'TRY'; end if;
  if v not in ('TRY', 'USD') then
    raise exception 'Tanınmayan para birimi: %', v;
  end if;
  return v;
end
$$;

revoke all on function private.para_birimi_coz(text) from public, anon;
grant execute on function private.para_birimi_coz(text) to authenticated, service_role;

create or replace function private.arvo_activate_license_period(p_organization_id uuid, p_plan_code plan_code, p_amount bigint, p_currency text, p_provider text, p_actor uuid)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_current_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_birim text := private.para_birimi_coz(p_currency);
  v_lisans_birimi text;
begin
  select current_period_end, para_birimi into v_current_end, v_lisans_birimi
  from public.organization_licenses
  where organization_id = p_organization_id
  for update;

  /* PARA BİRİMİ UYUŞMAZLIĞINDA HİÇBİR ŞEY YAPILMIYOR. */
  if v_lisans_birimi is not null and v_lisans_birimi <> v_birim then
    raise exception 'Para birimi uyuşmuyor: abonelik %, ödeme %. Lisans açılmadı.', v_lisans_birimi, v_birim;
  end if;

  -- Süre dolmadıysa yeni ay mevcut dönem sonundan başlar.
  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';

  update public.organization_licenses
  set plan_code = p_plan_code,
      license_status = 'active',
      /* İlk satın almada abonelik para birimi buradan sabitleniyor. */
      para_birimi = v_birim,
      current_period_start = case when v_current_end is not null and v_current_end > now() then coalesce(current_period_start, now()) else now() end,
      current_period_end = v_end,
      trial_ends_at = null,
      suspended_at = null,
      suspension_reason = null,
      updated_by = p_actor,
      updated_at = now()
  where organization_id = p_organization_id;

  update public.organizations
  set plan_code = p_plan_code,
      status = 'active',
      provisioning_state = 'active',
      updated_at = now()
  where id = p_organization_id;

  insert into public.billing_subscriptions (
    organization_id, provider, plan_code, status, currency, unit_amount,
    interval, current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, p_provider, p_plan_code, 'active', v_birim,
    p_amount, 'month', v_start, v_end, now()
  );

  insert into public.billing_invoices (
    organization_id, provider, status, currency, subtotal, tax, total, due_at, paid_at
  ) values (
    p_organization_id, p_provider, 'paid', v_birim,
    p_amount, 0, p_amount, now(), now()
  );

  return v_end;
end
$function$;

create or replace function private.arvo_activate_product_period(p_organization_id uuid, p_product text, p_plan_code plan_code, p_amount bigint, p_currency text, p_provider text, p_actor uuid)
 returns timestamp with time zone
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_current_end timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_period_start timestamptz;
  v_birim text := private.para_birimi_coz(p_currency);
  v_lisans_birimi text;
begin
  if p_product not in ('arvolab', 'arc', 'randevu') then
    raise exception 'Bilinmeyen ürün: %', p_product;
  end if;

  select current_period_end, para_birimi into v_current_end, v_lisans_birimi
  from public.organization_product_licenses
  where organization_id = p_organization_id and product = p_product
  for update;

  if v_lisans_birimi is not null and v_lisans_birimi <> v_birim then
    raise exception 'Para birimi uyuşmuyor: % aboneliği %, ödeme %. Lisans açılmadı.', p_product, v_lisans_birimi, v_birim;
  end if;

  v_start := greatest(now(), coalesce(v_current_end, now()));
  v_end := v_start + interval '1 month';
  v_period_start := case when v_current_end is not null and v_current_end > now() then null else now() end;

  insert into public.organization_product_licenses (
    organization_id, product, status, plan_code, para_birimi, current_period_start, current_period_end,
    trial_ends_at, suspended_at, suspension_reason, updated_by, updated_at
  ) values (
    p_organization_id, p_product, 'active', p_plan_code, v_birim, now(), v_end,
    null, null, null, p_actor, now()
  )
  on conflict (organization_id, product) do update
  set status = 'active',
      plan_code = coalesce(excluded.plan_code, public.organization_product_licenses.plan_code),
      para_birimi = v_birim,
      current_period_start = coalesce(v_period_start, public.organization_product_licenses.current_period_start, now()),
      current_period_end = v_end,
      trial_ends_at = null,
      suspended_at = null,
      suspension_reason = null,
      updated_by = p_actor,
      updated_at = now();

  insert into public.billing_subscriptions (
    organization_id, product, provider, plan_code, status, currency, unit_amount,
    interval, current_period_start, current_period_end, updated_at
  ) values (
    p_organization_id, p_product, p_provider, p_plan_code, 'active', v_birim,
    p_amount, 'month', v_start, v_end, now()
  );

  insert into public.billing_invoices (
    organization_id, product, provider, status, currency, subtotal, tax, total, due_at, paid_at
  ) values (
    p_organization_id, p_product, p_provider, 'paid', v_birim,
    p_amount, 0, p_amount, now(), now()
  );

  return v_end;
end
$function$;

create or replace function public.review_bank_transfer_payment(p_payment_id uuid, p_decision text, p_review_note text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  payment public.organization_payment_requests%rowtype;
  v_odeme_birimi text;
  v_lisans_birimi text;
begin
  if not (select private.is_arvoos_founder()) then
    raise exception 'Founder authorization required';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision';
  end if;

  select * into payment
  from public.organization_payment_requests
  where id = p_payment_id and status = 'pending'
  for update;
  if not found then raise exception 'Pending payment not found'; end if;

  /*
    ONAYDAN ÖNCE PARA BİRİMİ. Ret serbest: uyuşmayan bildirim zaten
    reddedilmeli. Onayda uyuşmazlık varsa işlem düşüyor; bildirim
    "bekliyor" kalıyor, yani tahsilat da işlenmiyor.
  */
  if p_decision = 'approved' then
    v_odeme_birimi := private.para_birimi_coz(payment.currency);
    if coalesce(payment.product, 'arvoos') = 'arvoos' then
      select para_birimi into v_lisans_birimi from public.organization_licenses
       where organization_id = payment.organization_id;
    else
      select para_birimi into v_lisans_birimi from public.organization_product_licenses
       where organization_id = payment.organization_id and product = payment.product;
    end if;
    if v_lisans_birimi is not null and v_lisans_birimi <> v_odeme_birimi then
      raise exception 'Para birimi uyuşmuyor: abonelik %, bildirim %. Onaylanmadı; lisans açılmadı.', v_lisans_birimi, v_odeme_birimi;
    end if;
  end if;

  update public.organization_payment_requests
  set status = p_decision,
      review_note = nullif(trim(p_review_note), ''),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where id = payment.id;

  if p_decision = 'approved' then
    if coalesce(payment.product, 'arvoos') = 'arvoos' then
      perform private.arvo_activate_license_period(
        payment.organization_id, payment.plan_code, payment.amount, payment.currency, 'manual', (select auth.uid())
      );
    else
      perform private.arvo_activate_product_period(
        payment.organization_id, payment.product, payment.plan_code, payment.amount, payment.currency, 'manual', (select auth.uid())
      );
    end if;
  end if;
end;
$function$;

revoke all on function private.arvo_activate_license_period(uuid, public.plan_code, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function private.arvo_activate_license_period(uuid, public.plan_code, bigint, text, text, uuid) to service_role;
revoke all on function private.arvo_activate_product_period(uuid, text, public.plan_code, bigint, text, text, uuid) from public, anon, authenticated;
grant execute on function private.arvo_activate_product_period(uuid, text, public.plan_code, bigint, text, text, uuid) to service_role;
revoke all on function public.review_bank_transfer_payment(uuid,text,text) from public, anon;
grant execute on function public.review_bank_transfer_payment(uuid,text,text) to authenticated;
