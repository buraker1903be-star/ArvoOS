-- ============================================================
-- CARİ HAREKET DÜZELTME / SİLME (elle girilenler)
--
-- Cari penceresinden elle girilen tahsilat, iade ve ek hizmet artık
-- düzeltilip silinebiliyor (app/panel/accounts/actions.ts, kural
-- lib/cari-hareket.ts). İki eksik vardı:
--
-- 1) Taksit durumları güncellemede yeniden hesaplanmıyordu. Ekleme ve
--    silme tetikleyicileri (arvo_account_entry_reconcile / _unreconcile)
--    vardı, UPDATE için yoktu: 15.000 TL'lik tahsilat 5.000'e
--    düzeltilseydi kapanmış taksit "ödendi" kalırdı. Artık tutar, tür,
--    kaynak ya da cari değişince önce açılıyor sonra kapatılıyor (aynı iki
--    fonksiyon, aynı kilit sırası).
--
-- 2) Başka bir kayda bağlı hareketler doğrudan API'den değiştirilebiliyordu.
--    RLS (owners_update/delete_account_entries) "kim"i söylüyor, "neyi"yi
--    değil; oturum jetonu tarayıcıda. Kilitli olanlar:
--      - sözleşme borcu (source_type = 'crm_contract'),
--      - PayTR tahsilatı (reference 'PAYTR-…' / "PayTR tahsilatı …").
--    Ayrıca bir hareketin türü, kaynağı, carisi ve kurumu sonradan
--    değiştirilemez — elle girilen tahsilat sözleşme borcuna dönüşmesin.
--    Koruma yalnızca authenticated/anon çağrıya bakıyor (current_user,
--    security INVOKER): security definer fonksiyonlar ve cari silindiğinde
--    çalışan CASCADE (tablo sahibi olarak çalışır) etkilenmez.
-- ============================================================

create or replace function private.arvo_account_entry_reconcile_update()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if old.party_id is not null and old.party_id is distinct from new.party_id then
    perform private.arvo_unreconcile_party_installments(old.organization_id, old.party_id);
  end if;
  if new.party_id is not null then
    perform private.arvo_unreconcile_party_installments(new.organization_id, new.party_id);
    perform private.arvo_reconcile_party_installments(new.organization_id, new.party_id);
  end if;
  return null;
end
$$;

revoke all on function private.arvo_account_entry_reconcile_update() from public, anon, authenticated;

drop trigger if exists arvo_account_entry_reconcile_update on public.account_entries;
create trigger arvo_account_entry_reconcile_update
  after update of amount, entry_type, source_type, party_id on public.account_entries
  for each row
  when (old.amount is distinct from new.amount
        or old.entry_type is distinct from new.entry_type
        or old.source_type is distinct from new.source_type
        or old.party_id is distinct from new.party_id)
  execute function private.arvo_account_entry_reconcile_update();

create or replace function private.arvo_guard_account_entry()
returns trigger
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  -- PayTR hareketini arvo_record_paytr_payment 'PAYTR-<sipariş>' referansı ve
  -- "PayTR tahsilatı" açıklamasıyla yazıyor; ikisi de burada kilitli olduğu
  -- için sonradan silinemez. (payment_provider_events'e bakılmıyor: bu
  -- fonksiyon çağıranın yetkisiyle çalışır, RLS o satırı gizleyebilir.)
  if old.source_type = 'crm_contract'
     or coalesce(old.reference_no, '') like 'PAYTR-%'
     or coalesce(old.description, '') like 'PayTR tahsilatı%' then
    raise exception 'kilitli_cari_hareket';
  end if;

  if tg_op = 'UPDATE' and (
       new.entry_type is distinct from old.entry_type
       or new.source_type is distinct from old.source_type
       or new.party_id is distinct from old.party_id
       or new.organization_id is distinct from old.organization_id) then
    raise exception 'cari_hareket_turu_degismez';
  end if;

  return coalesce(new, old);
end
$$;

drop trigger if exists arvo_guard_account_entry on public.account_entries;
create trigger arvo_guard_account_entry
  before update or delete on public.account_entries
  for each row execute function private.arvo_guard_account_entry();
