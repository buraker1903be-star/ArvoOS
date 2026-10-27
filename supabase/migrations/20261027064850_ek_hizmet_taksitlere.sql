-- ============================================================
-- EK HİZMETİ SÖZLEŞME TAKSİTLERİNE DAĞITMA
--
-- Müşteri sözleşmeden sonra ek hizmet alıyor ve bedelini "kalan
-- taksitlere eşit dağıtın" diyor (26.10.2026, SOZ-2026-000059: 7.000 TL
-- ek hizmet, iki açık taksit). Eskiden bunun bir yolu yoktu: ek hizmet
-- carinin dökümünde ayrı bir borç olarak duruyordu, ödeme takvimi ise
-- yalnızca sözleşme tutarını taşıyabiliyordu — arvo_taksitleri_kaydet
-- toplamın planın toplamına (sözleşme tutarına) BİREBİR eşit olmasını
-- istiyor. Taksit tutarını elle artırmak "toplam tutmuyor" ile
-- reddediliyordu; ek hizmetin vadesi hiçbir takvimde görünmüyordu.
--
-- Bu fonksiyon ek hizmeti plana BAĞLAR: planın toplamı ek hizmet kadar
-- artar ve yeni taksitler (uygulamanın hesapladığı, lib/taksit-plani.ts
-- ekHizmetiDagit) arvo_taksitleri_kaydet'in bütün denetimlerinden geçer.
-- p_ekle = false ters işlem: bağ kopar, toplam geri iner. Ters işlem
-- olmadan yanlış dağıtılan bir ek hizmet geri alınamazdı.
--
-- BAĞ account_entries.payment_plan_id'de. Ayrı bir bayrak yerine kimlik
-- tutuluyor: hangi planın toplamına girdiğini bilmeden geri almak
-- (toplamı hangi plandan düşeceğini) mümkün değil.
--
-- BAĞLI EK HİZMETİN TUTARI DEĞİŞMEZ, SİLİNMEZ. Değişseydi planın toplamı
-- eski tutarla kalır, taksitler borçtan büyük ya da küçük görünürdü —
-- 09.10.2026'daki "30.000 TL açık, 40.000 TL vadesi geçti" tablosu.
-- Önce taksitlerden çıkarılır, sonra düzeltilir. Açıklama ve tarih
-- serbest. Bağı (payment_plan_id) da yalnızca bu fonksiyon yazar.
-- ============================================================

alter table public.account_entries
  add column if not exists payment_plan_id uuid references public.payment_plans(id) on delete set null;

create index if not exists account_entries_payment_plan_idx
  on public.account_entries (payment_plan_id) where payment_plan_id is not null;

-- Koruma: çağıranın rolüne baktığı için security INVOKER (sözleşme imza
-- korumasıyla aynı desen). Fonksiyonlar (definer) ve kaskat geçer.
create or replace function private.arvo_ek_hizmet_plan_koru()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.payment_plan_id is not null then
      raise exception 'ek_hizmet_plan_bagi_dogrudan_yazilmaz';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.payment_plan_id is distinct from old.payment_plan_id then
    raise exception 'ek_hizmet_plan_bagi_dogrudan_yazilmaz';
  end if;

  if old.payment_plan_id is not null
     and (tg_op = 'DELETE' or new.amount is distinct from old.amount) then
    raise exception 'ek_hizmet_taksitlerde';
  end if;

  return coalesce(new, old);
end
$$;

revoke all on function private.arvo_ek_hizmet_plan_koru() from public, anon, authenticated;

drop trigger if exists arvo_ek_hizmet_plan_koru on public.account_entries;
create trigger arvo_ek_hizmet_plan_koru
  before insert or update or delete on public.account_entries
  for each row execute function private.arvo_ek_hizmet_plan_koru();

create or replace function public.arvo_ek_hizmet_taksitlere(p_entry_id uuid, p_plan_id uuid, p_taksitler jsonb, p_ekle boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan public.payment_plans%rowtype;
  v_kayit public.account_entries%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'forbidden';
  end if;

  -- Kilit sırası arvo_taksitleri_kaydet'le aynı: önce plan.
  select * into v_plan from public.payment_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'payment_plan_not_found';
  end if;
  if not private.arvo_is_finance_manager(v_plan.organization_id) then
    raise exception 'forbidden';
  end if;

  select * into v_kayit from public.account_entries where id = p_entry_id for update;
  -- Yalnızca elle girilen ek hizmet (lib/cari-hareket.ts elleGirilenTur)
  -- ve yalnızca planın kendi carisinden.
  if v_kayit.id is null
     or v_kayit.organization_id <> v_plan.organization_id
     or v_kayit.party_id is distinct from v_plan.party_id
     or v_kayit.entry_type <> 'debit'
     or v_kayit.source_type is distinct from 'manual'
     or v_kayit.description not like 'Ek hizmet ·%' then
    raise exception 'ek_hizmet_bulunamadi';
  end if;

  if p_ekle then
    if v_kayit.payment_plan_id is not null then
      raise exception 'ek_hizmet_zaten_dagitildi';
    end if;
    update public.payment_plans set total_amount = total_amount + v_kayit.amount where id = v_plan.id;
    update public.account_entries set payment_plan_id = v_plan.id where id = v_kayit.id;
  else
    if v_kayit.payment_plan_id is distinct from v_plan.id then
      raise exception 'ek_hizmet_planda_degil';
    end if;
    update public.payment_plans set total_amount = total_amount - v_kayit.amount where id = v_plan.id;
    update public.account_entries set payment_plan_id = null where id = v_kayit.id;
  end if;

  -- Yeni toplam, numara, silinemeyen taksit denetimleri orada.
  perform public.arvo_taksitleri_kaydet(v_plan.id, p_taksitler);
end;
$$;

revoke all on function public.arvo_ek_hizmet_taksitlere(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.arvo_ek_hizmet_taksitlere(uuid, uuid, jsonb, boolean) to authenticated, service_role;
