-- Cariye girilen tahsilat artık bekleyen taksitleri kapatıyor.
--
-- Sorun: Panelde "Tahsilat Ekle" yalnızca account_entries'e alacak (credit)
-- yazıyordu. PAYTR ekranı ödenen/bekleyen/gecikmiş durumunu
-- payment_installments.status'tan okuyor ve panelde hiçbir şey taksiti
-- "paid" yapmıyordu (collect_payment_installment'ın arayüzde çağrısı yok).
-- Ödeme yapan müşteri "Gecikmiş" görünüyor, "Tahsil Edilen" 0 kalıyor ve
-- ödeme yapmış müşteriye gecikme hatırlatması gidebiliyordu.
--
-- Çözüm: bir müşterinin (party) cariye giren her alacağından sonra
-- arvo_reconcile_party_installments çalışır:
--   dağıtılmamış ödeme = toplam alacak − iadeler − ödenmiş taksitler toplamı
-- Bekleyen taksitler en eski vadeden başlayarak, dağıtılmamış ödeme
-- taksit tutarını karşıladıkça "paid" yapılır. Kısmi ödemeler birikir
-- (5.000 + 5.000, 10.000'lik taksiti kapatır). Yeni alacak kaydı
-- oluşturmaz, bu yüzden collect_payment_installment ile çakışmaz: o
-- fonksiyon önce taksiti kapatıp sonra alacağı yazdığı için hesap dengede
-- kalır. Taksit kapatmayı yalnızca ileri yönde yapar; ödenmiş taksidi
-- geri açmaz.
--
-- Geçmiş tahsilatlar için toplu düzeltme bu migration'da YAPILMAZ;
-- önizleme (p_dry_run = true) ve uygulama sorguları dosyanın sonunda.

create or replace function private.arvo_reconcile_party_installments(
  p_organization_id uuid,
  p_party_id uuid,
  p_dry_run boolean default false
)
returns table(installment_id uuid, installment_no integer, amount bigint, due_date date)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_unallocated bigint;
  v_party_name text;
  r record;
begin
  if p_organization_id is null or p_party_id is null then
    return;
  end if;

  -- Eşzamanlı tahsilatlarda aynı taksidin iki kez kapanmasını önle.
  perform 1
  from public.payment_installments i
  join public.payment_plans p on p.id = i.payment_plan_id
  where p.organization_id = p_organization_id and p.party_id = p_party_id
  for update of i;

  select
    coalesce(sum(case
      when e.entry_type = 'credit' then e.amount
      when e.entry_type = 'debit' and e.source_type = 'adjustment' then -e.amount
      else 0
    end), 0)
  into v_unallocated
  from public.account_entries e
  where e.organization_id = p_organization_id and e.party_id = p_party_id;

  v_unallocated := v_unallocated - coalesce((
    select sum(i.amount)
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'paid'
  ), 0);

  select name into v_party_name from public.account_parties where id = p_party_id;

  for r in
    select i.id, i.installment_no, i.amount, i.due_date
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'pending'
    order by i.due_date nulls last, i.installment_no
  loop
    exit when v_unallocated < r.amount;
    v_unallocated := v_unallocated - r.amount;

    installment_id := r.id;
    installment_no := r.installment_no;
    amount := r.amount;
    due_date := r.due_date;
    return next;

    if not p_dry_run then
      update public.payment_installments
      set status = 'paid', paid_at = now()
      where id = r.id;

      -- collect_payment_installment ile aynı eşleştirme, ama tek satır.
      update public.finance_transactions
      set status = 'paid', paid_at = now(), updated_at = now()
      where id = (
        select ft.id
        from public.finance_transactions ft
        where ft.organization_id = p_organization_id
          and ft.transaction_type = 'income'
          and ft.status = 'planned'
          and ft.counterparty = v_party_name
          and ft.amount = r.amount
          and (ft.due_date = r.due_date or ft.due_date is null)
        order by ft.due_date nulls last
        limit 1
      );
    end if;
  end loop;

  if not p_dry_run then
    update public.payment_plans p
    set status = 'completed', updated_at = now()
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and p.status is distinct from 'completed'
      and exists (select 1 from public.payment_installments i where i.payment_plan_id = p.id)
      and not exists (
        select 1 from public.payment_installments i
        where i.payment_plan_id = p.id and i.status = 'pending'
      );
  end if;
end
$function$;

revoke all on function private.arvo_reconcile_party_installments(uuid, uuid, boolean) from public;

create or replace function private.arvo_account_entry_reconcile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.entry_type = 'credit' and new.party_id is not null then
    perform private.arvo_reconcile_party_installments(new.organization_id, new.party_id);
  end if;
  return null;
end
$function$;

drop trigger if exists arvo_account_entry_reconcile on public.account_entries;
create trigger arvo_account_entry_reconcile
  after insert on public.account_entries
  for each row execute function private.arvo_account_entry_reconcile();

-- ---------------------------------------------------------------
-- Geçmiş tahsilatlar (bu migration ÇALIŞTIRMAZ; ayrı çalıştırın)
-- ---------------------------------------------------------------
-- 1) Önizleme — hangi taksitler kapanacak, hiçbir şey değişmez:
--
-- select a.name as musteri, r.installment_no as taksit, r.amount / 100.0 as tutar_tl, r.due_date as vade
-- from (select distinct organization_id, party_id from public.payment_plans where party_id is not null) p
-- join public.account_parties a on a.id = p.party_id
-- cross join lateral private.arvo_reconcile_party_installments(p.organization_id, p.party_id, true) r
-- order by a.name, r.due_date;
--
-- 2) Uygulama — önizleme doğruysa:
--
-- select count(*) as kapanan_taksit
-- from (select distinct organization_id, party_id from public.payment_plans where party_id is not null) p
-- cross join lateral private.arvo_reconcile_party_installments(p.organization_id, p.party_id, false) r;
