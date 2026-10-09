-- ============================================================
-- TAKSİT PLANINI KAYDETME (tutar, vade, taksit seçeneği)
--
-- Finans → Müşteriler → cari penceresinden bir taksitin tutarı ya da
-- planın taksit seçeneği (adet, ilk vade, aralık) değiştiriliyor. Yeni
-- planı uygulama hesaplıyor (lib/taksit-plani.ts); bu fonksiyon onu
-- DOĞRULAYIP yazıyor. Eskiden yalnızca rebuild_payment_plan_installments
-- vardı: planı baştan kuruyor, tahsilatı olan planda hiç çalışmıyordu.
--
-- KURALLAR (veritabanında, ekrandan bağımsız):
--   - Yalnızca kurum sahibi/yöneticisi (arvo_is_finance_manager);
--     oturumsuz çağrı reddedilir.
--   - Taksitlerin toplamı planın toplamına (sözleşme tutarı) BİREBİR
--     eşit olmalı. Toplam saptığında kalanlar açık bakiyeyi aşıyor,
--     "30.000 TL açık, 40.000 TL vadesi geçti" görünüyordu (09.10.2026).
--   - Numara 1..n kesintisiz; tutar ≥ 0; her taksitin vadesi var.
--   - Satırlar numaraya göre güncellenir (kimlik korunur: ödeme
--     bağlantısı ve prim kayıtları kopmaz); fazlalar silinir. Durumu
--     "ödendi" olan ya da etkin PayTR bağlantısı bulunan taksit
--     silinemez — bağlantı müşteride açık, silmek onu sahipsiz bırakır.
--
-- AYRICA: rebuild_payment_plan_installments anon'a açıktı ve yetkiyi
-- yalnızca oturum VARSA denetliyordu (auth.uid() boşken geçiyordu);
-- plan kimliğini bilen oturumsuz biri ödenmemiş taksitleri silip planı
-- yeniden kurabilirdi. Yalnızca authenticated'a açılıyor ve oturumsuz
-- çağrı reddediliyor.
-- ============================================================

create or replace function public.arvo_taksitleri_kaydet(p_plan_id uuid, p_taksitler jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan public.payment_plans%rowtype;
  v_adet integer;
  v_toplam bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'forbidden';
  end if;

  select * into v_plan from public.payment_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'payment_plan_not_found';
  end if;
  if not private.arvo_is_finance_manager(v_plan.organization_id) then
    raise exception 'forbidden';
  end if;

  if jsonb_typeof(p_taksitler) <> 'array' then
    raise exception 'invalid_installments';
  end if;
  v_adet := jsonb_array_length(p_taksitler);
  if v_adet < 1 or v_adet > 60 then
    raise exception 'invalid_installment_count';
  end if;

  -- Biçim: {no, vade, tutar}; numaralar 1..n, tutar ≥ 0, vade dolu.
  if exists (
    select 1 from jsonb_array_elements(p_taksitler) x
     where jsonb_typeof(x) <> 'object'
        or coalesce(x->>'no', '') !~ '^\d{1,3}$'
        or coalesce(x->>'tutar', '') !~ '^\d{1,15}$'
        or coalesce(x->>'vade', '') !~ '^\d{4}-\d{2}-\d{2}$'
  ) then
    raise exception 'invalid_installments';
  end if;
  if (select count(distinct (x->>'no')::integer) from jsonb_array_elements(p_taksitler) x) <> v_adet
     or (select min((x->>'no')::integer) from jsonb_array_elements(p_taksitler) x) <> 1
     or (select max((x->>'no')::integer) from jsonb_array_elements(p_taksitler) x) <> v_adet then
    raise exception 'invalid_installment_numbers';
  end if;

  select coalesce(sum((x->>'tutar')::bigint), 0) into v_toplam from jsonb_array_elements(p_taksitler) x;
  if v_toplam <> v_plan.total_amount then
    raise exception 'plan_toplami_tutmuyor';
  end if;

  -- Silinecekler: ödenmiş ya da etkin bağlantılı taksit silinemez.
  if exists (
    select 1 from public.payment_installments i
     where i.payment_plan_id = v_plan.id and i.installment_no > v_adet
       and (i.status = 'paid'
            or exists (select 1 from public.payment_links l where l.installment_id = i.id and l.status = 'active'))
  ) then
    raise exception 'silinemeyen_taksit';
  end if;
  delete from public.payment_installments
   where payment_plan_id = v_plan.id and installment_no > v_adet;

  -- Var olanlar numarayla güncellenir (kimlik korunur), yoksa eklenir.
  insert into public.payment_installments (organization_id, payment_plan_id, installment_no, due_date, amount, status)
  select v_plan.organization_id, v_plan.id, (x->>'no')::integer, (x->>'vade')::date, (x->>'tutar')::bigint, 'pending'
    from jsonb_array_elements(p_taksitler) x
  on conflict (payment_plan_id, installment_no) do update
     set due_date = excluded.due_date,
         amount = excluded.amount,
         -- İptal edilmiş numara yeniden planda: bekleyen olur.
         status = case when public.payment_installments.status = 'cancelled' then 'pending' else public.payment_installments.status end;

  update public.payment_plans set updated_at = now() where id = v_plan.id;
end;
$$;

revoke all on function public.arvo_taksitleri_kaydet(uuid, jsonb) from public, anon;
grant execute on function public.arvo_taksitleri_kaydet(uuid, jsonb) to authenticated, service_role;

-- Eski yeniden kurma: oturumsuz çağrı kapatılıyor.
revoke all on function public.rebuild_payment_plan_installments(uuid, integer, date, integer) from public, anon;
grant execute on function public.rebuild_payment_plan_installments(uuid, integer, date, integer) to authenticated, service_role;
