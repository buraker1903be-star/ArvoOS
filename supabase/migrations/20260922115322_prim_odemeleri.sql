-- ============================================================
-- Prim ödemeleri: personelin cari hesabı
--
-- Prim tahakkuku zaten var (satış primi tahsilattan hesaplanıyor, operasyon
-- primi hr_operation_commissions'ta). Eksik olan ÖDEME tarafıydı: ekranda
-- "Ödenen prim" toplamı gösteriliyordu ama ödemeyi kaydedecek hiçbir yer
-- yoktu, yani o toplam hep sıfır kalıyordu.
--
-- Cari hesap mantığı: bir tarafta hak edilen primler, diğer tarafta yapılan
-- ödemeler, aradaki fark bakiye. Ödemeyi tek tek prim satırına bağlamıyoruz;
-- "Ahmet'e bu ay 8.000 ₺ ödedim" tek satırdır ve hangi primleri kapattığı
-- bakiyeden okunur. Satır satır eşleştirme kısmi ödemede (12 satırlık primi
-- tek havaleyle ödemek) kullanılamaz hale geliyordu.
--
-- Tutar kuruş cinsinden tamsayı. Tarih date: prim ödemesi gün bazlı bir
-- olaydır, saat tutmak Türkiye/UTC karışıklığından başka bir şey getirmez.
-- ============================================================

create table if not exists public.hr_commission_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Personel silinemez: ödeme kaydı mali bir kayıttır, sahibi kaybolmamalı.
  employee_id uuid not null references public.hr_employees(id) on delete restrict,
  amount bigint not null check (amount > 0),
  paid_on date not null,
  method text not null default 'havale'
    check (method in ('havale', 'nakit', 'mahsup', 'diger')),
  note text,
  -- Finansa düşen gider hareketi; kayıt silinirse bağ kopar ama ödeme durur.
  finance_transaction_id uuid references public.finance_transactions(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists hr_commission_payments_personel_idx
  on public.hr_commission_payments (organization_id, employee_id, paid_on desc);

alter table public.hr_commission_payments enable row level security;

-- Yazma yalnızca Kurum Sahibi ve Yönetici: prim ödemesi para hareketidir ve
-- finansa gider olarak düşer. Prim oranlarını da aynı roller değiştiriyor
-- (app/panel/hr/actions.ts); sunucu işlemi de bu kuralı ayrıca doğrular.
create policy "commission payments manageable by admins" on public.hr_commission_payments
  as permissive for all to authenticated
  using (private.arvo_is_org_admin(organization_id))
  with check (private.arvo_is_org_admin(organization_id));

-- Personel kendi prim ödemelerini görebilir: "bana ne ödendi" sorusunu
-- yöneticisine sormak zorunda kalmasın.
create policy "commission payments readable" on public.hr_commission_payments
  as permissive for select to authenticated
  using (
    private.arvo_is_privileged_member(organization_id)
    or exists (
      select 1 from public.hr_employees e
      where e.id = hr_commission_payments.employee_id
        and e.organization_id = hr_commission_payments.organization_id
        and e.user_id = (select auth.uid())
    )
  );

comment on table public.hr_commission_payments is
  'Personele yapılan prim ödemeleri. Tahakkukla birlikte prim cari hesabını oluşturur; tutar kuruş.';

notify pgrst, 'reload schema';
