-- Tahsilat geri alınınca taksitler de geri açılır.
--
-- Sorun: Panelde bir tahsilatı "Ödendi"den çıkarmak yalnızca cari alacak
-- kaydını siliyordu (app/panel/finance/actions.ts'te iki ayrı yerde).
-- Taksitler "ödendi", ödeme planı "tamamlandı" kalıyordu. Yani para geri
-- alınmış ama sistem hâlâ tahsil edilmiş gösteriyordu: PayTR ekranı,
-- Prim Raporu ve gecikme hatırlatmaları yanlış okuyordu. Geri alma tek
-- yönlü çalıştığı için hata kendi kendine düzelmiyordu.
--
-- Çözüm: kapatmanın aynadaki karşılığı. 20260912131000'de eklenen
-- arvo_reconcile_party_installments cariye para girdikçe taksitleri ileri
-- yönde kapatıyor; bu fonksiyon para çıkınca geriye doğru açıyor.
-- İkisi birlikte tek bir kuralı korur:
--
--   ödenmiş taksitlerin toplamı <= carideki net tahsilat
--
-- En yeni vadeli taksitten başlayarak açar, çünkü kapatma en eski vadeliden
-- başlıyor; böylece hangi sırayla kapandıysa o sırayla geri alınır.
--
-- Silme tetikleyicisiyle çalışır: uygulamada hangi yoldan silinirse silinsin
-- (finans kaydı geri alma, fatura geri alma, elle düzeltme) kural korunur.

create or replace function private.arvo_unreconcile_party_installments(
  p_organization_id uuid,
  p_party_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_available bigint;
  v_paid_total bigint;
  r record;
begin
  if p_organization_id is null or p_party_id is null then
    return;
  end if;

  -- Kapatma fonksiyonuyla aynı kilit, aynı sırayla.
  perform 1
  from public.payment_installments i
  join public.payment_plans p on p.id = i.payment_plan_id
  where p.organization_id = p_organization_id and p.party_id = p_party_id
  for update of i;

  -- Carideki net tahsilat: alacaklar eksi iadeler. Kapatma fonksiyonundaki
  -- hesabın birebir aynısı.
  select
    coalesce(sum(case
      when e.entry_type = 'credit' then e.amount
      when e.entry_type = 'debit' and e.source_type = 'adjustment' then -e.amount
      else 0
    end), 0)
  into v_available
  from public.account_entries e
  where e.organization_id = p_organization_id and e.party_id = p_party_id;

  select coalesce(sum(i.amount), 0)
  into v_paid_total
  from public.payment_installments i
  join public.payment_plans p on p.id = i.payment_plan_id
  where p.organization_id = p_organization_id
    and p.party_id = p_party_id
    and i.status = 'paid';

  if v_paid_total <= v_available then
    return;
  end if;

  for r in
    select i.id, i.amount
    from public.payment_installments i
    join public.payment_plans p on p.id = i.payment_plan_id
    where p.organization_id = p_organization_id
      and p.party_id = p_party_id
      and i.status = 'paid'
    order by i.due_date desc nulls first, i.installment_no desc
  loop
    exit when v_paid_total <= v_available;

    update public.payment_installments
    set status = 'pending', paid_at = null
    where id = r.id;

    v_paid_total := v_paid_total - r.amount;
  end loop;

  -- Açılan taksit varsa plan artık tamamlanmış sayılmaz.
  update public.payment_plans p
  set status = 'active', updated_at = now()
  where p.organization_id = p_organization_id
    and p.party_id = p_party_id
    and p.status = 'completed'
    and exists (
      select 1 from public.payment_installments i
      where i.payment_plan_id = p.id and i.status = 'pending'
    );
end
$function$;

revoke all on function private.arvo_unreconcile_party_installments(uuid, uuid) from public;

create or replace function private.arvo_account_entry_unreconcile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.party_id is not null then
    perform private.arvo_unreconcile_party_installments(old.organization_id, old.party_id);
  end if;
  return null;
end
$function$;

drop trigger if exists arvo_account_entry_unreconcile on public.account_entries;
create trigger arvo_account_entry_unreconcile
  after delete on public.account_entries
  for each row execute function private.arvo_account_entry_unreconcile();

-- İade de paranın çıkışıdır: kapatma hesabı iadeyi (debit/adjustment)
-- net tahsilattan düşüyor, ama 20260912131000'deki tetikleyici yalnızca
-- alacak eklenince çalıştığı için iade sonrası taksit "ödendi" kalıyordu.
-- Parası iade edilmiş taksit ödenmiş sayılmamalı.
create or replace function private.arvo_account_entry_refund_unreconcile()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.entry_type = 'debit' and new.source_type = 'adjustment' and new.party_id is not null then
    perform private.arvo_unreconcile_party_installments(new.organization_id, new.party_id);
  end if;
  return null;
end
$function$;

drop trigger if exists arvo_account_entry_refund_unreconcile on public.account_entries;
create trigger arvo_account_entry_refund_unreconcile
  after insert on public.account_entries
  for each row execute function private.arvo_account_entry_refund_unreconcile();
